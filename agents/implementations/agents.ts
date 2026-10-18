/**
 * The six Sentinel agents.
 *
 * Each agent is provider-agnostic: it calls the injected provider registry and
 * shapes the result into its validated output contract. Swapping the mock
 * providers for real ones changes nothing in this file.
 *
 * The agents are where the product's epistemic discipline is enforced in code:
 *
 *   * Every emitted evidence item carries a non-empty `limitations` string
 *     (the Zod schema rejects it otherwise).
 *   * A failed provider check becomes a recorded failure, never a negative
 *     finding about a domain.
 *   * The regulatory agent reports non-matches explicitly and refuses to treat
 *     them as authorisation.
 *   * The relationship agent attaches an ownership disclaimer to every
 *     infrastructure-derived edge.
 *   * The reporting agent can suggest a priority no higher than MEDIUM;
 *     escalation beyond that is a human decision.
 */

import {
  SHARED_INFRASTRUCTURE_NOTICE,
  SIGNAL_NOT_DETERMINATION_NOTICE,
} from "@/lib/config/constants";
import { brandLabel, generateDomainCandidates, stringSimilarityScore, tryNormalizeDomain } from "@/lib/utils/domain-name";
import type {
  AgentEvidence,
  AgentExecutionContext,
  AgentFinding,
  AgentRelationship,
  DomainEnumerationAgent,
  DomainEnumerationInput,
  DomainEnumerationOutput,
  DomainObservation,
  EvidenceReportingAgent,
  EvidenceReportingInput,
  EvidenceReportingOutput,
  RegulatoryVerificationAgent,
  RegulatoryVerificationInput,
  RegulatoryVerificationOutput,
  RelationshipAnalysisAgent,
  RelationshipAnalysisInput,
  RelationshipAnalysisOutput,
  WebDiscoveryAgent,
  WebDiscoveryInput,
  WebDiscoveryOutput,
  WebsiteInspectionAgent,
  WebsiteInspectionInput,
  WebsiteInspectionOutput,
} from "@/agents/contracts/types";
import {
  AgentExecutionError,
  domainEnumerationInputSchema,
  domainEnumerationOutputSchema,
  evidenceReportingInputSchema,
  evidenceReportingOutputSchema,
  regulatoryVerificationInputSchema,
  regulatoryVerificationOutputSchema,
  relationshipAnalysisInputSchema,
  relationshipAnalysisOutputSchema,
  webDiscoveryInputSchema,
  webDiscoveryOutputSchema,
  websiteInspectionInputSchema,
  websiteInspectionOutputSchema,
} from "@/agents/contracts/types";
import { AGENT_PURPOSES, AGENT_LABELS } from "@/lib/utils/labels";
import type { ProviderMetadata } from "@/agents/providers/types";

function simulationNoteFrom(metadata: ProviderMetadata): string | null {
  return metadata.simulationNote ?? null;
}

function warningsFrom(metadata: ProviderMetadata) {
  return metadata.warnings.map((message) => ({ code: "PROVIDER_WARNING", message }));
}

// ---------------------------------------------------------------------------
// Agent 1 — Web Discovery
// ---------------------------------------------------------------------------

export const webDiscoveryAgent: WebDiscoveryAgent = {
  key: "WEB_DISCOVERY",
  label: AGENT_LABELS.WEB_DISCOVERY,
  purpose: AGENT_PURPOSES.WEB_DISCOVERY,
  inputSchema: webDiscoveryInputSchema,
  outputSchema: webDiscoveryOutputSchema,
  requiredScopes: ["SEARCH_INDEX"],

  async execute(
    input: WebDiscoveryInput,
    context: AgentExecutionContext,
  ): Promise<WebDiscoveryOutput> {
    const result = await context.providers.search.search(
      { brand: input.brand, seedDomain: input.seedDomain, maxResults: input.maxCandidates },
      context,
    );

    if (!result.ok) {
      throw new AgentExecutionError(
        "WEB_DISCOVERY",
        `Search provider failed: ${result.error.message}`,
        result.error.retryable,
        result.error,
      );
    }

    const observedAt = new Date().toISOString();
    const findings: AgentFinding[] = [];
    const evidence: AgentEvidence[] = [];
    const seen = new Set<string>();

    for (const item of result.data) {
      const parsed = tryNormalizeDomain(item.hostname);
      if (!parsed || seen.has(parsed.fqdn)) continue;
      seen.add(parsed.fqdn);

      findings.push({
        fqdn: parsed.fqdn,
        sourceKey: "search-index",
        detail: `Rank ${item.rank} for the brand query.`,
        observedAt,
      });

      evidence.push({
        fqdn: parsed.fqdn,
        // A search hit is a third-party claim Sentinel has not verified.
        kind: "UNVERIFIED_CLAIM",
        title: "Appeared in search results",
        description:
          `The hostname appeared at rank ${item.rank} in results for the brand query. ` +
          `Result title: "${item.title}". Snippet: "${item.snippet}"`,
        sourceUrl: item.url,
        sourceLabel: context.providers.search.descriptor.label,
        collectedAt: observedAt,
        collectionMethod: "SEARCH_PROVIDER",
        confidence: Math.max(10, 60 - item.rank * 2),
        limitations:
          "Appearing in a search result is a discovery signal only. It establishes nothing about " +
          "the page's content, its operator, or its lawfulness, and the underlying page has not " +
          "been independently verified.",
        origin: result.metadata.origin,
        rawReference: { rank: item.rank, url: item.url },
      });
    }

    return {
      summary: `Returned ${result.data.length} result URL(s) across ${findings.length} distinct hostname(s).`,
      metrics: {
        resultsReturned: result.data.length,
        distinctHosts: findings.length,
        durationMs: result.metadata.durationMs,
      },
      warnings: warningsFrom(result.metadata),
      origin: result.metadata.origin,
      simulationNote: simulationNoteFrom(result.metadata),
      findings,
      evidence,
    };
  },
};

// ---------------------------------------------------------------------------
// Agent 2 — Domain Enumeration
// ---------------------------------------------------------------------------

export const domainEnumerationAgent: DomainEnumerationAgent = {
  key: "DOMAIN_ENUMERATION",
  label: AGENT_LABELS.DOMAIN_ENUMERATION,
  purpose: AGENT_PURPOSES.DOMAIN_ENUMERATION,
  inputSchema: domainEnumerationInputSchema,
  outputSchema: domainEnumerationOutputSchema,
  requiredScopes: ["DOMAIN_VARIATIONS"],

  async execute(
    input: DomainEnumerationInput,
    context: AgentExecutionContext,
  ): Promise<DomainEnumerationOutput> {
    const observedAt = new Date().toISOString();
    const findings: AgentFinding[] = [];
    const observations: DomainObservation[] = [];
    const evidence: AgentEvidence[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    const known = new Set(input.knownFqdns);
    const seedForGeneration =
      input.seedDomain ??
      `${input.brand.toLowerCase().replace(/[^a-z0-9]/g, "") || "platform"}.com`;

    // Bounded generation. This is a search space to verify, never a claim
    // that these names exist or that the list is exhaustive.
    const generated = generateDomainCandidates(seedForGeneration, {
      limit: Math.min(input.maxCandidates, 80),
    }).filter((candidate) => !known.has(candidate.fqdn));

    let ctEntries: Array<{ fqdn: string; issuer: string; subjectCommonName: string; notBefore: string; notAfter: string; fingerprintSha256: string }> = [];
    let ctSimulationNote: string | null = null;

    if (input.includeCertificateTransparency) {
      const ctResult = await context.providers.domainData.certificateTransparency(
        { brand: input.brand, seedDomain: input.seedDomain, maxResults: 15 },
        context,
      );
      if (ctResult.ok) {
        ctEntries = ctResult.data;
        ctSimulationNote = simulationNoteFrom(ctResult.metadata);
        warnings.push(...warningsFrom(ctResult.metadata));
      } else {
        // A CT failure is reported, not silently treated as "no certificates".
        warnings.push({
          code: "CT_LOOKUP_FAILED",
          message:
            `Certificate-transparency lookup failed (${ctResult.error.code}): ${ctResult.error.message}. ` +
            "No conclusion has been drawn from the absence of entries.",
        });
      }
    }

    const candidateFqdns = [
      ...generated.map((candidate) => candidate.fqdn),
      ...ctEntries.map((entry) => entry.fqdn),
    ].slice(0, input.maxCandidates);

    const resolution = await context.providers.domainData.resolve(
      { fqdns: candidateFqdns },
      context,
    );

    if (!resolution.ok) {
      throw new AgentExecutionError(
        "DOMAIN_ENUMERATION",
        `Resolution provider failed: ${resolution.error.message}`,
        resolution.error.retryable,
        resolution.error,
      );
    }

    warnings.push(...warningsFrom(resolution.metadata));

    const rationaleByFqdn = new Map(
      generated.map((candidate) => [candidate.fqdn, candidate.rationale] as const),
    );
    const ctByFqdn = new Map(ctEntries.map((entry) => [entry.fqdn, entry] as const));

    let unverifiedCandidateCount = 0;
    let resolvedCount = 0;

    for (const item of resolution.data) {
      const ctEntry = ctByFqdn.get(item.fqdn);
      const sourceKey = ctEntry ? "cert-transparency" : "domain-variation";

      // Candidates that exist, or whose existence could not be determined,
      // both enter the registry — but only the former carry a DNS status.
      const isUnchecked = item.status === null;
      const doesNotResolve = item.status === "NXDOMAIN";
      if (isUnchecked) unverifiedCandidateCount += 1;
      if (item.status === "RESOLVED") resolvedCount += 1;

      // An NXDOMAIN candidate is still recorded, so the reviewer can see what
      // was tried. It is explicitly marked as not resolving.
      findings.push({
        fqdn: item.fqdn,
        sourceKey,
        detail: ctEntry
          ? "Name present in a certificate-transparency entry."
          : (rationaleByFqdn.get(item.fqdn) ?? "Generated candidate."),
        observedAt,
      });

      observations.push({
        fqdn: item.fqdn,
        observedAt,
        dnsStatus: item.status,
        resolvedIpCount: item.addressCount,
        brandSimilarityScore: computeBrandSimilarity(item.fqdn, input.brand),
        similarityRationale:
          rationaleByFqdn.get(item.fqdn) ??
          (ctEntry ? "Surfaced from a certificate-transparency entry." : null),
        ...(ctEntry
          ? {
              certIssuer: ctEntry.issuer,
              certSubjectCommonName: ctEntry.subjectCommonName,
              certNotBefore: ctEntry.notBefore,
              certNotAfter: ctEntry.notAfter,
              certFingerprintSha256: ctEntry.fingerprintSha256,
            }
          : {}),
      });

      if (item.status !== null) {
        evidence.push({
          fqdn: item.fqdn,
          kind: "OBSERVED_FACT",
          title: `DNS resolution returned ${item.status}`,
          description: doesNotResolve
            ? `A resolution attempt at ${item.checkedAt} returned NXDOMAIN. This is the outcome of ` +
              "one check at one moment; names are registered and deregistered continually."
            : `A resolution attempt at ${item.checkedAt} returned ${item.status}` +
              (item.addressCount !== null ? ` with ${item.addressCount} address record(s).` : "."),
          sourceUrl: null,
          sourceLabel: context.providers.domainData.descriptor.label,
          collectedAt: item.checkedAt ?? observedAt,
          collectionMethod: "DNS_LOOKUP",
          confidence: null,
          limitations:
            "A DNS result describes name resolution at a point in time. It says nothing about " +
            "who registered the name, what is served there, or whether any activity is lawful.",
          origin: resolution.metadata.origin,
          rawReference: { dnsStatus: item.status, addressCount: item.addressCount },
        });
      } else {
        evidence.push({
          fqdn: item.fqdn,
          kind: "UNVERIFIED_CLAIM",
          title: "Candidate generated but not checked",
          description:
            `This name was generated as a candidate for verification. ${item.notCheckedReason ?? ""} ` +
            "No DNS, HTTP or content check has been performed, so nothing is known about it.",
          sourceUrl: null,
          sourceLabel: "Domain variation generator",
          collectedAt: observedAt,
          collectionMethod: "SIMULATED_DEMO_FIXTURE",
          confidence: null,
          limitations:
            "An unverified candidate is a hypothesis about a name that might exist. It is not " +
            "evidence of anything and must not be reported as a discovered website.",
          origin: resolution.metadata.origin,
          rawReference: { generated: true, checked: false },
        });
      }

      if (ctEntry) {
        evidence.push({
          fqdn: item.fqdn,
          kind: "OBSERVED_FACT",
          title: "Name present in a certificate-transparency entry",
          description:
            `A certificate-transparency entry covers "${ctEntry.subjectCommonName}", issued by ` +
            `${ctEntry.issuer}, valid from ${ctEntry.notBefore} to ${ctEntry.notAfter}.`,
          sourceUrl: null,
          sourceLabel: "Certificate-transparency source",
          collectedAt: observedAt,
          collectionMethod: "CERTIFICATE_TRANSPARENCY_LOG",
          confidence: null,
          limitations:
            "A CT entry records that a certificate was issued for a name. It does not show that " +
            "a website is running there, who requested the certificate, or who controls the name.",
          origin: resolution.metadata.origin,
          rawReference: { fingerprint: ctEntry.fingerprintSha256 },
        });
      }
    }

    return {
      summary:
        `Generated ${generated.length} bounded candidate(s)` +
        (ctEntries.length > 0 ? ` plus ${ctEntries.length} certificate-transparency name(s)` : "") +
        `; ${resolvedCount} resolved, ${unverifiedCandidateCount} left unchecked.`,
      metrics: {
        candidatesGenerated: generated.length,
        certificateTransparencyEntries: ctEntries.length,
        candidatesResolved: resolvedCount,
        candidatesUnverified: unverifiedCandidateCount,
        durationMs: resolution.metadata.durationMs,
      },
      warnings,
      origin: resolution.metadata.origin,
      simulationNote: simulationNoteFrom(resolution.metadata) ?? ctSimulationNote,
      findings,
      observations,
      evidence,
      unverifiedCandidateCount,
    };
  },
};

function computeBrandSimilarity(fqdn: string, brand: string): number {
  const parsed = tryNormalizeDomain(fqdn);
  if (!parsed) return 0;
  const label = brandLabel(parsed.registrableDomain, parsed.suffix);
  const brandToken = brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (brandToken === "") return 0;
  if (label.replace(/[^a-z0-9]/g, "") === brandToken) return 100;
  if (label.includes(brandToken)) return Math.max(80, stringSimilarityScore(label, brandToken));
  return stringSimilarityScore(label, brandToken);
}

// ---------------------------------------------------------------------------
// Agent 3 — Website Inspection
// ---------------------------------------------------------------------------

export const websiteInspectionAgent: WebsiteInspectionAgent = {
  key: "WEBSITE_INSPECTION",
  label: AGENT_LABELS.WEBSITE_INSPECTION,
  purpose: AGENT_PURPOSES.WEBSITE_INSPECTION,
  inputSchema: websiteInspectionInputSchema,
  outputSchema: websiteInspectionOutputSchema,
  requiredScopes: ["TECHNICAL_INSPECTION"],

  async execute(
    input: WebsiteInspectionInput,
    context: AgentExecutionContext,
  ): Promise<WebsiteInspectionOutput> {
    if (input.fqdns.length === 0) {
      return {
        summary: "No hosts were available to inspect.",
        metrics: { hostsInspected: 0 },
        warnings: [],
        origin: context.providers.websiteInspection.descriptor.origin,
        simulationNote: null,
        observations: [],
        evidence: [],
        relationships: [],
        failures: [],
      };
    }

    const result = await context.providers.websiteInspection.inspect(
      { fqdns: input.fqdns, maxBytesPerHost: 2_097_152, maxRedirects: 3 },
      context,
    );

    if (!result.ok) {
      throw new AgentExecutionError(
        "WEBSITE_INSPECTION",
        `Inspection provider failed: ${result.error.message}`,
        result.error.retryable,
        result.error,
      );
    }

    const observations: DomainObservation[] = [];
    const evidence: AgentEvidence[] = [];
    const relationships: AgentRelationship[] = [];
    const failures: Array<{ fqdn: string; code: string; message: string }> = [];

    for (const item of result.data) {
      if (item.error) {
        // A failed inspection is recorded as a failure. Crucially, no
        // observation is emitted, so the registry keeps showing "Not checked"
        // rather than implying the host was checked and found wanting.
        failures.push({ fqdn: item.fqdn, code: item.error.code, message: item.error.message });
        evidence.push({
          fqdn: item.fqdn,
          kind: "UNVERIFIED_CLAIM",
          title: `Inspection failed (${item.error.code})`,
          description: item.error.message,
          sourceUrl: null,
          sourceLabel: context.providers.websiteInspection.descriptor.label,
          collectedAt: item.observedAt,
          collectionMethod: "HTTP_RESPONSE",
          confidence: null,
          limitations:
            "A failed check produces no information about the host in either direction. It must " +
            "not be read as the site being offline, nonexistent, or evasive.",
          origin: result.metadata.origin,
          rawReference: { errorCode: item.error.code },
        });
        continue;
      }

      observations.push({
        fqdn: item.fqdn,
        observedAt: item.observedAt,
        httpStatusCode: item.httpStatusCode,
        redirectsToUrl: item.redirectedToUrl,
        siteTitle: item.title,
        siteDescription: item.description,
        siteLanguage: item.language,
        detectedTechnologies: item.detectedTechnologies,
        certIssuer: item.certificate?.issuer ?? null,
        certSubjectCommonName: item.certificate?.subjectCommonName ?? null,
        certNotBefore: item.certificate?.notBefore ?? null,
        certNotAfter: item.certificate?.notAfter ?? null,
        certFingerprintSha256: item.certificate?.fingerprintSha256 ?? null,
        contentSimilarityScore: item.title
          ? contentSimilarity(item.title, input.brand)
          : null,
      });

      if (item.httpStatusCode !== null) {
        evidence.push({
          fqdn: item.fqdn,
          kind: "OBSERVED_FACT",
          title: `HTTP response ${item.httpStatusCode}`,
          description:
            `A request to ${item.finalUrl ?? `https://${item.fqdn}/`} returned status ` +
            `${item.httpStatusCode}` +
            (item.bytesRead !== null ? `, reading ${item.bytesRead} bytes.` : "."),
          sourceUrl: `https://${item.fqdn}/`,
          sourceLabel: "Public root path",
          collectedAt: item.observedAt,
          collectionMethod: "HTTP_RESPONSE",
          confidence: null,
          limitations:
            "A status code records what a server replied at one moment. A 403 or 404 is a server " +
            "response, not an assessment of the site or its operator.",
          origin: result.metadata.origin,
          rawReference: { httpStatusCode: item.httpStatusCode, bytesRead: item.bytesRead },
        });
      }

      if (item.title) {
        evidence.push({
          fqdn: item.fqdn,
          kind: "OBSERVED_FACT",
          title: "Public page metadata collected",
          description:
            `Title: "${item.title}".` +
            (item.description ? ` Description: "${item.description}".` : "") +
            (item.detectedTechnologies.length > 0
              ? ` Fingerprinted technologies: ${item.detectedTechnologies.join(", ")}.`
              : "") +
            (item.textExcerpt ? ` Visible text excerpt: "${item.textExcerpt}"` : ""),
          sourceUrl: `https://${item.fqdn}/`,
          sourceLabel: "Public page metadata",
          collectedAt: item.observedAt,
          collectionMethod: "HTTP_RESPONSE",
          confidence: null,
          limitations:
            "Only the publicly served page was read; no authentication was attempted and no " +
            "non-public resource was requested. Page content changes, so this is one snapshot.",
          origin: result.metadata.origin,
          rawReference: { title: item.title },
        });
      }

      if (item.redirectedToUrl) {
        evidence.push({
          fqdn: item.fqdn,
          kind: "OBSERVED_FACT",
          title: `Redirect observed to ${item.redirectedToUrl}`,
          description: `The request was redirected to ${item.redirectedToUrl}.`,
          sourceUrl: `https://${item.fqdn}/`,
          sourceLabel: "Public root path",
          collectedAt: item.observedAt,
          collectionMethod: "HTTP_RESPONSE",
          confidence: null,
          limitations:
            "A redirect shows where one request was sent at one moment. It does not establish " +
            "common ownership or control, and redirect targets change.",
          origin: result.metadata.origin,
          rawReference: { redirectsToUrl: item.redirectedToUrl },
        });

        const targetHost = tryNormalizeDomain(item.redirectedToUrl);
        if (targetHost && targetHost.fqdn !== item.fqdn) {
          relationships.push({
            sourceFqdn: item.fqdn,
            targetFqdn: targetHost.fqdn,
            type: "REDIRECTS_TO",
            confidence: 90,
            rationale: `An HTTP ${item.httpStatusCode} redirect to ${item.redirectedToUrl} was observed.`,
            limitations:
              "A redirect records where one host sent one request at one moment in time. It does " +
              "not establish common ownership, control or any contractual relationship.",
            relationSource: context.providers.websiteInspection.descriptor.label,
            observedAt: item.observedAt,
          });
        }
      }

      if (item.certificate) {
        evidence.push({
          fqdn: item.fqdn,
          kind: "OBSERVED_FACT",
          title: "TLS certificate characteristics recorded",
          description:
            `Issuer: ${item.certificate.issuer}. Subject common name: ` +
            `${item.certificate.subjectCommonName}. SHA-256 fingerprint: ` +
            `${item.certificate.fingerprintSha256}.`,
          sourceUrl: `https://${item.fqdn}/`,
          sourceLabel: "Served TLS certificate",
          collectedAt: item.observedAt,
          collectionMethod: "TLS_CERTIFICATE",
          confidence: null,
          limitations: SHARED_INFRASTRUCTURE_NOTICE,
          origin: result.metadata.origin,
          rawReference: { fingerprint: item.certificate.fingerprintSha256 },
        });
      }
    }

    // Certificate-sharing edges, each carrying the ownership disclaimer.
    const byFingerprint = new Map<string, string[]>();
    for (const item of result.data) {
      const fingerprint = item.certificate?.fingerprintSha256;
      if (!fingerprint) continue;
      const bucket = byFingerprint.get(fingerprint);
      if (bucket) bucket.push(item.fqdn);
      else byFingerprint.set(fingerprint, [item.fqdn]);
    }
    for (const [fingerprint, hosts] of byFingerprint) {
      if (hosts.length < 2) continue;
      const [first, ...rest] = hosts;
      for (const other of rest.slice(0, 5)) {
        relationships.push({
          sourceFqdn: first as string,
          targetFqdn: other,
          type: "SHARES_CERTIFICATE_CHARACTERISTIC",
          confidence: 45,
          rationale: `Both hosts presented the same certificate fingerprint (${fingerprint.slice(0, 12)}…).`,
          limitations: SHARED_INFRASTRUCTURE_NOTICE,
          relationSource: context.providers.websiteInspection.descriptor.label,
          observedAt: new Date().toISOString(),
        });
      }
    }

    return {
      summary:
        `Inspected ${result.data.length} host(s): ${observations.length} observation(s) recorded, ` +
        `${failures.length} check(s) failed.`,
      metrics: {
        hostsInspected: result.data.length,
        observationsRecorded: observations.length,
        inspectionsFailed: failures.length,
        redirectsObserved: relationships.filter((r) => r.type === "REDIRECTS_TO").length,
        durationMs: result.metadata.durationMs,
      },
      warnings: warningsFrom(result.metadata),
      origin: result.metadata.origin,
      simulationNote: simulationNoteFrom(result.metadata),
      observations,
      evidence,
      relationships,
      failures,
    };
  },
};

function contentSimilarity(title: string, brand: string): number {
  const normalizedTitle = title.toLowerCase();
  const brandToken = brand.toLowerCase();
  if (normalizedTitle.includes(brandToken)) return Math.min(95, 55 + brandToken.length * 2);
  return stringSimilarityScore(normalizedTitle.slice(0, brandToken.length), brandToken);
}

// ---------------------------------------------------------------------------
// Agent 4 — Regulatory Verification
// ---------------------------------------------------------------------------

export const regulatoryVerificationAgent: RegulatoryVerificationAgent = {
  key: "REGULATORY_VERIFICATION",
  label: AGENT_LABELS.REGULATORY_VERIFICATION,
  purpose: AGENT_PURPOSES.REGULATORY_VERIFICATION,
  inputSchema: regulatoryVerificationInputSchema,
  outputSchema: regulatoryVerificationOutputSchema,
  requiredScopes: ["REGULATORY_MATCHING"],

  async execute(
    input: RegulatoryVerificationInput,
    context: AgentExecutionContext,
  ): Promise<RegulatoryVerificationOutput> {
    const checks: RegulatoryVerificationOutput["checks"] = [];
    const matches: RegulatoryVerificationOutput["matches"] = [];
    const checkedWithoutMatch: RegulatoryVerificationOutput["checkedWithoutMatch"] = [];
    const skippedSources: RegulatoryVerificationOutput["skippedSources"] = [];
    const evidence: AgentEvidence[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    const terms = [
      ...input.candidates.map((candidate) => ({
        term: candidate.fqdn,
        domainId: candidate.domainId,
        kind: "domain" as const,
      })),
      { term: input.brand, domainId: null, kind: "entity" as const },
    ];
    const domainIdByFqdn = new Map(input.candidates.map((c) => [c.fqdn, c.domainId] as const));

    for (const source of input.sources) {
      if (!source.isEnabled) {
        skippedSources.push({
          sourceId: source.sourceId,
          reason: "Source is disabled. Disabled sources are never contacted.",
        });
        continue;
      }

      const result = await context.providers.regulatorySource.check(
        {
          source: {
            sourceId: source.sourceId,
            authorityShortName: source.authorityShortName,
            title: source.title,
            sourceUrl: source.sourceUrl,
            isFixtureSource: source.isFixtureSource,
          },
          terms,
        },
        context,
      );

      if (!result.ok) {
        // A refusal to fabricate a real authority's content is the expected,
        // correct outcome in demo mode — not an error worth failing the task.
        if (result.error.code === "BLOCKED_BY_POLICY") {
          skippedSources.push({ sourceId: source.sourceId, reason: result.error.message });
          continue;
        }

        checks.push({
          sourceId: source.sourceId,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          status: result.error.code === "TIMEOUT" ? "UNREACHABLE" : "HTTP_ERROR",
          httpStatusCode: null,
          bytesRetrieved: null,
          matchedEntityCount: 0,
          errorMessage: result.error.message,
          note: "Failed retrieval. No information was obtained about any term, in either direction.",
        });
        warnings.push({
          code: "SOURCE_CHECK_FAILED",
          message: `${source.authorityShortName} — ${source.title}: ${result.error.message}`,
        });
        continue;
      }

      const outcome = result.data;
      checks.push({
        sourceId: source.sourceId,
        startedAt: outcome.startedAt,
        completedAt: outcome.completedAt,
        status: "OK",
        httpStatusCode: outcome.httpStatusCode,
        bytesRetrieved: outcome.bytesRetrieved,
        matchedEntityCount: outcome.matches.length,
        errorMessage: null,
        note: outcome.note,
      });

      for (const match of outcome.matches) {
        const fqdn = domainIdByFqdn.has(match.term) ? match.term : null;
        matches.push({
          sourceId: source.sourceId,
          domainId: match.domainId,
          fqdn,
          matchedTerm: match.term,
          matchedContext: match.context,
          matchType: match.matchType,
          confidence: match.confidence,
          sourceUrl: source.sourceUrl,
          sourceRetrievedAt: outcome.completedAt,
          notes: source.isFixtureSource
            ? "Match against a clearly-labelled fictional fixture source. It carries no official weight."
            : null,
        });

        if (fqdn) {
          evidence.push({
            fqdn,
            kind: "OFFICIAL_SOURCE_MATCH",
            title: `Match in ${source.title}`,
            description:
              `The term "${match.term}" matched text in the configured source "${source.title}" ` +
              `(${source.authorityShortName}). Context: ${match.context}`,
            sourceUrl: source.sourceUrl,
            sourceLabel: `${source.authorityShortName} — ${source.title}`,
            collectedAt: outcome.completedAt,
            collectionMethod: "REGULATORY_SOURCE_RETRIEVAL",
            confidence: match.confidence,
            limitations: source.isFixtureSource
              ? "The source is a FICTIONAL demonstration fixture, not a real regulator. This match " +
                "has no official weight and must be independently verified against a genuine publication."
              : "A textual match indicates the document contains this term. Confirm the context and " +
                "the entity identity against the published document before relying on it.",
            origin: result.metadata.origin,
            rawReference: { matchType: match.matchType, sourceId: source.sourceId },
          });
        }
      }

      for (const term of outcome.checkedWithoutMatch) {
        checkedWithoutMatch.push({
          sourceId: source.sourceId,
          term,
          fqdn: domainIdByFqdn.has(term) ? term : null,
        });
      }
    }

    const noMatchNote =
      "Absence of a name from a warning list is NOT evidence of regulatory authorisation. " +
      "Authorisation can only be established from a positive entry in an authorised-entity register.";

    return {
      summary:
        `Checked ${terms.length} term(s) against ${checks.length} source(s): ${matches.length} match(es), ` +
        `${checkedWithoutMatch.length} explicit non-match(es), ${skippedSources.length} source(s) skipped.`,
      metrics: {
        termsChecked: terms.length,
        sourcesChecked: checks.length,
        matchesFound: matches.length,
        explicitNonMatches: checkedWithoutMatch.length,
        sourcesSkipped: skippedSources.length,
      },
      warnings: [...warnings, { code: "NO_MATCH_SEMANTICS", message: noMatchNote }],
      origin: "SIMULATED_DEMO",
      simulationNote:
        skippedSources.length > 0
          ? `${skippedSources.length} source(s) were not contacted. Real authority publications are ` +
            "never simulated: Sentinel refuses to invent their contents."
          : null,
      checks,
      matches,
      checkedWithoutMatch,
      skippedSources,
      evidence,
    };
  },
};

// ---------------------------------------------------------------------------
// Agent 5 — Relationship Analysis
// ---------------------------------------------------------------------------

export const relationshipAnalysisAgent: RelationshipAnalysisAgent = {
  key: "RELATIONSHIP_ANALYSIS",
  label: AGENT_LABELS.RELATIONSHIP_ANALYSIS,
  purpose: AGENT_PURPOSES.RELATIONSHIP_ANALYSIS,
  inputSchema: relationshipAnalysisInputSchema,
  outputSchema: relationshipAnalysisOutputSchema,
  requiredScopes: ["RELATED_DOMAIN_ANALYSIS"],

  async execute(
    input: RelationshipAnalysisInput,
    context: AgentExecutionContext,
  ): Promise<RelationshipAnalysisOutput> {
    const observedAt = new Date().toISOString();
    const relationships: AgentRelationship[] = [];
    const evidence: AgentEvidence[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    // A language model would be used here when configured. It is not, so the
    // analysis below is deterministic and rule-based — and says so, rather
    // than presenting rule output as model reasoning.
    const languageModel = context.providers.languageModel;
    const usedLanguageModel = languageModel.isConfigured;
    if (!usedLanguageModel) {
      warnings.push({
        code: "LANGUAGE_MODEL_NOT_CONFIGURED",
        message:
          "No language model is configured, so correlation used deterministic rules rather than " +
          "model reasoning. No model output appears in these findings.",
      });
    }

    const byFingerprint = new Map<string, typeof input.domains>();
    const byRegistrable = new Map<string, typeof input.domains>();

    for (const domain of input.domains) {
      if (domain.certFingerprintSha256) {
        const bucket = byFingerprint.get(domain.certFingerprintSha256) ?? [];
        bucket.push(domain);
        byFingerprint.set(domain.certFingerprintSha256, bucket);
      }
      const registrableBucket = byRegistrable.get(domain.registrableDomain) ?? [];
      registrableBucket.push(domain);
      byRegistrable.set(domain.registrableDomain, registrableBucket);
    }

    // 1. Subdomain relationships — a naming-hierarchy fact.
    for (const [registrable, group] of byRegistrable) {
      if (group.length < 2) continue;
      const apex = group.find((domain) => domain.fqdn === registrable) ?? group[0];
      if (!apex) continue;
      for (const domain of group) {
        if (domain.fqdn === apex.fqdn) continue;
        relationships.push({
          sourceFqdn: domain.fqdn,
          targetFqdn: apex.fqdn,
          type: "CONFIRMED_RELATIONSHIP",
          confidence: 85,
          rationale: `${domain.fqdn} is a subdomain of the registrable domain ${registrable}.`,
          limitations:
            "A subdomain relationship is a fact about DNS naming. It establishes that one name " +
            "sits beneath the other in the hierarchy and nothing else.",
          relationSource: "Relationship Analysis Agent (deterministic rule)",
          observedAt,
        });
      }
    }

    // 2. Shared certificate characteristics — explicitly NOT ownership.
    for (const [fingerprint, group] of byFingerprint) {
      if (group.length < 2) continue;
      const [first, ...rest] = group;
      if (!first) continue;
      for (const other of rest.slice(0, 6)) {
        if (other.registrableDomain === first.registrableDomain) continue;
        relationships.push({
          sourceFqdn: first.fqdn,
          targetFqdn: other.fqdn,
          type: "SHARES_CERTIFICATE_CHARACTERISTIC",
          confidence: 42,
          rationale: `Both hosts presented certificate fingerprint ${fingerprint.slice(0, 12)}….`,
          limitations: SHARED_INFRASTRUCTURE_NOTICE,
          relationSource: "Relationship Analysis Agent (deterministic rule)",
          observedAt,
        });
      }
    }

    // 3. Content similarity between pages that were actually collected.
    const withTitles = input.domains.filter((domain) => domain.siteTitle !== null);
    for (let i = 0; i < withTitles.length; i += 1) {
      for (let j = i + 1; j < withTitles.length; j += 1) {
        const a = withTitles[i];
        const b = withTitles[j];
        if (!a || !b || a.registrableDomain === b.registrableDomain) continue;
        const score = stringSimilarityScore(
          (a.siteTitle ?? "").toLowerCase(),
          (b.siteTitle ?? "").toLowerCase(),
        );
        if (score < 60) continue;
        relationships.push({
          sourceFqdn: a.fqdn,
          targetFqdn: b.fqdn,
          type: "SIMILAR_WEBSITE_CONTENT",
          confidence: Math.min(80, score),
          rationale: `Collected page titles scored ${score}/100 on structural similarity.`,
          limitations:
            "Content similarity can arise from a shared template, a purchased theme, or copying " +
            "by an unrelated party. It indicates resemblance, not authorship or affiliation.",
          relationSource: "Relationship Analysis Agent (deterministic rule)",
          observedAt,
        });
      }
    }

    // 4. Suspected brand relationships against the seed.
    if (input.seedDomain) {
      for (const domain of input.domains) {
        if (domain.fqdn === input.seedDomain) continue;
        const score = domain.brandSimilarityScore ?? 0;
        if (score < 70) continue;
        relationships.push({
          sourceFqdn: domain.fqdn,
          targetFqdn: input.seedDomain,
          type: "SUSPECTED_BRAND_RELATIONSHIP",
          confidence: Math.min(70, score - 10),
          rationale: `Brand-label similarity to the seed domain scored ${score}/100.`,
          limitations:
            "A suspected brand relationship is a hypothesis for a human to test. It is not a " +
            "finding of impersonation, infringement, affiliation or any legal characterisation, " +
            "and identical brand labels occur legitimately across public suffixes.",
          relationSource: "Relationship Analysis Agent (deterministic rule)",
          observedAt,
        });
      }
    }

    // 5. Co-occurrence in the same source document.
    const bySource = new Map<string, string[]>();
    for (const match of input.regulatoryMatches) {
      const bucket = bySource.get(match.sourceId) ?? [];
      bucket.push(match.fqdn);
      bySource.set(match.sourceId, bucket);
    }
    for (const [, hosts] of bySource) {
      const unique = [...new Set(hosts)];
      for (let i = 0; i < unique.length; i += 1) {
        for (let j = i + 1; j < unique.length; j += 1) {
          relationships.push({
            sourceFqdn: unique[i] as string,
            targetFqdn: unique[j] as string,
            type: "APPEARS_IN_SAME_OFFICIAL_REPORT",
            confidence: 55,
            rationale: "Both domains were matched in the same configured source document.",
            limitations:
              "Co-occurrence in a document indicates only that one document names both. It does " +
              "not connect the entities behind them.",
            relationSource: "Relationship Analysis Agent (deterministic rule)",
            observedAt,
          });
        }
      }
    }

    for (const relationship of relationships.slice(0, 40)) {
      evidence.push({
        fqdn: relationship.sourceFqdn,
        kind: "INFERRED_RELATIONSHIP",
        title: `Proposed relationship: ${relationship.type}`,
        description: `${relationship.rationale} Target: ${relationship.targetFqdn}. Confidence ${relationship.confidence}/100.`,
        sourceUrl: null,
        sourceLabel: relationship.relationSource,
        collectedAt: observedAt,
        collectionMethod: "CORRELATION_ANALYSIS",
        confidence: relationship.confidence,
        limitations: `${relationship.limitations} ${SIGNAL_NOT_DETERMINATION_NOTICE}`,
        origin: "SIMULATED_DEMO",
        rawReference: { type: relationship.type, target: relationship.targetFqdn },
      });
    }

    return {
      summary:
        `Proposed ${relationships.length} relationship(s) across ${input.domains.length} candidate(s) ` +
        "using deterministic correlation rules.",
      metrics: {
        domainsAnalysed: input.domains.length,
        relationshipsProposed: relationships.length,
        averageConfidence:
          relationships.length === 0
            ? 0
            : Math.round(
                relationships.reduce((sum, r) => sum + r.confidence, 0) / relationships.length,
              ),
      },
      warnings,
      origin: "SIMULATED_DEMO",
      simulationNote:
        "Relationships were derived from simulated observations by deterministic rules. No " +
        "language model was involved, and none of these edges establishes ownership or control.",
      relationships,
      evidence,
    };
  },
};

// ---------------------------------------------------------------------------
// Agent 6 — Evidence & Reporting
// ---------------------------------------------------------------------------

export const evidenceReportingAgent: EvidenceReportingAgent = {
  key: "EVIDENCE_REPORTING",
  label: AGENT_LABELS.EVIDENCE_REPORTING,
  purpose: AGENT_PURPOSES.EVIDENCE_REPORTING,
  inputSchema: evidenceReportingInputSchema,
  outputSchema: evidenceReportingOutputSchema,
  requiredScopes: [],

  async execute(
    input: EvidenceReportingInput,
    _context: AgentExecutionContext,
  ): Promise<EvidenceReportingOutput> {
    const assessments: EvidenceReportingOutput["assessments"] = input.domains.map((domain) => {
      const missingFactors: string[] = [];
      if (!domain.hasObservedFact) missingFactors.push("No observed fact has been recorded.");
      if (!domain.hasReviewerAssessment) {
        missingFactors.push("No named reviewer has recorded an assessment.");
      }
      if (domain.regulatoryMatchCount === 0) {
        missingFactors.push("Not yet checked against any configured official source.");
      }
      if (domain.evidenceCompleteness < 50) {
        missingFactors.push("Evidence completeness is below 50%.");
      }

      const reportable = domain.hasObservedFact && domain.hasReviewerAssessment;

      // Deliberately capped at MEDIUM. An agent can suggest that something
      // deserves attention; only a human can escalate it.
      const suggestedPriority =
        domain.evidenceCompleteness >= 70
          ? ("MEDIUM" as const)
          : domain.evidenceCompleteness >= 30
            ? ("LOW" as const)
            : ("UNTRIAGED" as const);

      return {
        domainId: domain.domainId,
        fqdn: domain.fqdn,
        completeness: domain.evidenceCompleteness,
        reportable,
        missingFactors,
        suggestedPriority,
        rationale: reportable
          ? "Has at least one observed fact and a recorded reviewer assessment, so it can support a report draft."
          : `Not yet reportable: ${missingFactors.join(" ")}`,
      };
    });

    const reportable = assessments.filter((assessment) => assessment.reportable);
    const unchecked = input.domains.filter((domain) => !domain.hasObservedFact);

    const draftExecutiveSummary =
      `Scan ${input.scanReference} examined ${input.domains.length} candidate domain(s) associated ` +
      `with the search term "${input.brand}". ${reportable.length} candidate(s) currently carry ` +
      `both an observed fact and a reviewer assessment; ${unchecked.length} have no observed fact ` +
      "at all and are recorded as unchecked. This draft is a starting point for a human reviewer " +
      "and contains no conclusion about any domain.";

    const draftFindings =
      "OBSERVED FACTS\n" +
      `- ${input.domains.length - unchecked.length} candidate(s) have at least one timestamped observation.\n` +
      `- ${input.domains.filter((d) => d.regulatoryMatchCount > 0).length} candidate(s) matched a configured source.\n\n` +
      "AI-GENERATED INTERPRETATION (not observation)\n" +
      "- Completeness scores and suggested priorities below were produced by Sentinel's " +
      "deterministic scoring rules. They order work; they do not characterise any domain.\n\n" +
      "NOT ESTABLISHED\n" +
      "- Who operates any of these sites.\n" +
      "- Whether any of them is authorised or unauthorised.\n" +
      "- Any relationship between their operators.";

    const draftLimitations =
      "This draft rests on the evidence recorded by this scan only. " +
      `${unchecked.length} candidate(s) were never successfully checked and nothing may be inferred ` +
      "from that. Similarity scores are investigative signals, not findings. Absence from a " +
      "warning list is not authorisation. Shared infrastructure is not shared ownership. " +
      "No conclusion in this draft has been verified by a human reviewer.";

    return {
      summary:
        `Scored ${input.domains.length} candidate(s): ${reportable.length} reportable, ` +
        `${input.domains.length - reportable.length} missing at least one required factor.`,
      metrics: {
        candidatesScored: input.domains.length,
        reportable: reportable.length,
        missingFactors: input.domains.length - reportable.length,
        averageCompleteness:
          input.domains.length === 0
            ? 0
            : Math.round(
                input.domains.reduce((sum, d) => sum + d.evidenceCompleteness, 0) /
                  input.domains.length,
              ),
      },
      warnings:
        reportable.length === 0
          ? [
              {
                code: "NOTHING_REPORTABLE",
                message:
                  "No candidate yet has both an observed fact and a reviewer assessment, so no " +
                  "report can be substantiated from this scan alone.",
              },
            ]
          : [],
      origin: "SIMULATED_DEMO",
      simulationNote:
        "Completeness scoring ran over simulated evidence. The draft text below is a template for " +
        "a human reviewer, not an analytical conclusion.",
      assessments,
      draftExecutiveSummary,
      draftFindings,
      draftLimitations,
      evidence: [],
    };
  },
};

export const SENTINEL_AGENTS = {
  webDiscovery: webDiscoveryAgent,
  domainEnumeration: domainEnumerationAgent,
  websiteInspection: websiteInspectionAgent,
  regulatoryVerification: regulatoryVerificationAgent,
  relationshipAnalysis: relationshipAnalysisAgent,
  evidenceReporting: evidenceReportingAgent,
};
