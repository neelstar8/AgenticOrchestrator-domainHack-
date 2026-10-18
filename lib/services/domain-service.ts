import "server-only";

import { getRepository } from "@/lib/repositories";
import type { Domain } from "@/lib/types/models";
import type {
  DomainDetail,
  DomainListItem,
  DomainQuery,
  Paginated,
  RelationshipGraph,
  RelationshipQuery,
  RelationshipWithEndpoints,
} from "@/lib/types/views";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/auth/guards";
import type { BulkDomainReviewDto, UpdateDomainReviewDto } from "@/lib/validation/schemas";
import {
  DNS_STATUS_LABELS,
  EVIDENCE_KIND_LABELS,
  NOT_CHECKED_LABEL,
  PRIORITY_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/utils/labels";
import { formatDateTime, formatHttpStatus } from "@/lib/utils/format";

/**
 * Domain registry service.
 *
 * Review status is the one place a human judgement is written onto a domain,
 * so this service enforces that the judgement is attributable: a status change
 * records who made it, when, and why, and the dismissive statuses require a
 * stated reason (the schema enforces that, this service records it).
 */

export async function listDomains(
  auth: AuthenticatedUser,
  query: DomainQuery,
): Promise<Paginated<DomainListItem>> {
  if (!auth.can("domains:read")) throw new ForbiddenError("domains:read", auth.user.role);
  const repository = await getRepository();
  return repository.listDomains(query);
}

export async function getDomainDetail(
  auth: AuthenticatedUser,
  idOrFqdn: string,
): Promise<DomainDetail | null> {
  if (!auth.can("domains:read")) throw new ForbiddenError("domains:read", auth.user.role);
  const repository = await getRepository();
  return repository.getDomainDetail(idOrFqdn);
}

export async function listDomainFilterOptions(auth: AuthenticatedUser) {
  if (!auth.can("domains:read")) throw new ForbiddenError("domains:read", auth.user.role);
  const repository = await getRepository();

  const [platforms, sources, suffixes, users] = await Promise.all([
    repository.listPlatforms(),
    repository.listDiscoverySources(),
    repository.listDomainSuffixes(),
    repository.listUsers(),
  ]);

  return {
    platforms: platforms.map((platform) => ({
      id: platform.id,
      name: platform.name,
      investigationId: platform.investigationId,
    })),
    discoverySources: sources.map((source) => ({
      key: source.key,
      name: source.name,
      kind: source.kind,
    })),
    suffixes,
    reviewers: users
      .filter((user) => user.role !== "VIEWER")
      .map((user) => ({ id: user.id, name: user.name, role: user.role })),
  };
}

export async function updateDomainReview(
  auth: AuthenticatedUser,
  id: string,
  input: UpdateDomainReviewDto,
  requestId: string,
): Promise<Domain> {
  if (!auth.can("domains:review")) throw new ForbiddenError("domains:review", auth.user.role);

  const repository = await getRepository();
  const existing = await repository.getDomainById(id);
  if (!existing) throw new Error(`Domain "${id}" was not found.`);

  const now = new Date().toISOString();
  const assignedReviewerId =
    input.assignedReviewerId === "" || input.assignedReviewerId === null
      ? null
      : input.assignedReviewerId;

  const updated = await repository.updateDomainReview(id, {
    reviewStatus: input.reviewStatus,
    priority: input.priority,
    assignedReviewerId,
    reviewerNotes: input.reviewerNotes,
    // A review timestamp is only meaningful when a judgement was recorded.
    reviewedAt:
      input.reviewStatus !== undefined || input.reviewerNotes !== undefined ? now : undefined,
  });

  if (input.reviewStatus !== undefined && input.reviewStatus !== existing.reviewStatus) {
    await repository.appendAuditEvent({
      actorId: auth.user.id,
      actorLabel: auth.user.name,
      action: "REVIEW_STATUS_CHANGED",
      entityType: "DOMAIN",
      entityId: id,
      entityLabel: existing.fqdn,
      previousState: { reviewStatus: existing.reviewStatus, priority: existing.priority },
      newState: { reviewStatus: updated.reviewStatus, priority: updated.priority },
      reason: input.reason ?? input.reviewerNotes ?? null,
      requestId,
    });
  }

  if (
    input.assignedReviewerId !== undefined &&
    assignedReviewerId !== existing.assignedReviewerId
  ) {
    const reviewer = assignedReviewerId
      ? await repository.getUserById(assignedReviewerId)
      : null;
    await repository.appendAuditEvent({
      actorId: auth.user.id,
      actorLabel: auth.user.name,
      action: "REVIEWER_ASSIGNED",
      entityType: "DOMAIN",
      entityId: id,
      entityLabel: existing.fqdn,
      previousState: { assignedReviewerId: existing.assignedReviewerId },
      newState: { assignedReviewerId: assignedReviewerId ?? null, assignedReviewerName: reviewer?.name ?? null },
      reason: input.reason ?? null,
      requestId,
    });
  }

  // A reviewer's note is evidence in its own right, with its own label.
  if (input.reviewerNotes && input.reviewerNotes !== existing.reviewerNotes) {
    const evidence = await repository.createEvidence({
      domainId: id,
      kind: "REVIEWER_ASSESSMENT",
      title: "Reviewer assessment recorded",
      description: input.reviewerNotes,
      sourceLabel: `Human review by ${auth.user.name}`,
      collectedAt: now,
      collectionMethod: "HUMAN_REVIEW",
      limitations:
        "A reviewer's professional judgement about the evidence on file. It is not a legal " +
        "determination and does not establish anything beyond what that evidence shows.",
      origin: "SIMULATED_DEMO",
      createdById: auth.user.id,
    });
    await repository.appendAuditEvent({
      actorId: auth.user.id,
      actorLabel: auth.user.name,
      action: "EVIDENCE_ADDED",
      entityType: "EVIDENCE",
      entityId: evidence.id,
      entityLabel: "Reviewer assessment",
      newState: { kind: "REVIEWER_ASSESSMENT", domainId: id },
      requestId,
    });
  }

  if (input.priority !== undefined && input.priority !== existing.priority) {
    await repository.appendAuditEvent({
      actorId: auth.user.id,
      actorLabel: auth.user.name,
      action: "DOMAIN_UPDATED",
      entityType: "DOMAIN",
      entityId: id,
      entityLabel: existing.fqdn,
      previousState: { priority: existing.priority },
      newState: { priority: input.priority },
      reason: input.reason ?? `Priority set by ${auth.user.name}.`,
      requestId,
    });
  }

  return repository.recomputeDomainEvidenceCompleteness(id);
}

export interface BulkReviewResult {
  updated: number;
  skipped: Array<{ id: string; reason: string }>;
}

export async function bulkUpdateDomainReview(
  auth: AuthenticatedUser,
  input: BulkDomainReviewDto,
  requestId: string,
): Promise<BulkReviewResult> {
  if (!auth.can("domains:bulkReview")) {
    throw new ForbiddenError("domains:bulkReview", auth.user.role);
  }

  const repository = await getRepository();
  const skipped: Array<{ id: string; reason: string }> = [];
  let updated = 0;

  for (const id of input.domainIds) {
    const existing = await repository.getDomainById(id);
    if (!existing) {
      skipped.push({ id, reason: "Not found." });
      continue;
    }
    // A bulk action must not quietly undo a considered individual decision.
    if (existing.reviewStatus === "INCLUDED_IN_REPORT") {
      skipped.push({
        id,
        reason: `${existing.fqdn} is already included in a report; change it individually.`,
      });
      continue;
    }

    await repository.updateDomainReview(id, {
      reviewStatus: input.reviewStatus,
      priority: input.priority,
      reviewedAt: new Date().toISOString(),
    });
    await repository.appendAuditEvent({
      actorId: auth.user.id,
      actorLabel: auth.user.name,
      action: "REVIEW_STATUS_CHANGED",
      entityType: "DOMAIN",
      entityId: id,
      entityLabel: existing.fqdn,
      previousState: { reviewStatus: existing.reviewStatus, priority: existing.priority },
      newState: { reviewStatus: input.reviewStatus, priority: input.priority ?? existing.priority },
      reason: `Bulk update (${input.domainIds.length} domains): ${input.reason}`,
      requestId,
    });
    updated += 1;
  }

  return { updated, skipped };
}

// --- relationships --------------------------------------------------------

export async function getRelationshipGraph(
  auth: AuthenticatedUser,
  query: RelationshipQuery,
): Promise<RelationshipGraph> {
  if (!auth.can("relationships:read")) {
    throw new ForbiddenError("relationships:read", auth.user.role);
  }
  const repository = await getRepository();
  return repository.getRelationshipGraph(query);
}

export async function confirmRelationship(
  auth: AuthenticatedUser,
  id: string,
  reason: string,
  requestId: string,
): Promise<RelationshipWithEndpoints> {
  if (!auth.can("relationships:confirm")) {
    throw new ForbiddenError("relationships:confirm", auth.user.role);
  }

  const repository = await getRepository();
  const now = new Date().toISOString();
  const confirmed = await repository.confirmRelationship(id, now);

  await repository.appendAuditEvent({
    actorId: auth.user.id,
    actorLabel: auth.user.name,
    action: "RELATIONSHIP_RECORDED",
    entityType: "DOMAIN_RELATIONSHIP",
    entityId: id,
    entityLabel: `${confirmed.sourceDomain.fqdn} -> ${confirmed.targetDomain.fqdn}`,
    previousState: { reviewerConfirmed: false },
    newState: { reviewerConfirmed: true, confirmedBy: auth.user.name },
    reason,
    requestId,
  });

  return confirmed;
}

// --- CSV export -----------------------------------------------------------

/** RFC 4180 quoting, so a field containing a comma or quote survives. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function exportDomainsCsv(
  auth: AuthenticatedUser,
  query: DomainQuery,
  requestId: string,
): Promise<{ csv: string; rowCount: number; filename: string }> {
  if (!auth.can("domains:export")) throw new ForbiddenError("domains:export", auth.user.role);

  const repository = await getRepository();
  const domains = await repository.listAllDomainsForExport(query, 5000);

  const headers = [
    "Domain",
    "Registrable domain",
    "Public suffix",
    "Associated platform",
    "Investigation ID",
    "Associated names",
    "Discovery sources",
    "First seen (UTC)",
    "Last seen (UTC)",
    "Last checked (UTC)",
    "DNS status",
    "HTTP status",
    "Redirects to",
    "Certificate issuer",
    "Certificate fingerprint (SHA-256)",
    "Website title",
    "Brand similarity (0-100)",
    "Content similarity (0-100)",
    "Evidence completeness (%)",
    "Evidence items",
    "Official-source matches",
    "Relationships",
    "Review status",
    "Priority",
    "Assigned reviewer",
    "Reviewer notes",
    "Data origin",
    "Discovered by scan",
  ];

  const platforms = await repository.listPlatforms();
  const platformById = new Map(platforms.map((platform) => [platform.id, platform]));

  const rows = domains.map((domain) => {
    const platform = domain.seedPlatformId ? platformById.get(domain.seedPlatformId) : undefined;
    return [
      domain.fqdn,
      domain.registrableDomain,
      domain.suffix,
      domain.seedPlatform?.name ?? "",
      platform?.investigationId ?? "",
      domain.associatedNames.join("; "),
      domain.discoverySources.map((source) => source.name).join("; "),
      formatDateTime(domain.firstSeenAt),
      formatDateTime(domain.lastSeenAt),
      // "Not checked" is exported verbatim, so a spreadsheet cannot read an
      // empty cell as a negative result.
      domain.lastCheckedAt ? formatDateTime(domain.lastCheckedAt) : NOT_CHECKED_LABEL,
      domain.dnsStatus ? DNS_STATUS_LABELS[domain.dnsStatus] : NOT_CHECKED_LABEL,
      domain.httpStatusCode === null ? NOT_CHECKED_LABEL : formatHttpStatus(domain.httpStatusCode),
      domain.redirectsToUrl ?? NOT_CHECKED_LABEL,
      domain.certIssuer ?? NOT_CHECKED_LABEL,
      domain.certFingerprintSha256 ?? NOT_CHECKED_LABEL,
      domain.siteTitle ?? NOT_CHECKED_LABEL,
      domain.brandSimilarityScore ?? NOT_CHECKED_LABEL,
      domain.contentSimilarityScore ?? NOT_CHECKED_LABEL,
      domain.evidenceCompleteness,
      domain.evidenceCount,
      domain.regulatoryMatchCount,
      domain.relationshipCount,
      REVIEW_STATUS_LABELS[domain.reviewStatus],
      PRIORITY_LABELS[domain.priority],
      domain.assignedReviewer?.name ?? "",
      domain.reviewerNotes ?? "",
      domain.origin === "SIMULATED_DEMO"
        ? "SIMULATED DEMO DATA - not a real-world finding"
        : "Collected from live source",
      domain.discoveredByScanReference ?? "",
    ];
  });

  const simulatedCount = domains.filter((domain) => domain.origin === "SIMULATED_DEMO").length;
  const preamble = [
    "# Sentinel domain registry export",
    `# Exported at ${new Date().toISOString()} by ${auth.user.name}`,
    `# ${domains.length} row(s); ${simulatedCount} carry SIMULATED DEMO DATA.`,
    "# Similarity scores and discovery sources are investigative signals, not findings of",
    "# fraud, illegality or lack of authorisation. A field reading 'Not checked' means no check",
    "# was attempted - it is not a negative result.",
    "",
  ].join("\n");

  const csv = [
    preamble,
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");

  await repository.appendAuditEvent({
    actorId: auth.user.id,
    actorLabel: auth.user.name,
    action: "DOMAIN_UPDATED",
    entityType: "DOMAIN",
    entityId: "export",
    entityLabel: `CSV export of ${domains.length} domain(s)`,
    newState: { rowCount: domains.length, filters: query as never },
    reason: "Domain registry exported as CSV.",
    requestId,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    csv,
    rowCount: domains.length,
    filename: `sentinel-domains-${stamp}.csv`,
  };
}

/** Evidence CSV for one domain, used from the domain detail page. */
export async function exportDomainEvidenceCsv(
  auth: AuthenticatedUser,
  domainId: string,
): Promise<{ csv: string; filename: string } | null> {
  if (!auth.can("domains:export")) throw new ForbiddenError("domains:export", auth.user.role);

  const repository = await getRepository();
  const detail = await repository.getDomainDetail(domainId);
  if (!detail) return null;

  const headers = [
    "Evidence label",
    "Title",
    "Description",
    "Source URL",
    "Source",
    "Collected at (UTC)",
    "Collection method",
    "Confidence (0-100)",
    "Limitations",
    "Data origin",
  ];

  const rows = detail.evidence.map((item) => [
    EVIDENCE_KIND_LABELS[item.kind],
    item.title,
    item.description,
    item.sourceUrl ?? "",
    item.sourceLabel ?? "",
    formatDateTime(item.collectedAt),
    item.collectionMethod,
    item.confidence ?? "",
    item.limitations ?? "",
    item.origin === "SIMULATED_DEMO" ? "SIMULATED DEMO DATA" : "Collected from live source",
  ]);

  const csv = [
    `# Evidence for ${detail.fqdn}`,
    `# Exported at ${new Date().toISOString()} by ${auth.user.name}`,
    "# Every row carries an explicit evidence label. Inferred relationships and unverified",
    "# claims are not observations.",
    "",
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");

  return { csv, filename: `sentinel-evidence-${detail.fqdn}.csv` };
}
