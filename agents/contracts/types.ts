import { z } from "zod";

import { AGENT_KEYS, DISCOVERY_SCOPES, DNS_STATUSES, MATCH_TYPES, RELATIONSHIP_TYPES } from "@/lib/types/enums";
import type { AgentKey } from "@/lib/types/enums";
import type { ProviderContext, ProviderRegistry } from "@/agents/providers/types";

/**
 * Agent contracts.
 *
 * Each of the six agents has a Zod-validated input schema, a Zod-validated
 * output schema, and a typed error result. The orchestrator validates BOTH
 * directions: an agent that returns a malformed payload fails its task
 * loudly rather than quietly corrupting the registry.
 *
 * Agents never write to the repository. They return structured findings and
 * the orchestrator persists them, which keeps the audit trail in one place
 * and makes every agent trivially testable in isolation.
 */

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

export const dataOriginSchema = z.enum(["SIMULATED_DEMO", "LIVE_COLLECTED"]);

/** 0-100 investigative confidence. Never a legal determination. */
export const confidenceSchema = z.number().int().min(0).max(100);

export const fqdnSchema = z
  .string()
  .trim()
  .min(3)
  .max(253)
  .regex(/^[a-z0-9.-]+$/i, "Must be a hostname");

export const agentFindingSchema = z.object({
  fqdn: fqdnSchema,
  /** Discovery source key, matching lib/demo/fixtures/static-specs.ts. */
  sourceKey: z.string().min(1),
  detail: z.string().nullable(),
  observedAt: z.string().datetime(),
});
export type AgentFinding = z.infer<typeof agentFindingSchema>;

/**
 * An evidence item an agent wants recorded. The orchestrator attaches it to
 * the right domain, scan and task, and persists it with its origin.
 */
export const agentEvidenceSchema = z.object({
  fqdn: fqdnSchema.nullable(),
  kind: z.enum([
    "OBSERVED_FACT",
    "INFERRED_RELATIONSHIP",
    "OFFICIAL_SOURCE_MATCH",
    "REVIEWER_ASSESSMENT",
    "UNVERIFIED_CLAIM",
  ]),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  sourceUrl: z.string().url().nullable(),
  sourceLabel: z.string().nullable(),
  collectedAt: z.string().datetime(),
  collectionMethod: z.enum([
    "SIMULATED_DEMO_FIXTURE",
    "SEARCH_PROVIDER",
    "DNS_LOOKUP",
    "HTTP_RESPONSE",
    "TLS_CERTIFICATE",
    "CERTIFICATE_TRANSPARENCY_LOG",
    "REGULATORY_SOURCE_RETRIEVAL",
    "LANGUAGE_MODEL_INFERENCE",
    "CORRELATION_ANALYSIS",
    "HUMAN_REVIEW",
  ]),
  confidence: confidenceSchema.nullable(),
  /** Required. What this item does NOT establish. */
  limitations: z.string().min(1),
  origin: dataOriginSchema,
  rawReference: z.unknown().nullable(),
});
export type AgentEvidence = z.infer<typeof agentEvidenceSchema>;

/** Technical observations the orchestrator merges into a domain record. */
export const domainObservationSchema = z.object({
  fqdn: fqdnSchema,
  observedAt: z.string().datetime(),
  dnsStatus: z.enum(DNS_STATUSES).nullable().optional(),
  resolvedIpCount: z.number().int().min(0).nullable().optional(),
  httpStatusCode: z.number().int().min(100).max(599).nullable().optional(),
  redirectsToUrl: z.string().url().nullable().optional(),
  siteTitle: z.string().max(500).nullable().optional(),
  siteDescription: z.string().max(2000).nullable().optional(),
  siteLanguage: z.string().max(20).nullable().optional(),
  detectedTechnologies: z.array(z.string()).optional(),
  certIssuer: z.string().nullable().optional(),
  certSubjectCommonName: z.string().nullable().optional(),
  certNotBefore: z.string().datetime().nullable().optional(),
  certNotAfter: z.string().datetime().nullable().optional(),
  certFingerprintSha256: z.string().nullable().optional(),
  brandSimilarityScore: confidenceSchema.nullable().optional(),
  contentSimilarityScore: confidenceSchema.nullable().optional(),
  similarityRationale: z.string().nullable().optional(),
});
export type DomainObservation = z.infer<typeof domainObservationSchema>;

export const agentRelationshipSchema = z.object({
  sourceFqdn: fqdnSchema,
  targetFqdn: fqdnSchema,
  type: z.enum(RELATIONSHIP_TYPES),
  confidence: confidenceSchema,
  rationale: z.string().min(10),
  /** Required. A relationship without stated limitations is not acceptable. */
  limitations: z.string().min(10),
  relationSource: z.string().min(1),
  observedAt: z.string().datetime(),
});
export type AgentRelationship = z.infer<typeof agentRelationshipSchema>;

export const agentWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
});

/** The common envelope every agent returns on success. */
export const agentOutputBaseSchema = z.object({
  /** Short, factual sentence shown on the scan timeline. */
  summary: z.string().min(1).max(500),
  metrics: z.record(z.string(), z.number()),
  warnings: z.array(agentWarningSchema),
  origin: dataOriginSchema,
  /** Present whenever the output is simulated. Rendered verbatim in the UI. */
  simulationNote: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Agent 1: WebDiscoveryAgent
// ---------------------------------------------------------------------------

export const webDiscoveryInputSchema = z.object({
  brand: z.string().min(1).max(200),
  seedDomain: fqdnSchema.nullable(),
  maxCandidates: z.number().int().min(1).max(2000),
});
export type WebDiscoveryInput = z.infer<typeof webDiscoveryInputSchema>;

export const webDiscoveryOutputSchema = agentOutputBaseSchema.extend({
  findings: z.array(agentFindingSchema),
  evidence: z.array(agentEvidenceSchema),
});
export type WebDiscoveryOutput = z.infer<typeof webDiscoveryOutputSchema>;

// ---------------------------------------------------------------------------
// Agent 2: DomainEnumerationAgent
// ---------------------------------------------------------------------------

export const domainEnumerationInputSchema = z.object({
  brand: z.string().min(1).max(200),
  seedDomain: fqdnSchema.nullable(),
  /** Hosts already discovered, so enumeration does not re-propose them. */
  knownFqdns: z.array(fqdnSchema),
  maxCandidates: z.number().int().min(1).max(2000),
  includeCertificateTransparency: z.boolean(),
});
export type DomainEnumerationInput = z.infer<typeof domainEnumerationInputSchema>;

export const domainEnumerationOutputSchema = agentOutputBaseSchema.extend({
  findings: z.array(agentFindingSchema),
  observations: z.array(domainObservationSchema),
  evidence: z.array(agentEvidenceSchema),
  /**
   * Candidates generated but NOT verified. Reported separately so the UI can
   * say plainly that they were never checked.
   */
  unverifiedCandidateCount: z.number().int().min(0),
});
export type DomainEnumerationOutput = z.infer<typeof domainEnumerationOutputSchema>;

// ---------------------------------------------------------------------------
// Agent 3: WebsiteInspectionAgent
// ---------------------------------------------------------------------------

export const websiteInspectionInputSchema = z.object({
  fqdns: z.array(fqdnSchema).max(500),
  brand: z.string().min(1).max(200),
  seedDomain: fqdnSchema.nullable(),
});
export type WebsiteInspectionInput = z.infer<typeof websiteInspectionInputSchema>;

export const websiteInspectionOutputSchema = agentOutputBaseSchema.extend({
  observations: z.array(domainObservationSchema),
  evidence: z.array(agentEvidenceSchema),
  relationships: z.array(agentRelationshipSchema),
  /** Hosts whose inspection failed. Recorded as failures, not findings. */
  failures: z.array(z.object({ fqdn: fqdnSchema, code: z.string(), message: z.string() })),
});
export type WebsiteInspectionOutput = z.infer<typeof websiteInspectionOutputSchema>;

// ---------------------------------------------------------------------------
// Agent 4: RegulatoryVerificationAgent
// ---------------------------------------------------------------------------

export const regulatoryVerificationInputSchema = z.object({
  brand: z.string().min(1).max(200),
  /** Candidate domains to look for, with the ids the orchestrator assigned. */
  candidates: z.array(z.object({ fqdn: fqdnSchema, domainId: z.string() })),
  sources: z.array(
    z.object({
      sourceId: z.string(),
      authorityShortName: z.string(),
      title: z.string(),
      sourceUrl: z.string(),
      isFixtureSource: z.boolean(),
      isEnabled: z.boolean(),
    }),
  ),
});
export type RegulatoryVerificationInput = z.infer<typeof regulatoryVerificationInputSchema>;

export const regulatoryVerificationOutputSchema = agentOutputBaseSchema.extend({
  checks: z.array(
    z.object({
      sourceId: z.string(),
      startedAt: z.string().datetime(),
      completedAt: z.string().datetime(),
      status: z.enum([
        "NEVER_CHECKED",
        "OK",
        "STALE",
        "UNREACHABLE",
        "HTTP_ERROR",
        "PARSE_ERROR",
        "BLOCKED_BY_SOURCE",
        "DISABLED",
      ]),
      httpStatusCode: z.number().int().nullable(),
      bytesRetrieved: z.number().int().nullable(),
      matchedEntityCount: z.number().int().min(0),
      errorMessage: z.string().nullable(),
      note: z.string().nullable(),
    }),
  ),
  matches: z.array(
    z.object({
      sourceId: z.string(),
      domainId: z.string().nullable(),
      fqdn: fqdnSchema.nullable(),
      matchedTerm: z.string(),
      matchedContext: z.string(),
      matchType: z.enum(MATCH_TYPES),
      confidence: confidenceSchema,
      sourceUrl: z.string(),
      sourceRetrievedAt: z.string().datetime(),
      notes: z.string().nullable(),
    }),
  ),
  /**
   * Entities checked against a source with no match found. Recorded so a
   * non-match is visible as a completed check — and so the UI can state that
   * absence from a list is not authorisation.
   */
  checkedWithoutMatch: z.array(
    z.object({ sourceId: z.string(), term: z.string(), fqdn: fqdnSchema.nullable() }),
  ),
  /** Sources deliberately not contacted, with the reason. */
  skippedSources: z.array(z.object({ sourceId: z.string(), reason: z.string() })),
  evidence: z.array(agentEvidenceSchema),
});
export type RegulatoryVerificationOutput = z.infer<typeof regulatoryVerificationOutputSchema>;

// ---------------------------------------------------------------------------
// Agent 5: RelationshipAnalysisAgent
// ---------------------------------------------------------------------------

export const relationshipAnalysisInputSchema = z.object({
  brand: z.string().min(1).max(200),
  seedDomain: fqdnSchema.nullable(),
  domains: z.array(
    z.object({
      domainId: z.string(),
      fqdn: fqdnSchema,
      registrableDomain: z.string(),
      httpStatusCode: z.number().int().nullable(),
      redirectsToUrl: z.string().nullable(),
      certFingerprintSha256: z.string().nullable(),
      siteTitle: z.string().nullable(),
      brandSimilarityScore: z.number().int().nullable(),
      contentSimilarityScore: z.number().int().nullable(),
    }),
  ),
  /** Regulatory matches, so co-occurrence edges can be proposed. */
  regulatoryMatches: z.array(z.object({ sourceId: z.string(), fqdn: fqdnSchema })),
});
export type RelationshipAnalysisInput = z.infer<typeof relationshipAnalysisInputSchema>;

export const relationshipAnalysisOutputSchema = agentOutputBaseSchema.extend({
  relationships: z.array(agentRelationshipSchema),
  evidence: z.array(agentEvidenceSchema),
});
export type RelationshipAnalysisOutput = z.infer<typeof relationshipAnalysisOutputSchema>;

// ---------------------------------------------------------------------------
// Agent 6: EvidenceReportingAgent
// ---------------------------------------------------------------------------

export const evidenceReportingInputSchema = z.object({
  brand: z.string().min(1).max(200),
  scanReference: z.string(),
  domains: z.array(
    z.object({
      domainId: z.string(),
      fqdn: fqdnSchema,
      evidenceCompleteness: z.number().int().min(0).max(100),
      reviewStatus: z.string(),
      hasObservedFact: z.boolean(),
      hasReviewerAssessment: z.boolean(),
      regulatoryMatchCount: z.number().int().min(0),
    }),
  ),
});
export type EvidenceReportingInput = z.infer<typeof evidenceReportingInputSchema>;

export const evidenceReportingOutputSchema = agentOutputBaseSchema.extend({
  /** Per-domain completeness assessment with the specific gaps named. */
  assessments: z.array(
    z.object({
      domainId: z.string(),
      fqdn: fqdnSchema,
      completeness: z.number().int().min(0).max(100),
      reportable: z.boolean(),
      missingFactors: z.array(z.string()),
      /** Suggested triage priority. Capped at MEDIUM — see the orchestrator. */
      suggestedPriority: z.enum(["MEDIUM", "LOW", "UNTRIAGED"]),
      rationale: z.string(),
    }),
  ),
  /** Draft text the reviewer may use as a starting point for a report. */
  draftExecutiveSummary: z.string(),
  draftFindings: z.string(),
  draftLimitations: z.string(),
  evidence: z.array(agentEvidenceSchema),
});
export type EvidenceReportingOutput = z.infer<typeof evidenceReportingOutputSchema>;

// ---------------------------------------------------------------------------
// The agent interface
// ---------------------------------------------------------------------------

export interface AgentExecutionContext extends ProviderContext {
  providers: ProviderRegistry;
  scanId: string;
  scanReference: string;
  /** Scopes the operator selected; agents respect them. */
  scopes: ReadonlyArray<(typeof DISCOVERY_SCOPES)[number]>;
}

export class AgentValidationError extends Error {
  constructor(
    public readonly agentKey: AgentKey,
    public readonly direction: "input" | "output",
    public readonly issues: string[],
  ) {
    super(
      `${agentKey} ${direction} failed validation: ${issues.join("; ")}. ` +
        "The task was failed rather than persisting an unvalidated payload.",
    );
    this.name = "AgentValidationError";
  }
}

export class AgentExecutionError extends Error {
  constructor(
    public readonly agentKey: AgentKey,
    message: string,
    public readonly retryable: boolean,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AgentExecutionError";
  }
}

/**
 * A Sentinel agent: a validated, bounded, single-shot transformation.
 *
 * Deliberately NOT an autonomous loop. Each agent is called once per scan by
 * the orchestrator with explicit input, runs to completion or fails, and
 * returns a typed result. Control flow lives in the orchestrator where it can
 * be read, tested and audited.
 */
export interface SentinelAgent<TInput, TOutput> {
  readonly key: AgentKey;
  readonly label: string;
  readonly purpose: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  /** Scopes that must be selected for this agent to contribute. */
  readonly requiredScopes: ReadonlyArray<(typeof DISCOVERY_SCOPES)[number]>;
  execute(input: TInput, context: AgentExecutionContext): Promise<TOutput>;
}

export type WebDiscoveryAgent = SentinelAgent<WebDiscoveryInput, WebDiscoveryOutput>;
export type DomainEnumerationAgent = SentinelAgent<
  DomainEnumerationInput,
  DomainEnumerationOutput
>;
export type WebsiteInspectionAgent = SentinelAgent<
  WebsiteInspectionInput,
  WebsiteInspectionOutput
>;
export type RegulatoryVerificationAgent = SentinelAgent<
  RegulatoryVerificationInput,
  RegulatoryVerificationOutput
>;
export type RelationshipAnalysisAgent = SentinelAgent<
  RelationshipAnalysisInput,
  RelationshipAnalysisOutput
>;
export type EvidenceReportingAgent = SentinelAgent<
  EvidenceReportingInput,
  EvidenceReportingOutput
>;

export interface AgentSuite {
  webDiscovery: WebDiscoveryAgent;
  domainEnumeration: DomainEnumerationAgent;
  websiteInspection: WebsiteInspectionAgent;
  regulatoryVerification: RegulatoryVerificationAgent;
  relationshipAnalysis: RelationshipAnalysisAgent;
  evidenceReporting: EvidenceReportingAgent;
}

/** Validates in both directions and converts Zod issues into a typed error. */
export async function runAgent<TInput, TOutput>(
  agent: SentinelAgent<TInput, TOutput>,
  rawInput: unknown,
  context: AgentExecutionContext,
): Promise<TOutput> {
  const parsedInput = agent.inputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new AgentValidationError(
      agent.key,
      "input",
      parsedInput.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }

  const output = await agent.execute(parsedInput.data, context);

  const parsedOutput = agent.outputSchema.safeParse(output);
  if (!parsedOutput.success) {
    throw new AgentValidationError(
      agent.key,
      "output",
      parsedOutput.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  return parsedOutput.data;
}

export const ALL_AGENT_KEYS: readonly AgentKey[] = AGENT_KEYS;
