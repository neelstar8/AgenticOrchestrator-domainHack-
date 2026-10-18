import "server-only";
import { z } from "zod";

/**
 * Server-side environment configuration.
 *
 * Every value is optional so the application boots in demo mode with no
 * configuration at all. Validation is lenient about absence and strict about
 * malformed values: a nonsense number is a startup error, a missing credential
 * simply marks the corresponding provider "not configured".
 *
 * This module is `server-only`. Nothing here is ever serialised to the client;
 * see lib/config/public-config.ts for the safe subset.
 */

const booleanish = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(["true", "false", "1", "0", "yes", "no", ""]))
  .transform((value) => value === "true" || value === "1" || value === "yes");

const intInRange = (min: number, max: number, fallback: number) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return fallback;
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        ctx.addIssue({ code: "custom", message: `must be an integer, received "${value}"` });
        return z.NEVER;
      }
      if (parsed < min || parsed > max) {
        ctx.addIssue({ code: "custom", message: `must be between ${min} and ${max}` });
        return z.NEVER;
      }
      return parsed;
    });

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  SENTINEL_MODE: z.enum(["demo", "live"]).default("demo"),
  SENTINEL_DATA_DIR: z.string().trim().default(".data"),

  SESSION_SECRET: optionalString,
  SESSION_TTL_SECONDS: intInRange(300, 60 * 60 * 24 * 30, 28_800).default(28800),

  DATABASE_URL: optionalString,

  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: z.string().trim().default("gemini-2.5-pro"),
  GEMINI_TIMEOUT_MS: intInRange(1_000, 120_000, 30_000).default(30000),
  GEMINI_MAX_OUTPUT_TOKENS: intInRange(256, 65_536, 4_096).default(4096),
  GOOGLE_ADK_PROJECT: optionalString,
  GOOGLE_ADK_LOCATION: z.string().trim().default("us-central1"),

  SEARCH_PROVIDER: z.enum(["mock", "google-cse", "bing", "serpapi"]).default("mock"),
  SEARCH_API_KEY: optionalString,
  SEARCH_ENGINE_ID: optionalString,
  SEARCH_RESULTS_PER_QUERY: intInRange(1, 100, 25).default(25),

  DOMAIN_DATA_PROVIDER: z.enum(["mock", "http"]).default("mock"),
  DOMAIN_DATA_API_KEY: optionalString,
  CERT_TRANSPARENCY_URL: optionalString,

  REGULATORY_SOURCE_PROVIDER: z.enum(["mock", "http"]).default("mock"),
  REGULATORY_SOURCE_URL: optionalString,
  REGULATORY_SOURCE_API_KEY: optionalString,

  REDIS_URL: optionalString,

  SENTINEL_ALLOW_LIVE_FETCH: booleanish.default(false),
  SENTINEL_FETCH_TIMEOUT_MS: intInRange(500, 60_000, 8_000).default(8000),
  SENTINEL_FETCH_MAX_BYTES: intInRange(1_024, 64 * 1024 * 1024, 2_097_152).default(2097152),
  SENTINEL_FETCH_MAX_REDIRECTS: intInRange(0, 10, 3).default(3),
  SENTINEL_FETCH_CONCURRENCY: intInRange(1, 32, 4).default(4),
  SENTINEL_RATE_LIMIT_PER_HOST_PER_MINUTE: intInRange(1, 600, 10).default(10),

  SENTINEL_MAX_CANDIDATES_PER_SCAN: intInRange(1, 2_000, 250).default(250),
  SENTINEL_MAX_CONCURRENT_SCANS: intInRange(1, 20, 3).default(3),

  SENTINEL_ALLOW_DEV_RESET: booleanish.default(false),
});

export type SentinelEnv = z.infer<typeof envSchema>;

/**
 * Values that are strings in the schema but may be genuinely absent from
 * process.env. Zod `.default()` only applies to `undefined`, so empty strings
 * are normalised away first.
 */
function readRawEnv(): Record<string, string | undefined> {
  const keys = Object.keys(envSchema.shape);
  const raw: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = process.env[key];
    raw[key] = value === undefined || value.trim() === "" ? undefined : value;
  }
  // NODE_ENV is set by the runtime, not by .env.local.
  raw.NODE_ENV = process.env.NODE_ENV ?? "development";
  return raw;
}

let cached: SentinelEnv | null = null;

export function getEnv(): SentinelEnv {
  if (cached) return cached;

  const parsed = envSchema.safeParse(readRawEnv());

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid Sentinel environment configuration:\n${details}\n\n` +
        "See .env.example. Every variable is optional — remove the offending " +
        "value to fall back to its documented default.",
    );
  }

  cached = parsed.data;
  return cached;
}

/** Test helper: forget the memoised environment so a new one can be read. */
export function resetEnvCache(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// Derived configuration
// ---------------------------------------------------------------------------

export type ProviderId =
  | "demoAgents"
  | "languageModel"
  | "search"
  | "domainData"
  | "regulatorySources"
  | "database"
  | "jobQueue"
  | "liveFetch";

export type ProviderState = "available" | "not-configured" | "disabled";

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  state: ProviderState;
  /** Shown verbatim in Settings. Must never overstate what is working. */
  detail: string;
  /** Environment variables an operator has to set to move this to available. */
  requiredEnv: string[];
  docsPath: string;
}

export function getProviderStatuses(env: SentinelEnv = getEnv()): ProviderStatus[] {
  const geminiConfigured = Boolean(env.GEMINI_API_KEY);
  const searchConfigured =
    env.SEARCH_PROVIDER !== "mock" &&
    Boolean(env.SEARCH_API_KEY) &&
    (env.SEARCH_PROVIDER !== "google-cse" || Boolean(env.SEARCH_ENGINE_ID));
  const domainDataConfigured =
    env.DOMAIN_DATA_PROVIDER !== "mock" && Boolean(env.CERT_TRANSPARENCY_URL);
  const regulatoryConfigured =
    env.REGULATORY_SOURCE_PROVIDER !== "mock" && env.SENTINEL_ALLOW_LIVE_FETCH;

  return [
    {
      id: "demoAgents",
      label: "Demo provider",
      state: "available",
      detail:
        "Simulated agents over deterministic local fixtures. Every record it " +
        "produces is tagged SIMULATED_DEMO and is not a real-world finding.",
      requiredEnv: [],
      docsPath: "docs/demo-mode.md",
    },
    {
      id: "languageModel",
      label: "Gemini (language model)",
      state: geminiConfigured ? "available" : "not-configured",
      detail: geminiConfigured
        ? `Configured for model ${env.GEMINI_MODEL}. Model output is validated with Zod and can never, on its own, set a legal determination on a domain.`
        : "Not configured. No Gemini request has been or can be made. Relationship and report drafting use the simulated provider.",
      requiredEnv: ["GEMINI_API_KEY", "GEMINI_MODEL"],
      docsPath: "docs/gemini-adk-integration.md",
    },
    {
      id: "search",
      label: "Search discovery API",
      state: searchConfigured ? "available" : "not-configured",
      detail: searchConfigured
        ? `Configured provider: ${env.SEARCH_PROVIDER}.`
        : "Not configured. Search-index discovery returns simulated candidates only.",
      requiredEnv:
        env.SEARCH_PROVIDER === "google-cse"
          ? ["SEARCH_PROVIDER", "SEARCH_API_KEY", "SEARCH_ENGINE_ID"]
          : ["SEARCH_PROVIDER", "SEARCH_API_KEY"],
      docsPath: "docs/search-providers.md",
    },
    {
      id: "domainData",
      label: "Domain / certificate-transparency data",
      state: domainDataConfigured ? "available" : "not-configured",
      detail: domainDataConfigured
        ? "Configured. Candidate validation uses the configured data source."
        : "Not configured. Domain variations are generated locally as candidates for verification and are not resolved.",
      requiredEnv: ["DOMAIN_DATA_PROVIDER", "CERT_TRANSPARENCY_URL"],
      docsPath: "docs/search-providers.md",
    },
    {
      id: "regulatorySources",
      label: "Live regulatory sources",
      state: regulatoryConfigured ? "available" : "not-configured",
      detail: regulatoryConfigured
        ? "Configured. Source checks perform real retrievals through the safe-fetch layer."
        : "Not configured. Source checks are simulated; no official publication is retrieved and no official warning is ever synthesised.",
      requiredEnv: ["REGULATORY_SOURCE_PROVIDER", "SENTINEL_ALLOW_LIVE_FETCH"],
      docsPath: "docs/architecture.md",
    },
    {
      id: "database",
      label: "PostgreSQL (Prisma)",
      state: env.DATABASE_URL
        ? env.SENTINEL_MODE === "live"
          ? "available"
          : "disabled"
        : "not-configured",
      detail: env.DATABASE_URL
        ? env.SENTINEL_MODE === "live"
          ? "Connected through the Prisma repository adapter."
          : "DATABASE_URL is set but SENTINEL_MODE is demo, so the file-backed adapter is in use."
        : `Not configured. Using the file-backed demo repository at ${env.SENTINEL_DATA_DIR}/.`,
      requiredEnv: ["DATABASE_URL", "SENTINEL_MODE"],
      docsPath: "docs/database.md",
    },
    {
      id: "jobQueue",
      label: "Redis / BullMQ job queue",
      state: env.REDIS_URL ? "available" : "not-configured",
      detail: env.REDIS_URL
        ? "Configured. Long-running scans can be moved off the request path."
        : "Not configured. Scans run in-process, which is sufficient for the demo workflow.",
      requiredEnv: ["REDIS_URL"],
      docsPath: "docs/architecture.md",
    },
    {
      id: "liveFetch",
      label: "Live website inspection",
      state: env.SENTINEL_ALLOW_LIVE_FETCH ? "available" : "disabled",
      detail: env.SENTINEL_ALLOW_LIVE_FETCH
        ? "Enabled. Outbound requests pass through the SSRF guard, timeout, size and rate limits in lib/security."
        : "Disabled by default. No request is made to any third-party host; technical fields stay explicitly unchecked.",
      requiredEnv: ["SENTINEL_ALLOW_LIVE_FETCH"],
      docsPath: "docs/security-checklist.md",
    },
  ];
}

export function isDemoMode(env: SentinelEnv = getEnv()): boolean {
  return env.SENTINEL_MODE === "demo" || !env.DATABASE_URL;
}

/**
 * True when the session secret is a real configured secret rather than an
 * ephemeral development fallback. Surfaced in the UI so a demo session is never
 * presented as production-secure authentication.
 */
export function hasConfiguredSessionSecret(env: SentinelEnv = getEnv()): boolean {
  return Boolean(env.SESSION_SECRET && env.SESSION_SECRET.length >= 32);
}

export function assertProductionReady(env: SentinelEnv = getEnv()): void {
  if (env.NODE_ENV !== "production") return;
  const problems: string[] = [];
  if (!hasConfiguredSessionSecret(env)) {
    problems.push("SESSION_SECRET must be set to at least 32 characters in production.");
  }
  if (env.SENTINEL_ALLOW_DEV_RESET) {
    problems.push("SENTINEL_ALLOW_DEV_RESET must not be enabled in production.");
  }
  if (problems.length > 0) {
    throw new Error(
      `Sentinel refused to start in production:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
}
