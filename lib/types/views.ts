/**
 * Composed read models returned by the repository and service layers.
 *
 * Pages consume these rather than raw entities so a single server round trip
 * carries everything a table row or detail panel needs to render honestly
 * (including the origin labels and "not checked" states).
 */

import type { AgentKey, DataOrigin, Priority, ReviewStatus, ScanStatus } from "./enums";
import type {
  AgentTask,
  AuditEvent,
  DiscoverySource,
  Domain,
  DomainRelationship,
  Evidence,
  IsoDateTime,
  Platform,
  RegulatoryMatch,
  RegulatorySource,
  RegulatorySourceCheck,
  Report,
  Scan,
  User,
} from "./models";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface DomainListItem extends Domain {
  seedPlatform: Pick<Platform, "id" | "name" | "slug"> | null;
  discoverySources: Array<Pick<DiscoverySource, "id" | "key" | "name" | "kind">>;
  assignedReviewer: Pick<User, "id" | "name" | "email"> | null;
  evidenceCount: number;
  regulatoryMatchCount: number;
  relationshipCount: number;
  discoveredByScanReference: string | null;
}

export interface DomainDetail extends DomainListItem {
  evidence: Evidence[];
  relationships: RelationshipWithEndpoints[];
  regulatoryMatches: Array<
    RegulatoryMatch & {
      source: Pick<
        RegulatorySource,
        "id" | "authorityName" | "authorityShortName" | "title" | "sourceUrl" | "sourceType"
      >;
    }
  >;
  platformLinks: Array<{
    platform: Pick<Platform, "id" | "name" | "slug">;
    rationale: string;
    confidence: number;
    origin: DataOrigin;
  }>;
  auditEvents: AuditEvent[];
}

export interface RelationshipWithEndpoints extends DomainRelationship {
  sourceDomain: Pick<Domain, "id" | "fqdn" | "reviewStatus" | "priority" | "origin">;
  targetDomain: Pick<Domain, "id" | "fqdn" | "reviewStatus" | "priority" | "origin">;
  evidence: Evidence | null;
}

export interface ScanListItem extends Scan {
  platformName: string | null;
  initiatedBy: Pick<User, "id" | "name" | "email"> | null;
  taskCounts: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    pending: number;
  };
}

export interface ScanDetail extends ScanListItem {
  tasks: AgentTask[];
  discoverySources: Array<{
    source: Pick<DiscoverySource, "id" | "key" | "name" | "kind">;
    domainCount: number;
  }>;
  domains: DomainListItem[];
  evidenceSummary: {
    total: number;
    byKind: Record<string, number>;
    withSourceUrl: number;
  };
  evidence: Evidence[];
}

/** Live progress snapshot for a running scan, read from application state. */
export interface ScanProgress {
  scanId: string;
  reference: string;
  status: ScanStatus;
  origin: DataOrigin;
  isSimulated: boolean;
  percentComplete: number;
  currentAgent: AgentKey | null;
  currentMessage: string | null;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  elapsedMs: number;
  candidatesFound: number;
  candidatesRequiringReview: number;
  warningCount: number;
  errorMessage: string | null;
  tasks: Array<
    Pick<
      AgentTask,
      | "id"
      | "agentKey"
      | "sequence"
      | "title"
      | "status"
      | "attempt"
      | "maxAttempts"
      | "startedAt"
      | "completedAt"
      | "durationMs"
      | "outputSummary"
      | "errorMessage"
      | "hasWarnings"
      | "metrics"
    >
  >;
}

export interface RegulatorySourceListItem extends RegulatorySource {
  checkCount: number;
  lastCheck: RegulatorySourceCheck | null;
  isStale: boolean;
  simulatedMatchCount: number;
  liveMatchCount: number;
}

export interface RegulatorySourceDetail extends RegulatorySourceListItem {
  checks: RegulatorySourceCheck[];
  matches: Array<RegulatoryMatch & { domainFqdn: string | null }>;
}

export interface ReportListItem extends Report {
  preparedBy: Pick<User, "id" | "name" | "email"> | null;
  approvedBy: Pick<User, "id" | "name" | "email"> | null;
  domainCount: number;
  evidenceCount: number;
}

export interface ReportDetail extends ReportListItem {
  domains: Array<DomainListItem & { includedRationale: string | null }>;
  evidence: Array<Evidence & { domainFqdn: string | null }>;
  auditEvents: AuditEvent[];
}

export interface AuditEventListItem extends AuditEvent {
  actor: Pick<User, "id" | "name" | "email" | "role"> | null;
}

// --- Overview metrics ------------------------------------------------------

export interface OverviewMetrics {
  /** Every figure below is computed from repository queries over seeded data. */
  totalDomainsDiscovered: number;
  domainsAwaitingReview: number;
  reportsPrepared: number;
  reportsSubmitted: number;
  /** Only reports whose workflow actually recorded a confirmed official action. */
  confirmedOfficialActions: number;

  simulatedDomainCount: number;
  liveCollectedDomainCount: number;

  discoveriesOverTime: Array<{ date: string; discovered: number; cumulative: number }>;
  reviewStatusDistribution: Array<{ status: ReviewStatus; count: number }>;
  priorityDistribution: Array<{ priority: Priority; count: number }>;
  discoverySourceContribution: Array<{
    sourceKey: string;
    sourceName: string;
    count: number;
  }>;
  scanActivity: Array<{
    date: string;
    total: number;
    completed: number;
    failed: number;
    successRate: number;
  }>;
  scanStatusDistribution: Array<{ status: ScanStatus; count: number }>;
  agentExecutionSummary: Array<{
    agentKey: AgentKey;
    totalTasks: number;
    completed: number;
    failed: number;
    warnings: number;
    averageDurationMs: number | null;
  }>;
  evidenceCompleteness: {
    averagePercent: number;
    buckets: Array<{ label: string; min: number; max: number; count: number }>;
  };
  recentDiscoveries: DomainListItem[];
  recentScans: ScanListItem[];
  latestRegulatoryChecks: Array<
    RegulatorySourceCheck & {
      authorityShortName: string;
      sourceTitle: string;
      sourceUrl: string;
    }
  >;
}

// --- Filters ---------------------------------------------------------------

export type SortDirection = "asc" | "desc";

export interface DomainQuery {
  search?: string;
  platformId?: string;
  suffix?: string;
  discoverySourceKey?: string;
  reviewStatus?: ReviewStatus[];
  priority?: Priority[];
  origin?: DataOrigin;
  minEvidenceCompleteness?: number;
  maxEvidenceCompleteness?: number;
  firstSeenFrom?: string;
  firstSeenTo?: string;
  scanId?: string;
  assignedReviewerId?: string;
  sortBy?:
    | "fqdn"
    | "firstSeenAt"
    | "lastSeenAt"
    | "evidenceCompleteness"
    | "priority"
    | "reviewStatus";
  sortDirection?: SortDirection;
  page?: number;
  pageSize?: number;
}

export interface ScanQuery {
  search?: string;
  status?: ScanStatus[];
  profile?: string;
  initiatedById?: string;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: "queuedAt" | "status" | "candidatesFound" | "durationMs" | "reference";
  sortDirection?: SortDirection;
  page?: number;
  pageSize?: number;
}

export interface AuditQuery {
  search?: string;
  actorId?: string;
  action?: string[];
  entityType?: string[];
  entityId?: string;
  occurredFrom?: string;
  occurredTo?: string;
  page?: number;
  pageSize?: number;
}

export interface ReportQuery {
  search?: string;
  status?: string[];
  receivingAuthority?: string[];
  preparedById?: string;
  page?: number;
  pageSize?: number;
}

export interface RelationshipQuery {
  types?: string[];
  focusDomainId?: string;
  /** Graph traversal depth from the focus domain. */
  depth?: number;
  minConfidence?: number;
  reviewerConfirmedOnly?: boolean;
  limit?: number;
}

export interface RelationshipGraph {
  nodes: Array<{
    id: string;
    fqdn: string;
    reviewStatus: ReviewStatus;
    priority: Priority;
    origin: DataOrigin;
    platformName: string | null;
    evidenceCompleteness: number;
    relationshipCount: number;
    isFocus: boolean;
  }>;
  edges: RelationshipWithEndpoints[];
  truncated: boolean;
}
