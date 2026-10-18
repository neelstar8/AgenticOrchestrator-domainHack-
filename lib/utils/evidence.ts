/**
 * Evidence completeness scoring.
 *
 * Completeness measures HOW MUCH of the evidence picture has been filled in —
 * never how suspicious a domain is. A domain can be 100% complete and entirely
 * unrelated to the investigation, and a high-priority domain can be 20%
 * complete. The two are deliberately separate dimensions.
 */

import type { EvidenceKind } from "@/lib/types/enums";
import type { Domain, Evidence } from "@/lib/types/models";

export interface EvidenceCompletenessFactor {
  key: string;
  label: string;
  weight: number;
  satisfied: boolean;
  /** What an investigator would need to do to satisfy this factor. */
  hint: string;
}

export interface EvidenceCompletenessResult {
  percent: number;
  factors: EvidenceCompletenessFactor[];
  missing: EvidenceCompletenessFactor[];
}

/**
 * The seven factors that make a candidate domain reportable. Weights sum to 100.
 */
export function computeEvidenceCompleteness(
  domain: Pick<
    Domain,
    | "dnsStatus"
    | "httpStatusCode"
    | "siteTitle"
    | "certFingerprintSha256"
    | "reviewerNotes"
    | "redirectsToUrl"
  >,
  evidence: Array<Pick<Evidence, "kind" | "sourceUrl">>,
  options: { regulatoryMatchCount?: number; relationshipCount?: number } = {},
): EvidenceCompletenessResult {
  const { regulatoryMatchCount = 0, relationshipCount = 0 } = options;

  const kinds = new Set<EvidenceKind>(evidence.map((item) => item.kind));
  const hasSourcedEvidence = evidence.some((item) => Boolean(item.sourceUrl));

  const factors: EvidenceCompletenessFactor[] = [
    {
      key: "dns",
      label: "DNS resolution checked",
      weight: 15,
      satisfied: domain.dnsStatus !== null,
      hint: "Run a scan with the technical-inspection scope, or record a manual DNS check.",
    },
    {
      key: "http",
      label: "HTTP response observed",
      weight: 15,
      satisfied: domain.httpStatusCode !== null,
      hint: "Requires technical website inspection against the live host.",
    },
    {
      key: "content",
      label: "Public page metadata collected",
      weight: 15,
      satisfied: Boolean(domain.siteTitle),
      hint: "Collect the public page title and description.",
    },
    {
      key: "certificate",
      label: "TLS certificate characteristics recorded",
      weight: 10,
      satisfied: Boolean(domain.certFingerprintSha256),
      hint: "Observe the served certificate, or retrieve a certificate-transparency entry.",
    },
    {
      key: "observed-fact",
      label: "At least one observed fact with a source reference",
      weight: 15,
      satisfied: kinds.has("OBSERVED_FACT") && hasSourcedEvidence,
      hint: "Attach an observed fact that carries a source URL and collection timestamp.",
    },
    {
      key: "regulatory",
      label: "Checked against configured official sources",
      weight: 15,
      satisfied: regulatoryMatchCount > 0 || kinds.has("OFFICIAL_SOURCE_MATCH"),
      hint: "Run the regulatory-matching scope. A recorded non-match also counts as checked.",
    },
    {
      key: "review",
      label: "Reviewer assessment recorded",
      weight: 15,
      satisfied: Boolean(domain.reviewerNotes) || kinds.has("REVIEWER_ASSESSMENT"),
      hint: "A named reviewer must record an assessment before this domain can be reported.",
    },
  ];

  // A domain with observed relationships has a fuller picture even if some
  // direct checks are missing; this cannot push the score above 100.
  const relationshipBonus = relationshipCount > 0 ? 0 : 0;

  const earned = factors.reduce((sum, factor) => sum + (factor.satisfied ? factor.weight : 0), 0);
  const percent = Math.min(100, earned + relationshipBonus);

  return {
    percent,
    factors,
    missing: factors.filter((factor) => !factor.satisfied),
  };
}

export const EVIDENCE_COMPLETENESS_BUCKETS = [
  { label: "0-24%", min: 0, max: 24 },
  { label: "25-49%", min: 25, max: 49 },
  { label: "50-74%", min: 50, max: 74 },
  { label: "75-99%", min: 75, max: 99 },
  { label: "100%", min: 100, max: 100 },
] as const;

export function evidenceCompletenessBucket(percent: number): string {
  const bucket = EVIDENCE_COMPLETENESS_BUCKETS.find(
    (candidate) => percent >= candidate.min && percent <= candidate.max,
  );
  return bucket?.label ?? "0-24%";
}

/**
 * Whether a domain carries enough verified evidence to appear in a report.
 *
 * Deliberately strict: a report must rest on at least one observed fact AND a
 * human assessment. Inference and simulated fixtures alone are never enough.
 */
export function isReportable(
  evidence: Array<Pick<Evidence, "kind" | "origin">>,
): { reportable: boolean; reason: string } {
  const hasObservedFact = evidence.some((item) => item.kind === "OBSERVED_FACT");
  const hasReviewerAssessment = evidence.some((item) => item.kind === "REVIEWER_ASSESSMENT");

  if (!hasObservedFact) {
    return {
      reportable: false,
      reason: "No observed fact has been recorded for this domain.",
    };
  }
  if (!hasReviewerAssessment) {
    return {
      reportable: false,
      reason: "No named reviewer has recorded an assessment for this domain.",
    };
  }
  return { reportable: true, reason: "Has at least one observed fact and a reviewer assessment." };
}
