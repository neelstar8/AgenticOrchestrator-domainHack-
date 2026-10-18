import "server-only";
import { getEnv, getProviderStatuses, hasConfiguredSessionSecret, type ProviderStatus } from "./env";

/**
 * The subset of configuration that is safe to serialise to the browser.
 *
 * Deliberately contains no credential values — only booleans describing
 * whether something is configured, plus non-secret limits. This is the only
 * configuration object a Client Component ever receives.
 */
export interface PublicConfig {
  mode: "demo" | "live";
  isDemoMode: boolean;
  /** True when scan results are produced by the simulated agent provider. */
  usesSimulatedAgents: boolean;
  /** False when the session secret is an ephemeral development fallback. */
  sessionSecretConfigured: boolean;
  liveFetchEnabled: boolean;
  devResetEnabled: boolean;
  limits: {
    maxCandidatesPerScan: number;
    maxConcurrentScans: number;
    fetchTimeoutMs: number;
    fetchMaxBytes: number;
    fetchMaxRedirects: number;
    fetchConcurrency: number;
    rateLimitPerHostPerMinute: number;
    sessionTtlSeconds: number;
  };
  providers: Array<Pick<ProviderStatus, "id" | "label" | "state" | "detail" | "requiredEnv" | "docsPath">>;
  appVersion: string;
}

export function getPublicConfig(): PublicConfig {
  const env = getEnv();
  const providers = getProviderStatuses(env);
  const languageModel = providers.find((p) => p.id === "languageModel");
  const search = providers.find((p) => p.id === "search");

  return {
    mode: env.SENTINEL_MODE,
    isDemoMode: env.SENTINEL_MODE === "demo" || !env.DATABASE_URL,
    usesSimulatedAgents:
      languageModel?.state !== "available" || search?.state !== "available",
    sessionSecretConfigured: hasConfiguredSessionSecret(env),
    liveFetchEnabled: env.SENTINEL_ALLOW_LIVE_FETCH,
    devResetEnabled: env.SENTINEL_ALLOW_DEV_RESET && env.NODE_ENV !== "production",
    limits: {
      maxCandidatesPerScan: env.SENTINEL_MAX_CANDIDATES_PER_SCAN,
      maxConcurrentScans: env.SENTINEL_MAX_CONCURRENT_SCANS,
      fetchTimeoutMs: env.SENTINEL_FETCH_TIMEOUT_MS,
      fetchMaxBytes: env.SENTINEL_FETCH_MAX_BYTES,
      fetchMaxRedirects: env.SENTINEL_FETCH_MAX_REDIRECTS,
      fetchConcurrency: env.SENTINEL_FETCH_CONCURRENCY,
      rateLimitPerHostPerMinute: env.SENTINEL_RATE_LIMIT_PER_HOST_PER_MINUTE,
      sessionTtlSeconds: env.SESSION_TTL_SECONDS,
    },
    providers: providers.map(({ id, label, state, detail, requiredEnv, docsPath }) => ({
      id,
      label,
      state,
      detail,
      requiredEnv,
      docsPath,
    })),
    appVersion: "1.0.0-milestone1",
  };
}
