import "server-only";

import { getEnv, type SentinelEnv } from "@/lib/config/env";
import {
  MockDomainDataProvider,
  MockLanguageModelProvider,
  MockRegulatorySourceProvider,
  MockSearchProvider,
  MockWebsiteInspectionProvider,
} from "@/agents/mock/mock-providers";
import { PdfReportGenerationProvider } from "@/agents/implementations/pdf-report-provider";
import type { ProviderDescriptor, ProviderRegistry } from "./types";

/**
 * Provider registry — the dependency-injection seam.
 *
 * The orchestrator and every agent take a `ProviderRegistry` and never
 * construct a provider themselves. Resolution happens here, once, from
 * configuration, which is what makes "add a real search API later" a change
 * to this file rather than a change to the application.
 *
 * Resolution rules, in order:
 *
 *   1. A live implementation is used only when its credentials are present
 *      AND the relevant feature flag is on. A half-configured provider falls
 *      back to the simulated one rather than failing at scan time.
 *   2. Falling back is never silent: `describeRegistry()` reports exactly
 *      which implementation is active, and Settings renders it.
 *   3. Report generation is genuinely live in every mode — pdf-lib runs
 *      locally and needs no credentials, so exported PDFs are real documents.
 */

export interface ResolvedRegistry extends ProviderRegistry {
  describe(): ProviderDescriptor[];
}

function resolveSearchProvider(env: SentinelEnv) {
  const configured =
    env.SEARCH_PROVIDER !== "mock" &&
    Boolean(env.SEARCH_API_KEY) &&
    (env.SEARCH_PROVIDER !== "google-cse" || Boolean(env.SEARCH_ENGINE_ID));

  if (!configured) return new MockSearchProvider();

  // A live search adapter plugs in here. The interface is settled; see
  // docs/search-providers.md for the contract and the expected response
  // mapping. Until an implementation is added, an explicitly-configured but
  // unimplemented provider still falls back rather than pretending.
  return new MockSearchProvider();
}

function resolveDomainDataProvider(env: SentinelEnv) {
  const configured = env.DOMAIN_DATA_PROVIDER !== "mock" && Boolean(env.CERT_TRANSPARENCY_URL);
  if (!configured) return new MockDomainDataProvider();
  return new MockDomainDataProvider();
}

function resolveWebsiteInspectionProvider(env: SentinelEnv) {
  if (!env.SENTINEL_ALLOW_LIVE_FETCH) return new MockWebsiteInspectionProvider();
  // Live inspection is implemented in
  // agents/implementations/http-website-inspection-provider.ts and is loaded
  // lazily by createProviderRegistryAsync so demo mode never imports the
  // outbound HTTP stack at all.
  return new MockWebsiteInspectionProvider();
}

function resolveRegulatorySourceProvider(env: SentinelEnv) {
  const configured = env.REGULATORY_SOURCE_PROVIDER !== "mock" && env.SENTINEL_ALLOW_LIVE_FETCH;
  if (!configured) return new MockRegulatorySourceProvider();
  return new MockRegulatorySourceProvider();
}

function resolveLanguageModelProvider(env: SentinelEnv) {
  if (!env.GEMINI_API_KEY) return new MockLanguageModelProvider();
  // The real adapter is loaded lazily in createProviderRegistryAsync so the
  // Gemini SDK is never imported when no key is configured.
  return new MockLanguageModelProvider();
}

/** Synchronous registry. Always resolves to credential-free implementations. */
export function createProviderRegistry(env: SentinelEnv = getEnv()): ResolvedRegistry {
  const search = resolveSearchProvider(env);
  const domainData = resolveDomainDataProvider(env);
  const websiteInspection = resolveWebsiteInspectionProvider(env);
  const regulatorySource = resolveRegulatorySourceProvider(env);
  const languageModel = resolveLanguageModelProvider(env);
  const reportGeneration = new PdfReportGenerationProvider();

  return {
    search,
    domainData,
    websiteInspection,
    regulatorySource,
    languageModel,
    reportGeneration,
    describe: () => [
      search.descriptor,
      domainData.descriptor,
      websiteInspection.descriptor,
      regulatorySource.descriptor,
      languageModel.descriptor,
      reportGeneration.descriptor,
    ],
  };
}

/**
 * Asynchronous registry that can load live adapters.
 *
 * Live modules are imported dynamically so that, in the default demo
 * configuration, the Gemini SDK and the outbound HTTP stack are never loaded
 * into the process at all.
 */
export async function createProviderRegistryAsync(
  env: SentinelEnv = getEnv(),
): Promise<ResolvedRegistry> {
  const registry = createProviderRegistry(env);

  if (env.GEMINI_API_KEY) {
    const { GeminiLanguageModelProvider } = await import(
      "@/agents/implementations/gemini-language-model-provider"
    );
    registry.languageModel = new GeminiLanguageModelProvider({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      timeoutMs: env.GEMINI_TIMEOUT_MS,
      maxOutputTokens: env.GEMINI_MAX_OUTPUT_TOKENS,
    });
  }

  if (env.SENTINEL_ALLOW_LIVE_FETCH) {
    const { HttpWebsiteInspectionProvider } = await import(
      "@/agents/implementations/http-website-inspection-provider"
    );
    registry.websiteInspection = new HttpWebsiteInspectionProvider();

    if (env.REGULATORY_SOURCE_PROVIDER !== "mock") {
      const { HttpRegulatorySourceProvider } = await import(
        "@/agents/implementations/http-regulatory-source-provider"
      );
      registry.regulatorySource = new HttpRegulatorySourceProvider();
    }
  }

  const descriptors = [
    registry.search.descriptor,
    registry.domainData.descriptor,
    registry.websiteInspection.descriptor,
    registry.regulatorySource.descriptor,
    registry.languageModel.descriptor,
    registry.reportGeneration.descriptor,
  ];
  registry.describe = () => descriptors;

  return registry;
}
