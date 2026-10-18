/**
 * The in-memory dataset shape plus the pure query/composition functions that
 * both repository adapters share.
 *
 * Keeping filtering, sorting, pagination, view composition and metric
 * aggregation in one adapter-independent place means the file-backed demo and
 * the PostgreSQL deployment answer every question identically — there is no
 * second implementation of "what counts as awaiting review" to drift.
 *
 * These functions are pure: they never mutate the dataset they are given.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/config/constants";
import type {
  AgentKey,
  AuditEntityType,
  Priority,
  ReviewStatus,
  ScanStatus,
} from "@/lib/types/enums";
import type {
  AgentTask,
  ApplicationSetting,
  AuditEvent,
  DiscoverySource,
  Domain,
  DomainDiscoverySourceLink,
  DomainPlatformLink,
  DomainRelationship,
  Evidence,
  Platform,
  RegulatoryMatch,
  RegulatorySource,
  RegulatorySourceCheck,
  Report,
  ReportDomainLink,
  ReportEvidenceLink,
  Scan,
  UserWithSecret,
} from "@/lib/types/models";
import type {
  AuditEventListItem,
  AuditQuery,
  DomainDetail,
  DomainListItem,
  DomainQuery,
  OverviewMetrics,
  Paginated,
  RegulatorySourceDetail,
  RegulatorySourceListItem,
  RelationshipGraph,
  RelationshipQuery,
  RelationshipWithEndpoints,
  ReportDetail,
  ReportListItem,
  ReportQuery,
  ScanDetail,
  ScanListItem,
  ScanQuery,
} from "@/lib/types/views";
import { AGENT_KEYS, PRIORITIES, REVIEW_STATUSES, SCAN_STATUSES } from "@/lib/types/enums";
import { EVIDENCE_COMPLETENESS_BUCKETS } from "@/lib/utils/evidence";
import { PRIORITY_ORDER } from "@/lib/utils/labels";
import { toDateKey } from "@/lib/utils/format";

export interface Dataset {
  users: UserWithSecret[];
  platforms: Platform[];
  discoverySources: DiscoverySource[];
  scans: Scan[];
  agentTasks: AgentTask[];
  domains: Domain[];
  domainPlatforms: DomainPlatformLink[];
  domainDiscoverySources: DomainDiscoverySourceLink[];
  evidence: Evidence[];
  relationships: DomainRelationship[];
  regulatorySources: RegulatorySource[];
  regulatorySourceChecks: RegulatorySourceCheck[];
  regulatoryMatches: RegulatoryMatch[];
  reports: Report[];
  reportDomains: ReportDomainLink[];
  reportEvidence: ReportEvidenceLink[];
  auditEvents: AuditEvent[];
  settings: ApplicationSetting[];
}

export const DATASET_COLLECTIONS = [
  "users",
  "platforms",
  "discoverySources",
  "scans",
  "agentTasks",
  "domains",
  "domainPlatforms",
  "domainDiscoverySources",
  "evidence",
  "relationships",
  "regulatorySources",
  "regulatorySourceChecks",
  "regulatoryMatches",
  "reports",
  "reportDomains",
  "reportEvidence",
  "auditEvents",
  "settings",
] as const satisfies ReadonlyArray<keyof Dataset>;

export function emptyDataset(): Dataset {
  return {
    users: [],
    platforms: [],
    discoverySources: [],
    scans: [],
    agentTasks: [],
    domains: [],
    domainPlatforms: [],
    domainDiscoverySources: [],
    evidence: [],
    relationships: [],
    regulatorySources: [],
    regulatorySourceChecks: [],
    regulatoryMatches: [],
    reports: [],
    reportDomains: [],
    reportEvidence: [],
    auditEvents: [],
    settings: [],
  };
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function paginate<T>(items: T[], page = 1, pageSize = DEFAULT_PAGE_SIZE): Paginated<T> {
  const safePageSize = Math.min(Math.max(1, Math.trunc(pageSize)), MAX_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const safePage = Math.min(Math.max(1, Math.trunc(page)), pageCount);
  const start = (safePage - 1) * safePageSize;
  return {
    items: items.slice(start, start + safePageSize),
    total: items.length,
    page: safePage,
    pageSize: safePageSize,
    pageCount,
  };
}

function compare(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function withinRange(value: string, from?: string, to?: string): boolean {
  if (from && value < from) return false;
  // `to` is an inclusive date; compare against end of that day when date-only.
  if (to) {
    const bound = to.length === 10 ? `${to}T23:59:59.999Z` : to;
    if (value > bound) return false;
  }
  return true;
}

function countBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, number> {
  const result = {} as Record<K, number>;
  for (const item of items) {
    const k = key(item);
    result[k] = (result[k] ?? 0) + 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

/**
 * Derived lookup maps. Built once per query batch so composing 100 table rows
 * does not become quadratic over the evidence and relationship collections.
 */
export interface DatasetIndex {
  usersById: Map<string, UserWithSecret>;
  platformsById: Map<string, Platform>;
  discoverySourcesById: Map<string, DiscoverySource>;
  discoverySourcesByKey: Map<string, DiscoverySource>;
  scansById: Map<string, Scan>;
  domainsById: Map<string, Domain>;
  domainsByFqdn: Map<string, Domain>;
  evidenceByDomainId: Map<string, Evidence[]>;
  evidenceById: Map<string, Evidence>;
  evidenceByScanId: Map<string, Evidence[]>;
  tasksByScanId: Map<string, AgentTask[]>;
  sourceLinksByDomainId: Map<string, DomainDiscoverySourceLink[]>;
  platformLinksByDomainId: Map<string, DomainPlatformLink[]>;
  relationshipsByDomainId: Map<string, DomainRelationship[]>;
  matchesByDomainId: Map<string, RegulatoryMatch[]>;
  matchesBySourceId: Map<string, RegulatoryMatch[]>;
  checksBySourceId: Map<string, RegulatorySourceCheck[]>;
  regulatorySourcesById: Map<string, RegulatorySource>;
  reportDomainsByReportId: Map<string, ReportDomainLink[]>;
  reportEvidenceByReportId: Map<string, ReportEvidenceLink[]>;
  domainsByScanId: Map<string, Domain[]>;
}

function groupBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function indexBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(key(item), item);
  return map;
}

export function buildIndex(data: Dataset): DatasetIndex {
  const relationshipsByDomainId = new Map<string, DomainRelationship[]>();
  for (const relationship of data.relationships) {
    for (const domainId of [relationship.sourceDomainId, relationship.targetDomainId]) {
      const bucket = relationshipsByDomainId.get(domainId);
      if (bucket) bucket.push(relationship);
      else relationshipsByDomainId.set(domainId, [relationship]);
    }
  }

  return {
    usersById: indexBy(data.users, (u) => u.id),
    platformsById: indexBy(data.platforms, (p) => p.id),
    discoverySourcesById: indexBy(data.discoverySources, (s) => s.id),
    discoverySourcesByKey: indexBy(data.discoverySources, (s) => s.key),
    scansById: indexBy(data.scans, (s) => s.id),
    domainsById: indexBy(data.domains, (d) => d.id),
    domainsByFqdn: indexBy(data.domains, (d) => d.fqdn),
    evidenceById: indexBy(data.evidence, (e) => e.id),
    evidenceByDomainId: groupBy(data.evidence, (e) => e.domainId),
    evidenceByScanId: groupBy(data.evidence, (e) => e.scanId),
    tasksByScanId: groupBy(data.agentTasks, (t) => t.scanId),
    sourceLinksByDomainId: groupBy(data.domainDiscoverySources, (l) => l.domainId),
    platformLinksByDomainId: groupBy(data.domainPlatforms, (l) => l.domainId),
    relationshipsByDomainId,
    matchesByDomainId: groupBy(data.regulatoryMatches, (m) => m.domainId),
    matchesBySourceId: groupBy(data.regulatoryMatches, (m) => m.regulatorySourceId),
    checksBySourceId: groupBy(data.regulatorySourceChecks, (c) => c.regulatorySourceId),
    regulatorySourcesById: indexBy(data.regulatorySources, (s) => s.id),
    reportDomainsByReportId: groupBy(data.reportDomains, (l) => l.reportId),
    reportEvidenceByReportId: groupBy(data.reportEvidence, (l) => l.reportId),
    domainsByScanId: groupBy(data.domains, (d) => d.discoveredByScanId),
  };
}

// ---------------------------------------------------------------------------
// Domain composition and queries
// ---------------------------------------------------------------------------

export function composeDomainListItem(
  domain: Domain,
  index: DatasetIndex,
): DomainListItem {
  const sourceLinks = index.sourceLinksByDomainId.get(domain.id) ?? [];
  const seedPlatform = domain.seedPlatformId
    ? index.platformsById.get(domain.seedPlatformId)
    : undefined;
  const reviewer = domain.assignedReviewerId
    ? index.usersById.get(domain.assignedReviewerId)
    : undefined;
  const scan = domain.discoveredByScanId
    ? index.scansById.get(domain.discoveredByScanId)
    : undefined;

  return {
    ...domain,
    seedPlatform: seedPlatform
      ? { id: seedPlatform.id, name: seedPlatform.name, slug: seedPlatform.slug }
      : null,
    discoverySources: sourceLinks
      .map((link) => index.discoverySourcesById.get(link.discoverySourceId))
      .filter((source): source is DiscoverySource => Boolean(source))
      .map((source) => ({
        id: source.id,
        key: source.key,
        name: source.name,
        kind: source.kind,
      })),
    assignedReviewer: reviewer
      ? { id: reviewer.id, name: reviewer.name, email: reviewer.email }
      : null,
    evidenceCount: (index.evidenceByDomainId.get(domain.id) ?? []).length,
    regulatoryMatchCount: (index.matchesByDomainId.get(domain.id) ?? []).length,
    relationshipCount: (index.relationshipsByDomainId.get(domain.id) ?? []).length,
    discoveredByScanReference: scan?.reference ?? null,
  };
}

function filterDomains(data: Dataset, index: DatasetIndex, query: DomainQuery): Domain[] {
  const search = query.search?.trim().toLowerCase();

  return data.domains.filter((domain) => {
    if (search) {
      const haystack = [
        domain.fqdn,
        domain.registrableDomain,
        domain.siteTitle ?? "",
        ...domain.associatedNames,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (query.platformId) {
      const links = index.platformLinksByDomainId.get(domain.id) ?? [];
      const linked =
        domain.seedPlatformId === query.platformId ||
        links.some((link) => link.platformId === query.platformId);
      if (!linked) return false;
    }
    if (query.suffix && domain.suffix !== query.suffix) return false;
    if (query.discoverySourceKey) {
      const links = index.sourceLinksByDomainId.get(domain.id) ?? [];
      const hasSource = links.some(
        (link) =>
          index.discoverySourcesById.get(link.discoverySourceId)?.key ===
          query.discoverySourceKey,
      );
      if (!hasSource) return false;
    }
    if (query.reviewStatus?.length && !query.reviewStatus.includes(domain.reviewStatus)) {
      return false;
    }
    if (query.priority?.length && !query.priority.includes(domain.priority)) return false;
    if (query.origin && domain.origin !== query.origin) return false;
    if (
      query.minEvidenceCompleteness !== undefined &&
      domain.evidenceCompleteness < query.minEvidenceCompleteness
    ) {
      return false;
    }
    if (
      query.maxEvidenceCompleteness !== undefined &&
      domain.evidenceCompleteness > query.maxEvidenceCompleteness
    ) {
      return false;
    }
    if (!withinRange(domain.firstSeenAt, query.firstSeenFrom, query.firstSeenTo)) return false;
    if (query.scanId && domain.discoveredByScanId !== query.scanId) return false;
    if (query.assignedReviewerId && domain.assignedReviewerId !== query.assignedReviewerId) {
      return false;
    }
    return true;
  });
}

function sortDomains(domains: Domain[], query: DomainQuery): Domain[] {
  const direction = query.sortDirection === "asc" ? 1 : -1;
  const sortBy = query.sortBy ?? "firstSeenAt";

  return [...domains].sort((a, b) => {
    let result: number;
    switch (sortBy) {
      case "fqdn":
        result = compare(a.fqdn, b.fqdn);
        break;
      case "lastSeenAt":
        result = compare(a.lastSeenAt, b.lastSeenAt);
        break;
      case "evidenceCompleteness":
        result = compare(a.evidenceCompleteness, b.evidenceCompleteness);
        break;
      case "priority":
        result = compare(PRIORITY_ORDER[a.priority], PRIORITY_ORDER[b.priority]);
        break;
      case "reviewStatus":
        result = compare(a.reviewStatus, b.reviewStatus);
        break;
      case "firstSeenAt":
      default:
        result = compare(a.firstSeenAt, b.firstSeenAt);
        break;
    }
    // Stable tiebreak so pagination never reshuffles equal rows.
    return result !== 0 ? result * direction : compare(a.fqdn, b.fqdn);
  });
}

export function queryDomains(data: Dataset, query: DomainQuery): Paginated<DomainListItem> {
  const index = buildIndex(data);
  const filtered = sortDomains(filterDomains(data, index, query), query);
  const page = paginate(filtered, query.page, query.pageSize);
  return {
    ...page,
    items: page.items.map((domain) => composeDomainListItem(domain, index)),
  };
}

export function queryAllDomains(
  data: Dataset,
  query: DomainQuery,
  limit: number,
): DomainListItem[] {
  const index = buildIndex(data);
  const filtered = sortDomains(filterDomains(data, index, query), query);
  return filtered.slice(0, limit).map((domain) => composeDomainListItem(domain, index));
}

export function composeRelationship(
  relationship: DomainRelationship,
  index: DatasetIndex,
): RelationshipWithEndpoints | null {
  const source = index.domainsById.get(relationship.sourceDomainId);
  const target = index.domainsById.get(relationship.targetDomainId);
  if (!source || !target) return null;
  return {
    ...relationship,
    sourceDomain: {
      id: source.id,
      fqdn: source.fqdn,
      reviewStatus: source.reviewStatus,
      priority: source.priority,
      origin: source.origin,
    },
    targetDomain: {
      id: target.id,
      fqdn: target.fqdn,
      reviewStatus: target.reviewStatus,
      priority: target.priority,
      origin: target.origin,
    },
    evidence: relationship.evidenceId
      ? (index.evidenceById.get(relationship.evidenceId) ?? null)
      : null,
  };
}

export function getDomainDetail(data: Dataset, idOrFqdn: string): DomainDetail | null {
  const index = buildIndex(data);
  const domain =
    index.domainsById.get(idOrFqdn) ?? index.domainsByFqdn.get(idOrFqdn.toLowerCase());
  if (!domain) return null;

  const listItem = composeDomainListItem(domain, index);
  const relationships = (index.relationshipsByDomainId.get(domain.id) ?? [])
    .map((relationship) => composeRelationship(relationship, index))
    .filter((relationship): relationship is RelationshipWithEndpoints => Boolean(relationship));

  const matches = (index.matchesByDomainId.get(domain.id) ?? [])
    .map((match) => {
      const source = index.regulatorySourcesById.get(match.regulatorySourceId);
      if (!source) return null;
      return {
        ...match,
        source: {
          id: source.id,
          authorityName: source.authorityName,
          authorityShortName: source.authorityShortName,
          title: source.title,
          sourceUrl: source.sourceUrl,
          sourceType: source.sourceType,
        },
      };
    })
    .filter((match): match is NonNullable<typeof match> => Boolean(match));

  const platformLinks = (index.platformLinksByDomainId.get(domain.id) ?? [])
    .map((link) => {
      const platform = index.platformsById.get(link.platformId);
      if (!platform) return null;
      return {
        platform: { id: platform.id, name: platform.name, slug: platform.slug },
        rationale: link.rationale,
        confidence: link.confidence,
        origin: link.origin,
      };
    })
    .filter((link): link is NonNullable<typeof link> => Boolean(link));

  return {
    ...listItem,
    evidence: [...(index.evidenceByDomainId.get(domain.id) ?? [])].sort((a, b) =>
      compare(b.collectedAt, a.collectedAt),
    ),
    relationships,
    regulatoryMatches: matches,
    platformLinks,
    auditEvents: listAuditEventsForEntity(data, "DOMAIN", domain.id, 100),
  };
}

export function listDomainSuffixes(data: Dataset): Array<{ suffix: string; count: number }> {
  const counts = countBy(data.domains, (domain) => domain.suffix);
  return Object.entries(counts)
    .map(([suffix, count]) => ({ suffix, count }))
    .sort((a, b) => b.count - a.count || a.suffix.localeCompare(b.suffix));
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

export function composeScanListItem(
  scan: Scan,
  index: DatasetIndex,
): ScanListItem {
  const tasks = index.tasksByScanId.get(scan.id) ?? [];
  const user = index.usersById.get(scan.initiatedById);
  const platform = scan.platformId ? index.platformsById.get(scan.platformId) : undefined;

  return {
    ...scan,
    platformName: platform?.name ?? null,
    initiatedBy: user ? { id: user.id, name: user.name, email: user.email } : null,
    taskCounts: {
      total: tasks.length,
      completed: tasks.filter(
        (t) => t.status === "COMPLETED" || t.status === "COMPLETED_WITH_WARNINGS",
      ).length,
      failed: tasks.filter((t) => t.status === "FAILED").length,
      running: tasks.filter((t) => t.status === "RUNNING").length,
      pending: tasks.filter((t) => t.status === "PENDING").length,
    },
  };
}

export function queryScans(data: Dataset, query: ScanQuery): Paginated<ScanListItem> {
  const index = buildIndex(data);
  const search = query.search?.trim().toLowerCase();

  const filtered = data.scans.filter((scan) => {
    if (search) {
      const haystack = [
        scan.reference,
        scan.platformNameInput,
        scan.seedDomain ?? "",
        scan.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (query.status?.length && !query.status.includes(scan.status)) return false;
    if (query.profile && scan.profile !== query.profile) return false;
    if (query.initiatedById && scan.initiatedById !== query.initiatedById) return false;
    if (!withinRange(scan.queuedAt, query.createdFrom, query.createdTo)) return false;
    return true;
  });

  const direction = query.sortDirection === "asc" ? 1 : -1;
  const sortBy = query.sortBy ?? "queuedAt";
  const sorted = [...filtered].sort((a, b) => {
    let result: number;
    switch (sortBy) {
      case "status":
        result = compare(a.status, b.status);
        break;
      case "candidatesFound":
        result = compare(a.candidatesFound, b.candidatesFound);
        break;
      case "durationMs":
        result = compare(a.durationMs, b.durationMs);
        break;
      case "reference":
        result = compare(a.reference, b.reference);
        break;
      case "queuedAt":
      default:
        result = compare(a.queuedAt, b.queuedAt);
        break;
    }
    return result !== 0 ? result * direction : compare(b.queuedAt, a.queuedAt);
  });

  const page = paginate(sorted, query.page, query.pageSize);
  return {
    ...page,
    items: page.items.map((scan) => composeScanListItem(scan, index)),
  };
}

export function getScanDetail(data: Dataset, id: string): ScanDetail | null {
  const index = buildIndex(data);
  const scan = index.scansById.get(id) ?? data.scans.find((s) => s.reference === id);
  if (!scan) return null;

  const tasks = [...(index.tasksByScanId.get(scan.id) ?? [])].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const domains = (index.domainsByScanId.get(scan.id) ?? []).map((domain) =>
    composeDomainListItem(domain, index),
  );
  const evidence = [...(index.evidenceByScanId.get(scan.id) ?? [])].sort((a, b) =>
    compare(b.collectedAt, a.collectedAt),
  );

  // Which discovery sources actually contributed domains to THIS scan.
  const sourceCounts = new Map<string, number>();
  for (const domain of index.domainsByScanId.get(scan.id) ?? []) {
    for (const link of index.sourceLinksByDomainId.get(domain.id) ?? []) {
      sourceCounts.set(link.discoverySourceId, (sourceCounts.get(link.discoverySourceId) ?? 0) + 1);
    }
  }

  return {
    ...composeScanListItem(scan, index),
    tasks,
    discoverySources: [...sourceCounts.entries()]
      .map(([sourceId, domainCount]) => {
        const source = index.discoverySourcesById.get(sourceId);
        if (!source) return null;
        return {
          source: { id: source.id, key: source.key, name: source.name, kind: source.kind },
          domainCount,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => b.domainCount - a.domainCount),
    domains,
    evidenceSummary: {
      total: evidence.length,
      byKind: countBy(evidence, (item) => item.kind),
      withSourceUrl: evidence.filter((item) => Boolean(item.sourceUrl)).length,
    },
    evidence,
  };
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

export function queryRelationships(
  data: Dataset,
  query: RelationshipQuery,
): RelationshipWithEndpoints[] {
  const index = buildIndex(data);
  const limit = query.limit ?? 500;

  let relationships = data.relationships.filter((relationship) => {
    if (query.types?.length && !query.types.includes(relationship.type)) return false;
    if (query.minConfidence !== undefined && relationship.confidence < query.minConfidence) {
      return false;
    }
    if (query.reviewerConfirmedOnly && !relationship.reviewerConfirmed) return false;
    return true;
  });

  if (query.focusDomainId) {
    const depth = Math.max(1, Math.min(query.depth ?? 1, 4));
    const reachable = new Set<string>([query.focusDomainId]);
    let frontier = [query.focusDomainId];
    for (let level = 0; level < depth; level += 1) {
      const nextFrontier: string[] = [];
      for (const domainId of frontier) {
        for (const relationship of relationships) {
          if (relationship.sourceDomainId === domainId && !reachable.has(relationship.targetDomainId)) {
            reachable.add(relationship.targetDomainId);
            nextFrontier.push(relationship.targetDomainId);
          }
          if (relationship.targetDomainId === domainId && !reachable.has(relationship.sourceDomainId)) {
            reachable.add(relationship.sourceDomainId);
            nextFrontier.push(relationship.sourceDomainId);
          }
        }
      }
      frontier = nextFrontier;
      if (frontier.length === 0) break;
    }
    relationships = relationships.filter(
      (relationship) =>
        reachable.has(relationship.sourceDomainId) && reachable.has(relationship.targetDomainId),
    );
  }

  return relationships
    .sort((a, b) => b.confidence - a.confidence || compare(a.id, b.id))
    .slice(0, limit)
    .map((relationship) => composeRelationship(relationship, index))
    .filter((relationship): relationship is RelationshipWithEndpoints => Boolean(relationship));
}

export function getRelationshipGraph(
  data: Dataset,
  query: RelationshipQuery,
): RelationshipGraph {
  const index = buildIndex(data);
  const limit = query.limit ?? 300;
  const edges = queryRelationships(data, { ...query, limit: limit + 1 });
  const truncated = edges.length > limit;
  const visibleEdges = truncated ? edges.slice(0, limit) : edges;

  const nodeIds = new Set<string>();
  for (const edge of visibleEdges) {
    nodeIds.add(edge.sourceDomainId);
    nodeIds.add(edge.targetDomainId);
  }
  if (query.focusDomainId) nodeIds.add(query.focusDomainId);

  const nodes = [...nodeIds]
    .map((id) => {
      const domain = index.domainsById.get(id);
      if (!domain) return null;
      const platform = domain.seedPlatformId
        ? index.platformsById.get(domain.seedPlatformId)
        : undefined;
      return {
        id: domain.id,
        fqdn: domain.fqdn,
        reviewStatus: domain.reviewStatus,
        priority: domain.priority,
        origin: domain.origin,
        platformName: platform?.name ?? null,
        evidenceCompleteness: domain.evidenceCompleteness,
        relationshipCount: (index.relationshipsByDomainId.get(domain.id) ?? []).length,
        isFocus: domain.id === query.focusDomainId,
      };
    })
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
    .sort((a, b) => b.relationshipCount - a.relationshipCount || a.fqdn.localeCompare(b.fqdn));

  return { nodes, edges: visibleEdges, truncated };
}

// ---------------------------------------------------------------------------
// Regulatory sources
// ---------------------------------------------------------------------------

function isSourceStale(source: RegulatorySource, now: number): boolean {
  if (!source.isEnabled) return false;
  if (!source.lastSuccessfulCheckAt) return true;
  const ageMs = now - new Date(source.lastSuccessfulCheckAt).getTime();
  return ageMs > source.checkIntervalHours * 3_600_000;
}

export function composeRegulatorySourceListItem(
  source: RegulatorySource,
  index: DatasetIndex,
  now: number,
): RegulatorySourceListItem {
  const checks = [...(index.checksBySourceId.get(source.id) ?? [])].sort((a, b) =>
    compare(b.startedAt, a.startedAt),
  );
  const matches = index.matchesBySourceId.get(source.id) ?? [];

  return {
    ...source,
    checkCount: checks.length,
    lastCheck: checks[0] ?? null,
    isStale: isSourceStale(source, now),
    simulatedMatchCount: matches.filter((m) => m.origin === "SIMULATED_DEMO").length,
    liveMatchCount: matches.filter((m) => m.origin === "LIVE_COLLECTED").length,
  };
}

export function listRegulatorySources(
  data: Dataset,
  now: number,
): RegulatorySourceListItem[] {
  const index = buildIndex(data);
  return data.regulatorySources
    .map((source) => composeRegulatorySourceListItem(source, index, now))
    .sort(
      (a, b) =>
        a.authorityShortName.localeCompare(b.authorityShortName) || a.title.localeCompare(b.title),
    );
}

export function getRegulatorySourceDetail(
  data: Dataset,
  id: string,
  now: number,
): RegulatorySourceDetail | null {
  const index = buildIndex(data);
  const source = index.regulatorySourcesById.get(id);
  if (!source) return null;

  const checks = [...(index.checksBySourceId.get(id) ?? [])].sort((a, b) =>
    compare(b.startedAt, a.startedAt),
  );
  const matches = (index.matchesBySourceId.get(id) ?? [])
    .map((match) => ({
      ...match,
      domainFqdn: match.domainId
        ? (index.domainsById.get(match.domainId)?.fqdn ?? null)
        : null,
    }))
    .sort((a, b) => compare(b.createdAt, a.createdAt));

  return {
    ...composeRegulatorySourceListItem(source, index, now),
    checks,
    matches,
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function composeReportListItem(
  report: Report,
  index: DatasetIndex,
): ReportListItem {
  const preparedBy = index.usersById.get(report.preparedById);
  const approvedBy = report.approvedById ? index.usersById.get(report.approvedById) : undefined;
  return {
    ...report,
    preparedBy: preparedBy
      ? { id: preparedBy.id, name: preparedBy.name, email: preparedBy.email }
      : null,
    approvedBy: approvedBy
      ? { id: approvedBy.id, name: approvedBy.name, email: approvedBy.email }
      : null,
    domainCount: (index.reportDomainsByReportId.get(report.id) ?? []).length,
    evidenceCount: (index.reportEvidenceByReportId.get(report.id) ?? []).length,
  };
}

export function queryReports(data: Dataset, query: ReportQuery): Paginated<ReportListItem> {
  const index = buildIndex(data);
  const search = query.search?.trim().toLowerCase();

  const filtered = data.reports.filter((report) => {
    if (search) {
      const haystack = [report.reference, report.title, report.executiveSummary]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (query.status?.length && !query.status.includes(report.status)) return false;
    if (
      query.receivingAuthority?.length &&
      !query.receivingAuthority.includes(report.receivingAuthority)
    ) {
      return false;
    }
    if (query.preparedById && report.preparedById !== query.preparedById) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => compare(b.createdAt, a.createdAt));
  const page = paginate(sorted, query.page, query.pageSize);
  return {
    ...page,
    items: page.items.map((report) => composeReportListItem(report, index)),
  };
}

export function getReportDetail(data: Dataset, id: string): ReportDetail | null {
  const index = buildIndex(data);
  const report = data.reports.find((r) => r.id === id || r.reference === id);
  if (!report) return null;

  const domainLinks = [...(index.reportDomainsByReportId.get(report.id) ?? [])].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  const evidenceLinks = [...(index.reportEvidenceByReportId.get(report.id) ?? [])].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );

  return {
    ...composeReportListItem(report, index),
    domains: domainLinks
      .map((link) => {
        const domain = index.domainsById.get(link.domainId);
        if (!domain) return null;
        return {
          ...composeDomainListItem(domain, index),
          includedRationale: link.includedRationale,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    evidence: evidenceLinks
      .map((link) => {
        const evidence = index.evidenceById.get(link.evidenceId);
        if (!evidence) return null;
        return {
          ...evidence,
          domainFqdn: evidence.domainId
            ? (index.domainsById.get(evidence.domainId)?.fqdn ?? null)
            : null,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    auditEvents: listAuditEventsForEntity(data, "REPORT", report.id, 100),
  };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function queryAuditEvents(
  data: Dataset,
  query: AuditQuery,
): Paginated<AuditEventListItem> {
  const index = buildIndex(data);
  const search = query.search?.trim().toLowerCase();

  const filtered = data.auditEvents.filter((event) => {
    if (search) {
      const haystack = [
        event.actorLabel,
        event.action,
        event.entityType,
        event.entityId,
        event.entityLabel ?? "",
        event.reason ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (query.actorId && event.actorId !== query.actorId) return false;
    if (query.action?.length && !query.action.includes(event.action)) return false;
    if (query.entityType?.length && !query.entityType.includes(event.entityType)) return false;
    if (query.entityId && event.entityId !== query.entityId) return false;
    if (!withinRange(event.occurredAt, query.occurredFrom, query.occurredTo)) return false;
    return true;
  });

  const sorted = [...filtered].sort(
    (a, b) => compare(b.occurredAt, a.occurredAt) || compare(b.id, a.id),
  );
  const page = paginate(sorted, query.page, query.pageSize);

  return {
    ...page,
    items: page.items.map((event) => {
      const actor = event.actorId ? index.usersById.get(event.actorId) : undefined;
      return {
        ...event,
        actor: actor
          ? { id: actor.id, name: actor.name, email: actor.email, role: actor.role }
          : null,
      };
    }),
  };
}

export function listAuditEventsForEntity(
  data: Dataset,
  entityType: AuditEntityType,
  entityId: string,
  limit: number,
): AuditEvent[] {
  return data.auditEvents
    .filter((event) => event.entityType === entityType && event.entityId === entityId)
    .sort((a, b) => compare(b.occurredAt, a.occurredAt))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Overview metrics
// ---------------------------------------------------------------------------

/**
 * Every figure here is derived from the dataset. There are no hardcoded
 * dashboard numbers anywhere in the UI.
 */
export function computeOverviewMetrics(data: Dataset, now: number): OverviewMetrics {
  const index = buildIndex(data);

  const reviewCounts = countBy(data.domains, (domain) => domain.reviewStatus);
  const priorityCounts = countBy(data.domains, (domain) => domain.priority);
  const scanStatusCounts = countBy(data.scans, (scan) => scan.status);

  // Discoveries over time, over the 30 days ending today.
  const dayCount = 30;
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const dayKeys: string[] = [];
  for (let i = dayCount - 1; i >= 0; i -= 1) {
    dayKeys.push(toDateKey(new Date(today.getTime() - i * 86_400_000)));
  }

  const discoveriesByDay = countBy(data.domains, (domain) => toDateKey(domain.firstSeenAt));
  const earliestVisibleDay = dayKeys[0] ?? toDateKey(today);
  let cumulative = data.domains.filter(
    (domain) => toDateKey(domain.firstSeenAt) < earliestVisibleDay,
  ).length;
  const discoveriesOverTime = dayKeys.map((date) => {
    const discovered = discoveriesByDay[date] ?? 0;
    cumulative += discovered;
    return { date, discovered, cumulative };
  });

  // Scan activity and success rate per day.
  const scansByDay = groupBy(data.scans, (scan) => toDateKey(scan.queuedAt));
  const scanActivity = dayKeys.map((date) => {
    const scans = scansByDay.get(date) ?? [];
    const completed = scans.filter(
      (scan) => scan.status === "COMPLETED" || scan.status === "COMPLETED_WITH_WARNINGS",
    ).length;
    const failed = scans.filter((scan) => scan.status === "FAILED").length;
    const resolved = completed + failed;
    return {
      date,
      total: scans.length,
      completed,
      failed,
      successRate: resolved === 0 ? 0 : Math.round((completed / resolved) * 100),
    };
  });

  // Discovery-source contribution: distinct domains per source.
  const sourceContribution = data.discoverySources
    .map((source) => ({
      sourceKey: source.key,
      sourceName: source.name,
      count: data.domainDiscoverySources.filter(
        (link) => link.discoverySourceId === source.id,
      ).length,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  // Agent execution summary.
  const agentExecutionSummary = AGENT_KEYS.map((agentKey: AgentKey) => {
    const tasks = data.agentTasks.filter((task) => task.agentKey === agentKey);
    const durations = tasks
      .map((task) => task.durationMs)
      .filter((value): value is number => value !== null);
    return {
      agentKey,
      totalTasks: tasks.length,
      completed: tasks.filter(
        (task) => task.status === "COMPLETED" || task.status === "COMPLETED_WITH_WARNINGS",
      ).length,
      failed: tasks.filter((task) => task.status === "FAILED").length,
      warnings: tasks.filter((task) => task.hasWarnings).length,
      averageDurationMs:
        durations.length === 0
          ? null
          : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
    };
  }).filter((entry) => entry.totalTasks > 0);

  // Evidence completeness distribution.
  const completenessValues = data.domains.map((domain) => domain.evidenceCompleteness);
  const averageCompleteness =
    completenessValues.length === 0
      ? 0
      : Math.round(
          completenessValues.reduce((sum, value) => sum + value, 0) / completenessValues.length,
        );

  const recentDiscoveries = [...data.domains]
    .sort((a, b) => compare(b.firstSeenAt, a.firstSeenAt))
    .slice(0, 8)
    .map((domain) => composeDomainListItem(domain, index));

  const recentScans = [...data.scans]
    .sort((a, b) => compare(b.queuedAt, a.queuedAt))
    .slice(0, 6)
    .map((scan) => composeScanListItem(scan, index));

  const latestRegulatoryChecks = [...data.regulatorySourceChecks]
    .sort((a, b) => compare(b.startedAt, a.startedAt))
    .slice(0, 6)
    .map((check) => {
      const source = index.regulatorySourcesById.get(check.regulatorySourceId);
      return {
        ...check,
        authorityShortName: source?.authorityShortName ?? "Unknown",
        sourceTitle: source?.title ?? "Unknown source",
        sourceUrl: source?.sourceUrl ?? "",
      };
    });

  return {
    totalDomainsDiscovered: data.domains.length,
    domainsAwaitingReview: data.domains.filter(
      (domain) =>
        domain.reviewStatus === "AWAITING_REVIEW" ||
        domain.reviewStatus === "UNDER_REVIEW" ||
        domain.reviewStatus === "NEEDS_MORE_EVIDENCE",
    ).length,
    reportsPrepared: data.reports.length,
    reportsSubmitted: data.reports.filter((report) =>
      ["SUBMITTED", "RESPONSE_RECEIVED", "ACTION_CONFIRMED", "CLOSED"].includes(report.status),
    ).length,
    // Only reports where a reviewer actually recorded a confirmed outcome.
    confirmedOfficialActions: data.reports.filter(
      (report) => report.outcomeConfirmedAt !== null && report.outcomeSummary !== null,
    ).length,

    simulatedDomainCount: data.domains.filter((d) => d.origin === "SIMULATED_DEMO").length,
    liveCollectedDomainCount: data.domains.filter((d) => d.origin === "LIVE_COLLECTED").length,

    discoveriesOverTime,
    reviewStatusDistribution: REVIEW_STATUSES.map((status: ReviewStatus) => ({
      status,
      count: reviewCounts[status] ?? 0,
    })).filter((entry) => entry.count > 0),
    priorityDistribution: PRIORITIES.map((priority: Priority) => ({
      priority,
      count: priorityCounts[priority] ?? 0,
    })).filter((entry) => entry.count > 0),
    discoverySourceContribution: sourceContribution,
    scanActivity,
    scanStatusDistribution: SCAN_STATUSES.map((status: ScanStatus) => ({
      status,
      count: scanStatusCounts[status] ?? 0,
    })).filter((entry) => entry.count > 0),
    agentExecutionSummary,
    evidenceCompleteness: {
      averagePercent: averageCompleteness,
      buckets: EVIDENCE_COMPLETENESS_BUCKETS.map((bucket) => ({
        label: bucket.label,
        min: bucket.min,
        max: bucket.max,
        count: completenessValues.filter(
          (value) => value >= bucket.min && value <= bucket.max,
        ).length,
      })),
    },
    recentDiscoveries,
    recentScans,
    latestRegulatoryChecks,
  };
}
