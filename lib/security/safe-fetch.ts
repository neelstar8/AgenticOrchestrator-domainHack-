import "server-only";
import { Agent, request as undiciRequest } from "undici";

import { getEnv } from "@/lib/config/env";
import { getOutboundLimiters } from "./rate-limiter";
import {
  SsrfBlockedError,
  normalizeOutboundUrl,
  resolveAndPin,
  type ValidatedTarget,
} from "./ssrf-guard";

/**
 * The only way Sentinel ever talks to a third-party host.
 *
 * Guarantees:
 *   - Every hop, including each redirect, goes through the SSRF guard afresh.
 *   - The connection is made to the IP address the guard validated, not to
 *     whatever DNS says at socket time (DNS-rebinding defence).
 *   - Hard caps on time, bytes, redirects and concurrency, enforced while
 *     streaming so an endless or enormous response is abandoned early rather
 *     than buffered.
 *   - Per-host rate limiting.
 *   - No Sentinel credential, cookie or token is ever sent outbound.
 *   - Only the response head and body bytes are returned. Nothing is executed,
 *     no script runs, and no HTML is ever interpreted in a privileged context.
 *
 * Disabled unless SENTINEL_ALLOW_LIVE_FETCH=true. In the default demo
 * configuration this module is never even imported.
 */

export type SafeFetchFailureCode =
  | "DISABLED"
  | "BLOCKED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "TOO_LARGE"
  | "TOO_MANY_REDIRECTS"
  | "NETWORK_ERROR"
  | "CANCELLED";

export interface SafeFetchSuccess {
  ok: true;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>;
  /** Decoded body, truncated at the configured byte cap. */
  body: string;
  bytesRead: number;
  truncated: boolean;
  /** Every hop that was followed, each independently validated. */
  redirectChain: string[];
  durationMs: number;
  pinnedAddress: string;
}

export interface SafeFetchFailure {
  ok: false;
  code: SafeFetchFailureCode;
  message: string;
  /** Populated when at least one response was received before failing. */
  statusCode: number | null;
  durationMs: number;
  retryable: boolean;
}

export type SafeFetchResult = SafeFetchSuccess | SafeFetchFailure;

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Accept header sent upstream. Defaults to HTML/text. */
  accept?: string;
  signal?: AbortSignal;
}

const USER_AGENT =
  "Sentinel/1.0 (+regulatory domain intelligence; public-page inspection only)";

/** Headers Sentinel will read back. Everything else is discarded. */
const HEADERS_OF_INTEREST = [
  "content-type",
  "content-length",
  "last-modified",
  "etag",
  "location",
  "server",
  "x-powered-by",
  "content-security-policy",
  "strict-transport-security",
];

function failure(
  code: SafeFetchFailureCode,
  message: string,
  startedAt: number,
  options: { statusCode?: number | null; retryable?: boolean } = {},
): SafeFetchFailure {
  return {
    ok: false,
    code,
    message,
    statusCode: options.statusCode ?? null,
    durationMs: Date.now() - startedAt,
    retryable: options.retryable ?? false,
  };
}

/**
 * Builds a dispatcher pinned to one validated IP address.
 *
 * `connect.lookup` is overridden so the socket connects to the address the
 * SSRF guard approved. TLS still verifies the certificate against the real
 * hostname, because the request's Host and SNI remain the hostname.
 */
function createPinnedAgent(target: ValidatedTarget, timeoutMs: number): Agent {
  return new Agent({
    connect: {
      // Resolve every lookup to the single pinned address.
      lookup: (_hostname, _options, callback) => {
        callback(null, [
          { address: target.pinnedAddress, family: target.addressFamily },
        ]);
      },
      timeout: timeoutMs,
      servername: target.hostname,
    },
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    connectTimeout: timeoutMs,
    // No redirect interceptor is installed, so undici never follows a
    // redirect itself. Every hop is followed manually and revalidated below.
    pipelining: 0,
  });
}

/**
 * Fetches a public page safely.
 *
 * Redirects are followed manually, one hop at a time, so each destination is
 * re-validated. `undici`'s own redirect following is explicitly disabled.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const startedAt = Date.now();
  const env = getEnv();

  if (!env.SENTINEL_ALLOW_LIVE_FETCH) {
    return failure(
      "DISABLED",
      "Live outbound fetching is disabled (SENTINEL_ALLOW_LIVE_FETCH=false). No request was " +
        "made. Technical fields remain explicitly unchecked rather than being guessed.",
      startedAt,
    );
  }

  const timeoutMs = options.timeoutMs ?? env.SENTINEL_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? env.SENTINEL_FETCH_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? env.SENTINEL_FETCH_MAX_REDIRECTS;

  const { hostLimiter, semaphore } = getOutboundLimiters(
    env.SENTINEL_RATE_LIMIT_PER_HOST_PER_MINUTE,
    env.SENTINEL_FETCH_CONCURRENCY,
  );

  const deadline = startedAt + timeoutMs;
  const redirectChain: string[] = [];
  let currentUrl: string;

  try {
    currentUrl = normalizeOutboundUrl(rawUrl).toString();
  } catch (error) {
    if (error instanceof SsrfBlockedError) {
      return failure("BLOCKED", error.message, startedAt);
    }
    throw error;
  }

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (options.signal?.aborted) {
      return failure("CANCELLED", "The request was cancelled.", startedAt);
    }
    if (Date.now() >= deadline) {
      return failure("TIMEOUT", `Exceeded the ${timeoutMs}ms budget.`, startedAt, {
        retryable: true,
      });
    }

    // Re-validate this hop from scratch. A public host redirecting to a
    // private address is the attack this defends against.
    let target: ValidatedTarget;
    try {
      target = await resolveAndPin(normalizeOutboundUrl(currentUrl));
    } catch (error) {
      if (error instanceof SsrfBlockedError) {
        return failure(
          "BLOCKED",
          hop === 0
            ? error.message
            : `Redirect hop ${hop} to ${currentUrl} was refused: ${error.message}`,
          startedAt,
          { retryable: error.reason === "DNS_RESOLUTION_FAILED" },
        );
      }
      throw error;
    }

    const decision = hostLimiter.tryConsume(target.hostname);
    if (!decision.allowed) {
      return failure(
        "RATE_LIMITED",
        `Rate limit reached for ${target.hostname}. Retry in about ` +
          `${Math.ceil(decision.retryAfterMs / 1000)}s. The limit exists to avoid placing an ` +
          "unreasonable load on a third-party host.",
        startedAt,
        { retryable: true },
      );
    }

    const remainingMs = Math.max(1_000, deadline - Date.now());
    const agent = createPinnedAgent(target, remainingMs);

    try {
      const response = await semaphore.run(
        () =>
          undiciRequest(target.url.toString(), {
            method: "GET",
            dispatcher: agent,
            signal: options.signal,
            headersTimeout: remainingMs,
            bodyTimeout: remainingMs,
            headers: {
              // Deliberately minimal. No cookie, no authorization, no
              // Sentinel-identifying token: nothing of ours leaves the process.
              "user-agent": USER_AGENT,
              accept: options.accept ?? "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
              "accept-language": "en",
              "accept-encoding": "identity",
            },
          }),
        options.signal,
      );

      const headers: Record<string, string> = {};
      for (const key of HEADERS_OF_INTEREST) {
        const value = response.headers[key];
        if (typeof value === "string") headers[key] = value;
        else if (Array.isArray(value) && value[0]) headers[key] = value[0];
      }

      const isRedirect = [301, 302, 303, 307, 308].includes(response.statusCode);
      const location = headers.location;

      if (isRedirect && location) {
        // Drain so the socket is released, then validate the next hop.
        await response.body.dump();
        await agent.close();

        if (hop >= maxRedirects) {
          return failure(
            "TOO_MANY_REDIRECTS",
            `Stopped after ${maxRedirects} redirect(s) at ${currentUrl}.`,
            startedAt,
            { statusCode: response.statusCode },
          );
        }

        redirectChain.push(currentUrl);
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      // Stream with a hard byte cap, aborting rather than buffering a huge body.
      const chunks: Buffer[] = [];
      let bytesRead = 0;
      let truncated = false;

      try {
        for await (const chunk of response.body) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
          if (bytesRead + buffer.length > maxBytes) {
            chunks.push(buffer.subarray(0, Math.max(0, maxBytes - bytesRead)));
            bytesRead = maxBytes;
            truncated = true;
            break;
          }
          chunks.push(buffer);
          bytesRead += buffer.length;
          if (Date.now() >= deadline) {
            truncated = true;
            break;
          }
        }
      } finally {
        if (truncated) await response.body.dump().catch(() => undefined);
      }

      await agent.close();

      return {
        ok: true,
        finalUrl: currentUrl,
        statusCode: response.statusCode,
        headers,
        body: Buffer.concat(chunks).toString("utf8"),
        bytesRead,
        truncated,
        redirectChain,
        durationMs: Date.now() - startedAt,
        pinnedAddress: target.pinnedAddress,
      };
    } catch (error) {
      await agent.close().catch(() => undefined);

      if (options.signal?.aborted) {
        return failure("CANCELLED", "The request was cancelled.", startedAt);
      }
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout|aborted/i.test(message)) {
        return failure("TIMEOUT", `Request to ${target.hostname} timed out: ${message}`, startedAt, {
          retryable: true,
        });
      }
      return failure(
        "NETWORK_ERROR",
        `Request to ${target.hostname} failed: ${message}. Recorded as a failed check — nothing ` +
          "is inferred from it.",
        startedAt,
        { retryable: true },
      );
    }
  }

  return failure(
    "TOO_MANY_REDIRECTS",
    `Stopped after ${maxRedirects} redirect(s).`,
    startedAt,
  );
}
