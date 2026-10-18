/**
 * Provider interfaces.
 *
 * A provider is the boundary between Sentinel's orchestration logic and the
 * outside world. The orchestrator and the six agents depend only on these
 * interfaces, so adding a real search API or a real language model later is a
 * matter of registering a different implementation — no agent, service, route
 * or component changes.
 *
 * Two rules every implementation must honour:
 *
 *   1. `origin` tells the truth. A provider that did not actually contact an
 *      external service returns "SIMULATED_DEMO". The mock implementations in
 *      agents/mock are typed so they *cannot* return "LIVE_COLLECTED".
 *   2. A failed check is reported as a failure. No implementation may convert
 *      an error, a timeout or a refusal into a negative finding.
 */

import type { DataOrigin, DnsStatus, MatchType } from "@/lib/types/enums";

/** Everything a provider needs to behave safely and report itself honestly. */
export interface ProviderContext {
  /** Correlates provider calls with the scan and audit trail. */
  requestId: string;
  /** Abort signal honoured by every provider; cancellation must be prompt. */
  signal: AbortSignal;
  /** Wall-clock budget for the whole call. */
  timeoutMs: number;
}

export interface ProviderDescriptor {
  id: string;
  /** Human-readable name shown in Settings and in scan detail views. */
  label: string;
  /** What this implementation actually does, stated plainly. */
  description: string;
  /** True only when the provider can reach a real external service. */
  isLive: boolean;
  /** The origin every record from this provider carries. */
  origin: DataOrigin;
  /** Env vars that must be set for a live implementation to work. */
  requiredEnv: string[];
}

export interface ProviderMetadata {
  providerId: string;
  origin: DataOrigin;
  /** Present on every simulated result. Rendered in the UI, verbatim. */
  simulationNote?: string;
  /** Wall-clock duration of the provider call. */
  durationMs: number;
  /** Non-fatal problems, surfaced rather than swallowed. */
  warnings: string[];
}

/**
 * Providers return a result envelope rather than throwing for expected
 * failures, so a partial outcome ("3 of 5 hosts inspected, 2 timed out") can
 * be recorded accurately.
 */
export type ProviderResult<T> =
  | { ok: true; data: T; metadata: ProviderMetadata }
  | { ok: false; error: ProviderError; metadata: ProviderMetadata };

export interface ProviderError {
  code:
    | "NOT_CONFIGURED"
    | "TIMEOUT"
    | "RATE_LIMITED"
    | "BLOCKED_BY_POLICY"
    | "UPSTREAM_ERROR"
    | "INVALID_RESPONSE"
    | "CANCELLED";
  message: string;
  /** True when retrying the same call might succeed. */
  retryable: boolean;
  cause?: string;
}

export function providerOk<T>(data: T, metadata: ProviderMetadata): ProviderResult<T> {
  return { ok: true, data, metadata };
}

export function providerFailed<T>(
  error: ProviderError,
  metadata: ProviderMetadata,
): ProviderResult<T> {
  return { ok: false, error, metadata };
}

// ---------------------------------------------------------------------------
// 1. SearchProvider
// ---------------------------------------------------------------------------

export interface SearchQuery {
  /** Brand or platform name the operator entered. */
  brand: string;
  seedDomain: string | null;
  maxResults: number;
}

export interface SearchResultItem {
  url: string;
  hostname: string;
  title: string;
  snippet: string;
  /** Rank in the provider's result list, 1-based. */
  rank: number;
}

export interface SearchProvider {
  readonly descriptor: ProviderDescriptor;
  search(query: SearchQuery, context: ProviderContext): Promise<ProviderResult<SearchResultItem[]>>;
}

// ---------------------------------------------------------------------------
// 2. DomainDataProvider
// ---------------------------------------------------------------------------

export interface DomainResolutionRequest {
  fqdns: string[];
}

/**
 * One candidate's resolution outcome.
 *
 * `status: null` means the check was not performed — it is never a stand-in
 * for "does not exist".
 */
export interface DomainResolution {
  fqdn: string;
  status: DnsStatus | null;
  addressCount: number | null;
  checkedAt: string | null;
  /** Why the check was not performed, when it was not. */
  notCheckedReason: string | null;
}

export interface CertificateTransparencyEntry {
  fqdn: string;
  issuer: string;
  subjectCommonName: string;
  notBefore: string;
  notAfter: string;
  fingerprintSha256: string;
  loggedAt: string;
}

export interface DomainDataProvider {
  readonly descriptor: ProviderDescriptor;
  resolve(
    request: DomainResolutionRequest,
    context: ProviderContext,
  ): Promise<ProviderResult<DomainResolution[]>>;
  certificateTransparency(
    query: { brand: string; seedDomain: string | null; maxResults: number },
    context: ProviderContext,
  ): Promise<ProviderResult<CertificateTransparencyEntry[]>>;
}

// ---------------------------------------------------------------------------
// 3. WebsiteInspectionProvider
// ---------------------------------------------------------------------------

export interface InspectionRequest {
  fqdns: string[];
  /** Hard ceiling on bytes read per host. */
  maxBytesPerHost: number;
  maxRedirects: number;
}

/**
 * The result of inspecting one host.
 *
 * Every observation field is nullable. A null means "not observed", which the
 * registry renders as "Not checked". `error` being set means the inspection
 * failed — the caller must record the failure, not infer anything from it.
 */
export interface InspectionObservation {
  fqdn: string;
  observedAt: string;
  httpStatusCode: number | null;
  finalUrl: string | null;
  redirectedToUrl: string | null;
  title: string | null;
  description: string | null;
  language: string | null;
  /** Visible text excerpt, truncated. Never executed, never rendered as HTML. */
  textExcerpt: string | null;
  detectedTechnologies: string[];
  outboundHostnames: string[];
  certificate: {
    issuer: string;
    subjectCommonName: string;
    notBefore: string;
    notAfter: string;
    fingerprintSha256: string;
  } | null;
  bytesRead: number | null;
  error: { code: string; message: string } | null;
}

export interface WebsiteInspectionProvider {
  readonly descriptor: ProviderDescriptor;
  inspect(
    request: InspectionRequest,
    context: ProviderContext,
  ): Promise<ProviderResult<InspectionObservation[]>>;
}

// ---------------------------------------------------------------------------
// 4. RegulatorySourceProvider
// ---------------------------------------------------------------------------

export interface RegulatorySourceDescriptorInput {
  sourceId: string;
  authorityShortName: string;
  title: string;
  sourceUrl: string;
  /** False for a real authority whose content must not be invented. */
  isFixtureSource: boolean;
}

export interface RegulatoryCheckRequest {
  source: RegulatorySourceDescriptorInput;
  /** Domains and entity names to look for in the retrieved document. */
  terms: Array<{ term: string; domainId: string | null; kind: "domain" | "entity" }>;
}

export interface RegulatoryCheckOutcome {
  sourceId: string;
  startedAt: string;
  completedAt: string;
  httpStatusCode: number | null;
  bytesRetrieved: number | null;
  lastModifiedReported: string | null;
  /**
   * Terms that matched. An empty array alongside `ok: true` means a completed
   * check that found nothing — recorded as a checked non-match. It is never
   * rendered as authorisation.
   */
  matches: Array<{
    term: string;
    domainId: string | null;
    matchType: MatchType;
    confidence: number;
    context: string;
  }>;
  /** Terms explicitly looked for and not found. */
  checkedWithoutMatch: string[];
  note: string | null;
}

export interface RegulatorySourceProvider {
  readonly descriptor: ProviderDescriptor;
  check(
    request: RegulatoryCheckRequest,
    context: ProviderContext,
  ): Promise<ProviderResult<RegulatoryCheckOutcome>>;
}

// ---------------------------------------------------------------------------
// 5. LanguageModelProvider
// ---------------------------------------------------------------------------

export interface LanguageModelRequest<TSchema> {
  /** Stable identifier for the prompt, for logging and evaluation. */
  task: string;
  systemPrompt: string;
  userPrompt: string;
  /** Zod schema the response must satisfy. Unvalidated output is discarded. */
  schema: TSchema;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface LanguageModelUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  model: string;
}

export interface LanguageModelProvider {
  readonly descriptor: ProviderDescriptor;
  readonly isConfigured: boolean;
  /**
   * Returns structured output validated against the supplied schema.
   *
   * Model output is advisory. The service layer never allows it, on its own,
   * to set a review status, a priority above MEDIUM, or any legal
   * characterisation of a domain.
   */
  generateStructured<TOutput>(
    request: LanguageModelRequest<unknown>,
    context: ProviderContext,
  ): Promise<ProviderResult<{ output: TOutput; usage: LanguageModelUsage }>>;
}

// ---------------------------------------------------------------------------
// 6. ReportGenerationProvider
// ---------------------------------------------------------------------------

export interface ReportDocumentSection {
  heading: string;
  /** Paragraphs rendered as body text. */
  paragraphs: string[];
  /** Optional simple table. */
  table?: { headers: string[]; rows: string[][] };
  /** Rendered in a visually distinct caution block. */
  callout?: string;
}

export interface ReportDocumentInput {
  reference: string;
  title: string;
  organisationName: string;
  preparedByName: string;
  preparedAt: string;
  approvedByName: string | null;
  receivingAuthorityLabel: string;
  statusLabel: string;
  /** Printed prominently on the cover when the content is simulated. */
  simulationNotice: string | null;
  sections: ReportDocumentSection[];
  footerNote: string;
}

export interface ReportGenerationProvider {
  readonly descriptor: ProviderDescriptor;
  renderPdf(input: ReportDocumentInput, context: ProviderContext): Promise<ProviderResult<Uint8Array>>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface ProviderRegistry {
  search: SearchProvider;
  domainData: DomainDataProvider;
  websiteInspection: WebsiteInspectionProvider;
  regulatorySource: RegulatorySourceProvider;
  languageModel: LanguageModelProvider;
  reportGeneration: ReportGenerationProvider;
}

/** Creates a provider context with a timeout-linked abort signal. */
export function createProviderContext(
  requestId: string,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): { context: ProviderContext; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Provider timeout")), timeoutMs);

  const onParentAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort(parentSignal.reason);
    else parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  return {
    context: { requestId, signal: controller.signal, timeoutMs },
    dispose: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", onParentAbort);
    },
  };
}
