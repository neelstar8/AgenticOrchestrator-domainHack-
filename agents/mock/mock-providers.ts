/**
 * Simulated provider implementations.
 *
 * These are what make Sentinel runnable with zero credentials. They are also
 * the place where it would be easiest to accidentally lie, so the design makes
 * lying structurally difficult:
 *
 *   * `SIMULATED_ORIGIN` is a narrowed literal type. These providers cannot
 *     return "LIVE_COLLECTED" — it is a type error, not a convention.
 *   * Every metadata envelope carries a `simulationNote` that the UI renders
 *     verbatim next to the data.
 *   * No provider here performs any network, DNS or filesystem I/O. The only
 *     thing they wait on is a timer, so "the request took 2.1s" is honest
 *     about being a simulated delay and nothing is secretly contacted.
 *   * The regulatory provider REFUSES to synthesise content for a real
 *     authority. Asked to check a non-fixture source, it returns
 *     BLOCKED_BY_POLICY rather than inventing a warning.
 */

import {
  DEMO_BASE_INSTANT,
  hashString,
  seededRandom,
  type SeededRandom,
} from "@/lib/utils/deterministic";
import { brandSimilarity, generateDomainCandidates, tryNormalizeDomain } from "@/lib/utils/domain-name";
import { SIMULATION_NOTICE } from "@/lib/config/constants";
import type { DataOrigin } from "@/lib/types/enums";
import type {
  CertificateTransparencyEntry,
  DomainDataProvider,
  DomainResolution,
  InspectionObservation,
  LanguageModelProvider,
  ProviderContext,
  ProviderDescriptor,
  ProviderMetadata,
  ProviderResult,
  RegulatoryCheckOutcome,
  RegulatorySourceProvider,
  SearchProvider,
  SearchResultItem,
  WebsiteInspectionProvider,
} from "@/agents/providers/types";
import { providerFailed, providerOk } from "@/agents/providers/types";

/** Narrowed so a simulated provider cannot claim live provenance. */
const SIMULATED_ORIGIN = "SIMULATED_DEMO" as const satisfies DataOrigin;

const SIMULATED_CA = "Demo Simulated CA R3 (fixture)";

function note(extra: string): string {
  return `${SIMULATION_NOTICE} ${extra}`;
}

/** Waits, honouring cancellation. The only "work" a mock provider does. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Aborted"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function metadata(
  providerId: string,
  durationMs: number,
  simulationNote: string,
  warnings: string[] = [],
): ProviderMetadata {
  return { providerId, origin: SIMULATED_ORIGIN, simulationNote, durationMs, warnings };
}

/**
 * Simulated latency, derived deterministically from the call's inputs so the
 * same scan always takes the same time.
 */
function simulatedLatency(seed: string, min: number, max: number): number {
  const random = seededRandom(`latency:${seed}`);
  return random.int(min, max);
}

function isoAt(offsetMinutes: number): string {
  return new Date(DEMO_BASE_INSTANT.getTime() + offsetMinutes * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// SearchProvider
// ---------------------------------------------------------------------------

const SEARCH_PAGE_TEMPLATES = [
  { kind: "landing", title: "{brand} — simulated landing page", weight: 3 },
  { kind: "login", title: "Sign in — simulated {brand} page", weight: 2 },
  { kind: "review", title: "Simulated review article mentioning {brand}", weight: 2 },
  { kind: "forum", title: "Simulated discussion thread about {brand}", weight: 1 },
  { kind: "promo", title: "Simulated promotional page for {brand}", weight: 1 },
];

export class MockSearchProvider implements SearchProvider {
  readonly descriptor: ProviderDescriptor = {
    id: "mock-search",
    label: "Simulated search provider",
    description:
      "Generates deterministic result pages from local fixtures. No search API is contacted " +
      "and no real web page is read.",
    isLive: false,
    origin: SIMULATED_ORIGIN,
    requiredEnv: [],
  };

  async search(
    query: { brand: string; seedDomain: string | null; maxResults: number },
    context: ProviderContext,
  ): Promise<ProviderResult<SearchResultItem[]>> {
    const seed = `search:${query.brand}:${query.seedDomain ?? ""}`;
    const latency = simulatedLatency(seed, 900, 2200);
    const started = Date.now();

    try {
      await delay(latency, context.signal);
    } catch {
      return providerFailed(
        { code: "CANCELLED", message: "Search was cancelled.", retryable: false },
        metadata(this.descriptor.id, Date.now() - started, note("Cancelled before completion.")),
      );
    }

    const random = seededRandom(seed);
    const brandToken = query.brand.toLowerCase().replace(/[^a-z0-9]/g, "") || "platform";
    const hosts = buildSimulatedHostSet(brandToken, query.seedDomain, random, query.maxResults);

    const results: SearchResultItem[] = hosts.slice(0, query.maxResults).map((host, index) => {
      const template = random.pick(SEARCH_PAGE_TEMPLATES);
      return {
        url: `https://${host}/`,
        hostname: host,
        title: template.title.replace("{brand}", query.brand),
        snippet:
          `Synthetic snippet generated for the Sentinel demonstration dataset. It does not ` +
          `reproduce any real page and says nothing about ${host}.`,
        rank: index + 1,
      };
    });

    return providerOk(
      results,
      metadata(
        this.descriptor.id,
        Date.now() - started,
        note(
          `Returned ${results.length} synthetic result(s). No query was sent to any search engine.`,
        ),
      ),
    );
  }
}

/**
 * Builds a deterministic set of plausible hostnames for a brand, including a
 * few deliberate false positives so the demo exercises reviewer triage.
 */
function buildSimulatedHostSet(
  brandToken: string,
  seedDomain: string | null,
  random: SeededRandom,
  limit: number,
): string[] {
  const hosts = new Set<string>();

  if (seedDomain) {
    const parsed = tryNormalizeDomain(seedDomain);
    if (parsed) {
      hosts.add(parsed.fqdn);
      hosts.add(`www.${parsed.registrableDomain}`);
    }
  }

  const suffixes = ["com", "net", "in", "co.in", "com.in", "net.in", "online", "site", "xyz"];
  const affixes = ["", "-india", "-login", "-official", "-trade", "pro", "-demo"];

  for (const suffix of suffixes) {
    for (const affix of affixes) {
      if (hosts.size >= limit + 6) break;
      hosts.add(`${brandToken}${affix}-demo.${suffix}`.replace("--", "-"));
    }
  }

  // Deliberate false positives: pages that merely mention the brand.
  hosts.add("marketnews-review-demo.com");
  hosts.add("tradingforum-demo.org");
  hosts.add("brokerreviews-demo.net");

  const ordered = [...hosts];
  // Deterministic shuffle so ranking looks organic but stays reproducible.
  for (let i = ordered.length - 1; i > 0; i -= 1) {
    const j = random.int(0, i);
    [ordered[i], ordered[j]] = [ordered[j] as string, ordered[i] as string];
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// DomainDataProvider
// ---------------------------------------------------------------------------

export class MockDomainDataProvider implements DomainDataProvider {
  readonly descriptor: ProviderDescriptor = {
    id: "mock-domain-data",
    label: "Simulated resolver and certificate-transparency source",
    description:
      "Returns deterministic resolution outcomes and certificate-transparency entries from " +
      "local fixtures. No DNS query is issued and no CT log is contacted.",
    isLive: false,
    origin: SIMULATED_ORIGIN,
    requiredEnv: [],
  };

  async resolve(
    request: { fqdns: string[] },
    context: ProviderContext,
  ): Promise<ProviderResult<DomainResolution[]>> {
    const started = Date.now();
    const latency = simulatedLatency(`resolve:${request.fqdns.length}`, 600, 1800);

    try {
      await delay(latency, context.signal);
    } catch {
      return providerFailed(
        { code: "CANCELLED", message: "Resolution was cancelled.", retryable: false },
        metadata(this.descriptor.id, Date.now() - started, note("Cancelled before completion.")),
      );
    }

    const checkedAt = new Date().toISOString();
    const warnings: string[] = [];

    const resolutions: DomainResolution[] = request.fqdns.map((fqdn) => {
      const bucket = hashString(`resolve:${fqdn}`) % 100;

      // ~12% of candidates are deliberately left unchecked, so the registry
      // demonstrates honest "not checked" rendering rather than implying that
      // every generated name was verified.
      if (bucket >= 88) {
        return {
          fqdn,
          status: null,
          addressCount: null,
          checkedAt: null,
          notCheckedReason:
            "Not checked: the simulated resolver's per-scan budget was reached before this candidate.",
        };
      }
      if (bucket < 55) {
        return {
          fqdn,
          status: "RESOLVED",
          addressCount: 1 + (hashString(`addr:${fqdn}`) % 4),
          checkedAt,
          notCheckedReason: null,
        };
      }
      if (bucket < 80) {
        return {
          fqdn,
          status: "NXDOMAIN",
          addressCount: null,
          checkedAt,
          notCheckedReason: null,
        };
      }
      if (bucket < 85) {
        return { fqdn, status: "SERVFAIL", addressCount: null, checkedAt, notCheckedReason: null };
      }
      warnings.push(`Simulated resolver timeout for ${fqdn}; recorded as a failed check.`);
      return { fqdn, status: "TIMEOUT", addressCount: null, checkedAt, notCheckedReason: null };
    });

    const unchecked = resolutions.filter((item) => item.status === null).length;

    return providerOk(
      resolutions,
      metadata(
        this.descriptor.id,
        Date.now() - started,
        note(
          `Simulated ${resolutions.length - unchecked} resolution outcome(s); ${unchecked} candidate(s) ` +
            "were left explicitly unchecked. No DNS query was issued.",
        ),
        warnings,
      ),
    );
  }

  async certificateTransparency(
    query: { brand: string; seedDomain: string | null; maxResults: number },
    context: ProviderContext,
  ): Promise<ProviderResult<CertificateTransparencyEntry[]>> {
    const started = Date.now();
    const latency = simulatedLatency(`ct:${query.brand}`, 500, 1500);

    try {
      await delay(latency, context.signal);
    } catch {
      return providerFailed(
        { code: "CANCELLED", message: "CT lookup was cancelled.", retryable: false },
        metadata(this.descriptor.id, Date.now() - started, note("Cancelled before completion.")),
      );
    }

    const brandToken = query.brand.toLowerCase().replace(/[^a-z0-9]/g, "") || "platform";
    const random = seededRandom(`ct:${brandToken}`);
    const count = Math.min(query.maxResults, random.int(3, 8));

    const entries: CertificateTransparencyEntry[] = Array.from({ length: count }, (_, index) => {
      const suffix = random.pick(["com", "net", "in", "co.in", "com.in", "site"]);
      const affix = random.pick(["", "-app", "-secure", "-cabinet", "-demo"]);
      const fqdn = `${brandToken}${affix}-ct${index + 1}-demo.${suffix}`;
      const fingerprint = hashString(`ct:${fqdn}`).toString(16).padStart(8, "0").repeat(8).slice(0, 64);
      return {
        fqdn,
        issuer: SIMULATED_CA,
        subjectCommonName: fqdn,
        notBefore: isoAt(-60 * 24 * 30),
        notAfter: isoAt(60 * 24 * 60),
        fingerprintSha256: fingerprint,
        loggedAt: isoAt(-60 * 24 * random.int(1, 25)),
      };
    });

    return providerOk(
      entries,
      metadata(
        this.descriptor.id,
        Date.now() - started,
        note(
          `Returned ${entries.length} synthetic certificate-transparency entries. No CT log was queried. ` +
            "A CT entry indicates a certificate was issued for a name — not that a website exists there.",
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// WebsiteInspectionProvider
// ---------------------------------------------------------------------------

export class MockWebsiteInspectionProvider implements WebsiteInspectionProvider {
  readonly descriptor: ProviderDescriptor = {
    id: "mock-website-inspection",
    label: "Simulated website inspection",
    description:
      "Produces deterministic page observations from local fixtures. No HTTP request is made, " +
      "no page is downloaded, and no script is executed.",
    isLive: false,
    origin: SIMULATED_ORIGIN,
    requiredEnv: [],
  };

  async inspect(
    request: { fqdns: string[]; maxBytesPerHost: number; maxRedirects: number },
    context: ProviderContext,
  ): Promise<ProviderResult<InspectionObservation[]>> {
    const started = Date.now();
    const latency = simulatedLatency(`inspect:${request.fqdns.length}`, 1200, 3000);

    try {
      await delay(latency, context.signal);
    } catch {
      return providerFailed(
        { code: "CANCELLED", message: "Inspection was cancelled.", retryable: false },
        metadata(this.descriptor.id, Date.now() - started, note("Cancelled before completion.")),
      );
    }

    const observedAt = new Date().toISOString();
    const warnings: string[] = [];

    const observations: InspectionObservation[] = request.fqdns.map((fqdn) => {
      const bucket = hashString(`inspect:${fqdn}`) % 100;
      const random = seededRandom(`inspect:${fqdn}`);

      // ~10% of inspections fail. Recorded as failures, never as findings.
      if (bucket >= 90) {
        const failureKind = bucket >= 96 ? "timeout" : "connection-reset";
        warnings.push(`Simulated ${failureKind} inspecting ${fqdn}.`);
        return {
          fqdn,
          observedAt,
          httpStatusCode: null,
          finalUrl: null,
          redirectedToUrl: null,
          title: null,
          description: null,
          language: null,
          textExcerpt: null,
          detectedTechnologies: [],
          outboundHostnames: [],
          certificate: null,
          bytesRead: null,
          error: {
            code: failureKind === "timeout" ? "TIMEOUT" : "CONNECTION_RESET",
            message:
              `Simulated ${failureKind} while inspecting ${fqdn}. This is a failed check: nothing ` +
              "has been established about the host, in either direction.",
          },
        };
      }

      const statusCode = bucket < 62 ? 200 : bucket < 70 ? 301 : bucket < 76 ? 302 : bucket < 84 ? 404 : 403;
      const isRedirect = statusCode === 301 || statusCode === 302;
      const hasBody = statusCode === 200;
      const parsed = tryNormalizeDomain(fqdn);
      const redirectTarget = isRedirect
        ? `https://${parsed?.registrableDomain ?? fqdn}/`
        : null;

      const fingerprint = hashString(`cert:${parsed?.registrableDomain ?? fqdn}`)
        .toString(16)
        .padStart(8, "0")
        .repeat(8)
        .slice(0, 64);

      return {
        fqdn,
        observedAt,
        httpStatusCode: statusCode,
        finalUrl: redirectTarget ?? `https://${fqdn}/`,
        redirectedToUrl: redirectTarget,
        title: hasBody ? `Simulated page for ${fqdn} (demo fixture)` : null,
        description: hasBody
          ? "Synthetic page description generated for the Sentinel demonstration dataset."
          : null,
        language: hasBody ? "en" : null,
        textExcerpt: hasBody
          ? `Synthetic body text for ${fqdn}. Written for the demo dataset; it does not reproduce ` +
            "the content of any real website."
          : null,
        detectedTechnologies: hasBody
          ? random.pickMany(
              ["nginx (simulated)", "Cloudflare (simulated)", "React (simulated)", "WordPress (simulated)"],
              random.int(1, 2),
            )
          : [],
        outboundHostnames: hasBody ? ["shared-cdn-demo.net"] : [],
        certificate: statusCode === 404 || statusCode === 403
          ? null
          : {
              issuer: SIMULATED_CA,
              subjectCommonName: parsed ? `*.${parsed.registrableDomain}` : fqdn,
              notBefore: isoAt(-60 * 24 * 45),
              notAfter: isoAt(60 * 24 * 45),
              fingerprintSha256: fingerprint,
            },
        bytesRead: hasBody ? random.int(12_000, 96_000) : random.int(400, 2_000),
        error: null,
      };
    });

    const failed = observations.filter((item) => item.error !== null).length;

    return providerOk(
      observations,
      metadata(
        this.descriptor.id,
        Date.now() - started,
        note(
          `Produced ${observations.length - failed} synthetic observation(s) and recorded ${failed} ` +
            "simulated failure(s). No HTTP request was made to any host.",
        ),
        warnings,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// RegulatorySourceProvider
// ---------------------------------------------------------------------------

export class MockRegulatorySourceProvider implements RegulatorySourceProvider {
  readonly descriptor: ProviderDescriptor = {
    id: "mock-regulatory-source",
    label: "Simulated regulatory source provider",
    description:
      "Checks candidate terms against clearly-labelled fictional fixture sources. It REFUSES to " +
      "simulate the content of a real authority's publication.",
    isLive: false,
    origin: SIMULATED_ORIGIN,
    requiredEnv: [],
  };

  async check(
    request: {
      source: {
        sourceId: string;
        authorityShortName: string;
        title: string;
        sourceUrl: string;
        isFixtureSource: boolean;
      };
      terms: Array<{ term: string; domainId: string | null; kind: "domain" | "entity" }>;
    },
    context: ProviderContext,
  ): Promise<ProviderResult<RegulatoryCheckOutcome>> {
    const started = Date.now();
    const startedAt = new Date().toISOString();

    // The single most important refusal in the application: never invent what
    // a real regulator published.
    if (!request.source.isFixtureSource) {
      return providerFailed(
        {
          code: "BLOCKED_BY_POLICY",
          message:
            `Refused to simulate a retrieval of "${request.source.title}" ` +
            `(${request.source.authorityShortName}). It is a real official source, and fabricating ` +
            "its contents would create a false regulatory record. Enable live fetching and " +
            "configure a real provider to check it, or verify it manually.",
          retryable: false,
        },
        metadata(
          this.descriptor.id,
          Date.now() - started,
          "No content was generated for this source. Sentinel does not invent official publications.",
        ),
      );
    }

    const latency = simulatedLatency(`regcheck:${request.source.sourceId}`, 800, 2000);
    try {
      await delay(latency, context.signal);
    } catch {
      return providerFailed(
        { code: "CANCELLED", message: "Source check was cancelled.", retryable: false },
        metadata(this.descriptor.id, Date.now() - started, note("Cancelled before completion.")),
      );
    }

    // A fixture source whose URL marks it as the always-failing one.
    if (request.source.sourceUrl.includes("offline-feed")) {
      return providerFailed(
        {
          code: "UPSTREAM_ERROR",
          message:
            "Simulated failure: the fixture source is configured to be unreachable. Recorded as " +
            "a failed retrieval, which produces no information about any term either way.",
          retryable: true,
        },
        metadata(
          this.descriptor.id,
          Date.now() - started,
          note("Simulated unreachable fixture source."),
        ),
      );
    }

    const isRegister = request.source.sourceUrl.includes("authorised-register");
    const matches: RegulatoryCheckOutcome["matches"] = [];
    const checkedWithoutMatch: string[] = [];

    for (const term of request.terms) {
      // The simulated authorised-entity register never matches — that is the
      // point of it. See the note below.
      const bucket = hashString(`regmatch:${request.source.sourceId}:${term.term}`) % 100;
      if (!isRegister && bucket < 18) {
        matches.push({
          term: term.term,
          domainId: term.domainId,
          matchType: term.kind === "domain" ? "EXACT_DOMAIN" : "BRAND_TOKEN",
          confidence: term.kind === "domain" ? 70 + (bucket % 25) : 30 + (bucket % 20),
          context:
            `[SIMULATED FIXTURE TEXT] The demonstration document "${request.source.title}" names ` +
            `"${term.term}". This sentence was generated for the demo dataset and does not ` +
            "reproduce any real publication.",
        });
      } else {
        checkedWithoutMatch.push(term.term);
      }
    }

    const outcome: RegulatoryCheckOutcome = {
      sourceId: request.source.sourceId,
      startedAt,
      completedAt: new Date().toISOString(),
      httpStatusCode: 200,
      bytesRetrieved: 40_000 + (hashString(request.source.sourceId) % 160_000),
      lastModifiedReported: isoAt(-60 * 24 * 3),
      matches,
      checkedWithoutMatch,
      note: isRegister
        ? "Checked against a simulated authorised-entity register with no matching entry. A " +
          "non-match is recorded as 'checked, no match found'. It does NOT mean the entity is " +
          "unauthorised, and it does NOT mean it is authorised."
        : `Simulated retrieval of a fictional fixture source. ${matches.length} match(es) and ` +
          `${checkedWithoutMatch.length} explicit non-match(es) recorded. No real document was fetched.`,
    };

    return providerOk(
      outcome,
      metadata(
        this.descriptor.id,
        Date.now() - started,
        note("Checked a fictional fixture source at a reserved .invalid hostname."),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// LanguageModelProvider
// ---------------------------------------------------------------------------

/**
 * The simulated language model.
 *
 * It does not pretend to be Gemini. Every call reports NOT_CONFIGURED, which
 * is the truth: no model is configured, and the agents fall back to
 * deterministic rule-based analysis. This is deliberately a refusal rather
 * than a canned "AI response", because a fake model answer presented as
 * analysis is precisely the kind of thing this product must not do.
 */
export class MockLanguageModelProvider implements LanguageModelProvider {
  readonly isConfigured = false;

  readonly descriptor: ProviderDescriptor = {
    id: "mock-language-model",
    label: "Language model — not configured",
    description:
      "No language model is configured. Sentinel does not fabricate model output: agents use " +
      "deterministic rule-based analysis instead, and say so.",
    isLive: false,
    origin: SIMULATED_ORIGIN,
    requiredEnv: ["GEMINI_API_KEY", "GEMINI_MODEL"],
  };

  async generateStructured<TOutput>(
    request: { task: string },
    _context: ProviderContext,
  ): Promise<ProviderResult<{ output: TOutput; usage: never }>> {
    return providerFailed(
      {
        code: "NOT_CONFIGURED",
        message:
          `No language model is configured, so the "${request.task}" task could not use one. ` +
          "Sentinel will not invent model output. Set GEMINI_API_KEY to enable the real provider; " +
          "until then the calling agent uses deterministic rule-based analysis and labels it as such.",
        retryable: false,
      },
      {
        providerId: this.descriptor.id,
        origin: SIMULATED_ORIGIN,
        simulationNote:
          "No model was called. Nothing in this scan's output came from a language model.",
        durationMs: 0,
        warnings: [],
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Scoring helper shared by the mock agents
// ---------------------------------------------------------------------------

export function simulatedBrandSimilarity(fqdn: string, brand: string): number {
  return brandSimilarity(fqdn, brand);
}

export function simulatedCandidates(seedDomain: string, limit: number): string[] {
  return generateDomainCandidates(seedDomain, { limit }).map((candidate) => candidate.fqdn);
}
