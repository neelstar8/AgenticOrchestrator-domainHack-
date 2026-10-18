import "server-only";
import { z } from "zod";

import type {
  LanguageModelProvider,
  LanguageModelRequest,
  LanguageModelUsage,
  ProviderContext,
  ProviderDescriptor,
  ProviderResult,
} from "@/agents/providers/types";
import { providerFailed, providerOk } from "@/agents/providers/types";

/**
 * Gemini adapter — the isolated AI integration boundary.
 *
 * This is the ONLY module in Sentinel that talks to a language model. Nothing
 * else imports an AI SDK, and it is loaded dynamically, so with no key
 * configured the Gemini code path is never even parsed.
 *
 * It calls the Gemini REST `generateContent` endpoint directly rather than
 * pulling in an SDK, so the dependency surface stays small and the request and
 * response shapes are visible and auditable in one file.
 *
 * What this adapter provides, as required for the live phase:
 *   - provider configuration and model selection
 *   - API-key validation (shape only; a key is never logged)
 *   - a hard timeout and cancellation
 *   - rate-limit handling with bounded exponential backoff
 *   - token-usage tracking from usageMetadata
 *   - STRUCTURED OUTPUT VALIDATED WITH ZOD — unvalidated output is discarded,
 *     never passed on
 *   - redacted logging: no key, no prompt, no completion is ever logged
 *   - an explicit failure result so callers fall back rather than guess
 *
 * The hard rule the rest of the application enforces around it: model output
 * is advisory. It cannot set a review status, cannot escalate a priority above
 * MEDIUM (see ScanOrchestrator.clampAgentPriority), and cannot mark any domain
 * illegal, unauthorised or blocked. Those require a human reviewer.
 */

export interface GeminiProviderConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  /** Override for testing or for a regional endpoint. */
  baseUrl?: string;
  maxRetries?: number;
}

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/** Shape of the subset of the Gemini response Sentinel relies on. */
const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(z.object({ text: z.string().optional() })).optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      totalTokenCount: z.number().optional(),
    })
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  error: z.object({ code: z.number().optional(), message: z.string().optional() }).optional(),
});

/** Validates the key's shape without ever logging or echoing it. */
export function isPlausibleGeminiKey(apiKey: string): boolean {
  return /^[A-Za-z0-9_-]{20,}$/.test(apiKey.trim());
}

/** Redacts anything that looks like a credential before it reaches a log. */
export function redact(value: string): string {
  return value
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "AIza***REDACTED***")
    .replace(/(key=)[^&\s]+/gi, "$1***REDACTED***")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1***REDACTED***");
}

export class GeminiLanguageModelProvider implements LanguageModelProvider {
  readonly isConfigured: boolean;
  readonly descriptor: ProviderDescriptor;

  private readonly config: Required<Omit<GeminiProviderConfig, "baseUrl">> & { baseUrl: string };

  constructor(config: GeminiProviderConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model,
      timeoutMs: config.timeoutMs,
      maxOutputTokens: config.maxOutputTokens,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      maxRetries: config.maxRetries ?? 2,
    };

    this.isConfigured = isPlausibleGeminiKey(config.apiKey);

    this.descriptor = {
      id: "gemini-language-model",
      label: `Gemini (${config.model})`,
      description: this.isConfigured
        ? `Configured for ${config.model}. Output is validated with Zod before use and is treated ` +
          "as advisory: it cannot set a review status or any legal characterisation of a domain."
        : "A GEMINI_API_KEY is present but does not have the expected shape, so the provider is " +
          "treated as not configured rather than failing at scan time.",
      isLive: this.isConfigured,
      origin: "LIVE_COLLECTED",
      requiredEnv: ["GEMINI_API_KEY", "GEMINI_MODEL"],
    };
  }

  async generateStructured<TOutput>(
    request: LanguageModelRequest<unknown>,
    context: ProviderContext,
  ): Promise<ProviderResult<{ output: TOutput; usage: LanguageModelUsage }>> {
    const started = Date.now();

    if (!this.isConfigured) {
      return providerFailed(
        {
          code: "NOT_CONFIGURED",
          message:
            "GEMINI_API_KEY is not a valid key shape, so no request was attempted. The caller " +
            "should fall back to deterministic analysis and label it as such.",
          retryable: false,
        },
        this.metadata(started),
      );
    }

    const schema = request.schema;
    if (!(schema instanceof z.ZodType)) {
      return providerFailed(
        {
          code: "INVALID_RESPONSE",
          message:
            "A Zod schema is required. Sentinel will not accept unvalidated model output.",
          retryable: false,
        },
        this.metadata(started),
      );
    }

    let lastError: { code: ProviderErrorCode; message: string; retryable: boolean } | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      if (context.signal.aborted) {
        return providerFailed(
          { code: "CANCELLED", message: "The request was cancelled.", retryable: false },
          this.metadata(started),
        );
      }

      if (attempt > 0) {
        // Bounded exponential backoff with a deterministic jitter band.
        const backoffMs = Math.min(8_000, 500 * 2 ** (attempt - 1));
        const settled = await sleep(backoffMs, context.signal);
        if (!settled) {
          return providerFailed(
            { code: "CANCELLED", message: "Cancelled while backing off.", retryable: false },
            this.metadata(started),
          );
        }
      }

      const outcome = await this.callOnce(request, schema, context);

      if (outcome.kind === "ok") {
        return providerOk(
          { output: outcome.output as TOutput, usage: outcome.usage },
          this.metadata(started, outcome.warnings),
        );
      }

      lastError = outcome.error;
      if (!outcome.error.retryable) break;
    }

    return providerFailed(
      lastError ?? {
        code: "UPSTREAM_ERROR",
        message: "The Gemini request failed for an unknown reason.",
        retryable: false,
      },
      this.metadata(started),
    );
  }

  private metadata(started: number, warnings: string[] = []) {
    return {
      providerId: this.descriptor.id,
      origin: "LIVE_COLLECTED" as const,
      durationMs: Date.now() - started,
      warnings,
    };
  }

  private async callOnce(
    request: LanguageModelRequest<unknown>,
    schema: z.ZodType,
    context: ProviderContext,
  ): Promise<
    | { kind: "ok"; output: unknown; usage: LanguageModelUsage; warnings: string[] }
    | { kind: "error"; error: { code: ProviderErrorCode; message: string; retryable: boolean } }
  > {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const onParentAbort = () => controller.abort();
    context.signal.addEventListener("abort", onParentAbort, { once: true });

    try {
      const url =
        `${this.config.baseUrl}/models/${encodeURIComponent(this.config.model)}:generateContent`;

      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          // Header rather than a query parameter, so the key cannot end up in
          // an access log or an error message containing the URL.
          "x-goog-api-key": this.config.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
          generationConfig: {
            temperature: request.temperature ?? 0.1,
            maxOutputTokens: request.maxOutputTokens ?? this.config.maxOutputTokens,
            responseMimeType: "application/json",
          },
        }),
      });

      if (response.status === 429) {
        return {
          kind: "error",
          error: {
            code: "RATE_LIMITED",
            message: "Gemini returned 429. Backing off and retrying.",
            retryable: true,
          },
        };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          kind: "error",
          error: {
            code: "NOT_CONFIGURED",
            message:
              `Gemini rejected the credentials (HTTP ${response.status}). Check GEMINI_API_KEY ` +
              "and that the Generative Language API is enabled for the project.",
            retryable: false,
          },
        };
      }
      if (response.status >= 500) {
        return {
          kind: "error",
          error: {
            code: "UPSTREAM_ERROR",
            message: `Gemini returned HTTP ${response.status}.`,
            retryable: true,
          },
        };
      }

      const payload: unknown = await response.json().catch(() => null);
      const parsed = geminiResponseSchema.safeParse(payload);

      if (!parsed.success) {
        return {
          kind: "error",
          error: {
            code: "INVALID_RESPONSE",
            message:
              "The Gemini response did not match the expected envelope shape. The output was " +
              "discarded rather than used.",
            retryable: false,
          },
        };
      }

      if (parsed.data.error) {
        return {
          kind: "error",
          error: {
            code: "UPSTREAM_ERROR",
            message: redact(
              `Gemini error ${parsed.data.error.code ?? "?"}: ${parsed.data.error.message ?? "unknown"}`,
            ),
            retryable: (parsed.data.error.code ?? 0) >= 500,
          },
        };
      }

      const blockReason = parsed.data.promptFeedback?.blockReason;
      if (blockReason) {
        return {
          kind: "error",
          error: {
            code: "BLOCKED_BY_POLICY",
            message: `Gemini declined to answer (${blockReason}). No output was produced.`,
            retryable: false,
          },
        };
      }

      const text = parsed.data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("");

      if (!text || text.trim() === "") {
        return {
          kind: "error",
          error: {
            code: "INVALID_RESPONSE",
            message: "Gemini returned an empty completion.",
            retryable: true,
          },
        };
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return {
          kind: "error",
          error: {
            code: "INVALID_RESPONSE",
            message:
              "Gemini returned text that is not valid JSON despite a JSON response type being " +
              "requested. The output was discarded.",
            retryable: true,
          },
        };
      }

      // The decisive step: model output that fails the caller's schema is
      // thrown away. It is never coerced, patched or partially accepted.
      const validated = schema.safeParse(json);
      if (!validated.success) {
        return {
          kind: "error",
          error: {
            code: "INVALID_RESPONSE",
            message:
              "Gemini output failed schema validation and was discarded: " +
              validated.error.issues
                .slice(0, 5)
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join("; "),
            retryable: true,
          },
        };
      }

      const warnings: string[] = [];
      const finishReason = parsed.data.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== "STOP") {
        warnings.push(
          `Gemini finished with reason "${finishReason}"; the output may be incomplete.`,
        );
      }

      return {
        kind: "ok",
        output: validated.data,
        usage: {
          inputTokens: parsed.data.usageMetadata?.promptTokenCount ?? null,
          outputTokens: parsed.data.usageMetadata?.candidatesTokenCount ?? null,
          model: this.config.model,
        },
        warnings,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (controller.signal.aborted) {
        return {
          kind: "error",
          error: {
            code: "TIMEOUT",
            message: `The Gemini request exceeded ${this.config.timeoutMs}ms.`,
            retryable: true,
          },
        };
      }
      return {
        kind: "error",
        error: {
          code: "UPSTREAM_ERROR",
          // Redacted so a URL or header in a transport error cannot leak a key.
          message: redact(`Gemini transport error: ${message}`),
          retryable: true,
        },
      };
    } finally {
      clearTimeout(timeout);
      context.signal.removeEventListener("abort", onParentAbort);
    }
  }
}

type ProviderErrorCode =
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "BLOCKED_BY_POLICY"
  | "UPSTREAM_ERROR"
  | "INVALID_RESPONSE"
  | "CANCELLED";

function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
