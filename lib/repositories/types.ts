/**
 * The `SentinelRepository` contract.
 *
 * Two adapters implement it:
 *   - lib/repositories/file-repository.ts    (default; JSON under .data/)
 *   - lib/repositories/prisma-repository.ts  (when DATABASE_URL + live mode)
 *
 * Deliberate design constraints:
 *
 *  * There is NO update or delete operation for audit events. Append-only is a
 *    property of this interface, not just of a convention. The PostgreSQL
 *    migration adds a trigger that enforces the same thing in the database.
 *  * Writes take explicit input types rather than partial entities, so a caller
 *    cannot accidentally set a workflow field (`approvedById`, `submittedAt`)
 *    that belongs to a guarded service-layer transition.
 *  * Every read returns composed view models, so a page never has to issue a
 *    second query to render honest labels.
 */

import type {
  AuditAction,
  AuditEntityType,
  DataOrigin,
  DiscoveryScope,
  DnsStatus,
  EvidenceCollectionMethod,
  EvidenceKind,
  MatchType,
  Priority,
  ReceivingAuthority,
  RegulatorySourceType,
  RelationshipType,
  ReportStatus,
  RetrievalStatus,
  ReviewStatus,
  Role,
  ScanProfile,
  ScanStatus,
  TaskStatus,
} from "@/lib/types/enums";
import type {
  AgentTask,
  ApplicationSetting,
  AuditEvent,
  DiscoverySource,
  Domain,
  Evidence,
  JsonValue,
  Platform,
  RegulatoryMatch,
  RegulatorySource,
  RegulatorySourceCheck,
  Report,
  Scan,
  User,
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

// --- Write inputs ----------------------------------------------------------

export interface CreateScanInput {
  reference: string;
  platformId: string | null;
  platformNameInput: string;
  seedDomain: string | null;
  notes: string | null;
  profile: ScanProfile;
  scopes: DiscoveryScope[];
  maxCandidates: number;
  initiatedById: string;
  origin: DataOrigin;
}

export interface CreateAgentTaskInput {
  scanId: string;
  agentKey: AgentTask["agentKey"];
  sequence: number;
  title: string;
  maxAttempts: number;
  inputSummary: string | null;
}

export interface UpdateAgentTaskInput {
  status?: TaskStatus;
  attempt?: number;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  outputSummary?: string | null;
  metrics?: Record<string, number> | null;
  errorMessage?: string | null;
  hasWarnings?: boolean;
}

export interface UpdateScanInput {
  status?: ScanStatus;
  platformId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  durationMs?: number | null;
  candidatesFound?: number;
  candidatesRequiringReview?: number;
  warningCount?: number;
  errorMessage?: string | null;
}

/**
 * A domain observation. `upsertDomain` merges it into any existing record for
 * the same normalised FQDN, which is how deduplication works: the same host
 * found by three different sources produces one row with three source links.
 *
 * Every technical field is optional. Omitting a field leaves it untouched —
 * it does NOT reset it to "checked and negative".
 */
export interface UpsertDomainInput {
  fqdn: string;
  seedPlatformId?: string | null;
  associatedNames?: string[];
  observedAt: string;
  discoveredByScanId?: string | null;
  origin: DataOrigin;

  discoverySources?: Array<{
    sourceKey: string;
    detail?: string | null;
    observedAt: string;
  }>;

  dnsStatus?: DnsStatus | null;
  dnsCheckedAt?: string | null;
  resolvedIpCount?: number | null;
  httpStatusCode?: number | null;
  httpCheckedAt?: string | null;
  redirectsToUrl?: string | null;
  redirectObservedAt?: string | null;
  certIssuer?: string | null;
  certSubjectCommonName?: string | null;
  certNotBefore?: string | null;
  certNotAfter?: string | null;
  certFingerprintSha256?: string | null;
  certObservedAt?: string | null;
  siteTitle?: string | null;
  siteDescription?: string | null;
  siteLanguage?: string | null;
  detectedTechnologies?: string[];

  brandSimilarityScore?: number | null;
  contentSimilarityScore?: number | null;
  similarityRationale?: string | null;

  priority?: Priority;
}

export interface UpsertDomainResult {
  domain: Domain;
  /** False when an existing record was merged rather than created. */
  created: boolean;
}

export interface UpdateDomainReviewInput {
  reviewStatus?: ReviewStatus;
  priority?: Priority;
  assignedReviewerId?: string | null;
  reviewerNotes?: string | null;
  reviewedAt?: string | null;
}

export interface CreateEvidenceInput {
  domainId?: string | null;
  scanId?: string | null;
  agentTaskId?: string | null;
  kind: EvidenceKind;
  title: string;
  description: string;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  collectedAt: string;
  collectionMethod: EvidenceCollectionMethod;
  confidence?: number | null;
  limitations?: string | null;
  origin: DataOrigin;
  rawReference?: JsonValue | null;
  createdById?: string | null;
}

export interface UpsertRelationshipInput {
  sourceDomainId: string;
  targetDomainId: string;
  type: RelationshipType;
  confidence: number;
  rationale: string;
  limitations: string;
  relationSource: string;
  observedAt: string;
  origin: DataOrigin;
  evidenceId?: string | null;
}

export interface CreateRegulatorySourceInput {
  authorityName: string;
  authorityShortName: string;
  title: string;
  sourceUrl: string;
  sourceType: RegulatorySourceType;
  description?: string | null;
  isEnabled: boolean;
  checkIntervalHours: number;
  verificationNotes?: string | null;
  origin: DataOrigin;
}

export interface UpdateRegulatorySourceInput {
  authorityName?: string;
  authorityShortName?: string;
  title?: string;
  sourceUrl?: string;
  sourceType?: RegulatorySourceType;
  description?: string | null;
  isEnabled?: boolean;
  checkIntervalHours?: number;
  verificationNotes?: string | null;
  retrievalStatus?: RetrievalStatus;
  retrievalError?: string | null;
  lastCheckAttemptAt?: string | null;
  lastSuccessfulCheckAt?: string | null;
  lastModifiedReported?: string | null;
  matchedEntityCount?: number;
}

export interface CreateRegulatorySourceCheckInput {
  regulatorySourceId: string;
  startedAt: string;
  completedAt: string | null;
  status: RetrievalStatus;
  httpStatusCode?: number | null;
  bytesRetrieved?: number | null;
  matchedEntityCount: number;
  errorMessage?: string | null;
  note?: string | null;
  origin: DataOrigin;
  triggeredById?: string | null;
}

export interface CreateRegulatoryMatchInput {
  regulatorySourceId: string;
  regulatorySourceCheckId?: string | null;
  domainId?: string | null;
  matchedTerm: string;
  matchedContext: string;
  matchType: MatchType;
  confidence: number;
  sourceUrl: string;
  sourceRetrievedAt: string;
  notes?: string | null;
  origin: DataOrigin;
}

export interface CreateReportInput {
  reference: string;
  title: string;
  receivingAuthority: ReceivingAuthority;
  authorityOther?: string | null;
  executiveSummary: string;
  findings: string;
  recommendations: string;
  limitations: string;
  methodology: string;
  preparedById: string;
  origin: DataOrigin;
  domainIds: string[];
  evidenceIds: string[];
  domainRationales?: Record<string, string>;
}

export interface UpdateReportContentInput {
  title?: string;
  receivingAuthority?: ReceivingAuthority;
  authorityOther?: string | null;
  executiveSummary?: string;
  findings?: string;
  recommendations?: string;
  limitations?: string;
  methodology?: string;
  domainIds?: string[];
  evidenceIds?: string[];
  domainRationales?: Record<string, string>;
}

/**
 * Workflow transitions are separate from content edits so the service layer can
 * authorise them independently and so an content edit can never move a report
 * from DRAFT to SUBMITTED as a side effect.
 */
export interface ApplyReportTransitionInput {
  status: ReportStatus;
  approvedById?: string | null;
  approvedAt?: string | null;
  submittedAt?: string | null;
  submissionReference?: string | null;
  submissionChannel?: string | null;
  responseReceivedAt?: string | null;
  responseSummary?: string | null;
  outcomeConfirmedAt?: string | null;
  outcomeSummary?: string | null;
  closedAt?: string | null;
  closingNote?: string | null;
}

export interface AppendAuditEventInput {
  occurredAt?: string;
  actorId: string | null;
  actorLabel: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel?: string | null;
  previousState?: JsonValue | null;
  newState?: JsonValue | null;
  reason?: string | null;
  requestId?: string | null;
}

export interface CreateUserInput {
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  jobTitle?: string | null;
  isDemoUser?: boolean;
}

export interface UpsertPlatformInput {
  name: string;
  slug?: string;
  aliases?: string[];
  investigationId?: string | null;
  description?: string | null;
  origin: DataOrigin;
}

// --- The repository --------------------------------------------------------

export interface SentinelRepository {
  readonly kind: "file" | "prisma";

  /** Ensures storage exists and is seeded. Safe to call repeatedly. */
  initialize(): Promise<void>;

  /** Development/test only: wipe and reseed. Guarded by the caller. */
  resetToSeed(): Promise<void>;

  // Users
  listUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  findUserWithSecretByEmail(email: string): Promise<UserWithSecret | null>;
  createUser(input: CreateUserInput): Promise<User>;
  recordUserLogin(id: string, at: string): Promise<void>;

  // Platforms and discovery sources
  listPlatforms(): Promise<Platform[]>;
  getPlatformById(id: string): Promise<Platform | null>;
  findPlatformByName(name: string): Promise<Platform | null>;
  upsertPlatform(input: UpsertPlatformInput): Promise<Platform>;
  listDiscoverySources(): Promise<DiscoverySource[]>;

  // Scans
  createScan(input: CreateScanInput): Promise<Scan>;
  getScanById(id: string): Promise<Scan | null>;
  getScanDetail(id: string): Promise<ScanDetail | null>;
  updateScan(id: string, input: UpdateScanInput): Promise<Scan>;
  listScans(query: ScanQuery): Promise<Paginated<ScanListItem>>;
  countActiveScans(): Promise<number>;

  // Agent tasks
  createAgentTask(input: CreateAgentTaskInput): Promise<AgentTask>;
  getAgentTaskById(id: string): Promise<AgentTask | null>;
  updateAgentTask(id: string, input: UpdateAgentTaskInput): Promise<AgentTask>;
  listAgentTasksForScan(scanId: string): Promise<AgentTask[]>;

  // Domains
  upsertDomain(input: UpsertDomainInput): Promise<UpsertDomainResult>;
  getDomainById(id: string): Promise<Domain | null>;
  getDomainByFqdn(fqdn: string): Promise<Domain | null>;
  getDomainDetail(idOrFqdn: string): Promise<DomainDetail | null>;
  listDomains(query: DomainQuery): Promise<Paginated<DomainListItem>>;
  /** Unpaginated, for CSV export and report builders. Bounded by `limit`. */
  listAllDomainsForExport(query: DomainQuery, limit: number): Promise<DomainListItem[]>;
  updateDomainReview(id: string, input: UpdateDomainReviewInput): Promise<Domain>;
  recomputeDomainEvidenceCompleteness(id: string): Promise<Domain>;
  listDomainSuffixes(): Promise<Array<{ suffix: string; count: number }>>;

  // Evidence
  createEvidence(input: CreateEvidenceInput): Promise<Evidence>;
  listEvidenceForDomain(domainId: string): Promise<Evidence[]>;
  listEvidenceForScan(scanId: string): Promise<Evidence[]>;
  getEvidenceByIds(ids: string[]): Promise<Evidence[]>;

  // Relationships
  upsertRelationship(input: UpsertRelationshipInput): Promise<RelationshipWithEndpoints>;
  listRelationships(query: RelationshipQuery): Promise<RelationshipWithEndpoints[]>;
  getRelationshipGraph(query: RelationshipQuery): Promise<RelationshipGraph>;
  confirmRelationship(id: string, at: string): Promise<RelationshipWithEndpoints>;

  // Regulatory sources
  listRegulatorySources(): Promise<RegulatorySourceListItem[]>;
  getRegulatorySourceDetail(id: string): Promise<RegulatorySourceDetail | null>;
  getRegulatorySourceById(id: string): Promise<RegulatorySource | null>;
  createRegulatorySource(input: CreateRegulatorySourceInput): Promise<RegulatorySource>;
  updateRegulatorySource(
    id: string,
    input: UpdateRegulatorySourceInput,
  ): Promise<RegulatorySource>;
  createRegulatorySourceCheck(
    input: CreateRegulatorySourceCheckInput,
  ): Promise<RegulatorySourceCheck>;
  createRegulatoryMatch(input: CreateRegulatoryMatchInput): Promise<RegulatoryMatch>;
  listRegulatoryMatchesForDomain(domainId: string): Promise<RegulatoryMatch[]>;

  // Reports
  createReport(input: CreateReportInput): Promise<Report>;
  getReportById(id: string): Promise<Report | null>;
  getReportDetail(id: string): Promise<ReportDetail | null>;
  updateReportContent(id: string, input: UpdateReportContentInput): Promise<Report>;
  applyReportTransition(id: string, input: ApplyReportTransitionInput): Promise<Report>;
  listReports(query: ReportQuery): Promise<Paginated<ReportListItem>>;

  // Audit — append and read only, by design.
  appendAuditEvent(input: AppendAuditEventInput): Promise<AuditEvent>;
  listAuditEvents(query: AuditQuery): Promise<Paginated<AuditEventListItem>>;
  listAuditEventsForEntity(
    entityType: AuditEntityType,
    entityId: string,
    limit: number,
  ): Promise<AuditEvent[]>;
  listAuditActors(): Promise<Array<{ id: string; name: string }>>;

  // Settings
  listSettings(): Promise<ApplicationSetting[]>;
  getSetting(key: string): Promise<ApplicationSetting | null>;
  updateSetting(
    key: string,
    value: JsonValue,
    updatedById: string | null,
  ): Promise<ApplicationSetting>;

  // Metrics
  getOverviewMetrics(): Promise<OverviewMetrics>;
}

/** Thrown when a write targets a record that does not exist. */
export class RecordNotFoundError extends Error {
  constructor(
    public readonly entity: string,
    public readonly id: string,
  ) {
    super(`${entity} "${id}" was not found.`);
    this.name = "RecordNotFoundError";
  }
}

/** Thrown when a write would violate a uniqueness constraint. */
export class UniqueConstraintError extends Error {
  constructor(
    public readonly entity: string,
    public readonly field: string,
    public readonly value: string,
  ) {
    super(`A ${entity} with ${field} "${value}" already exists.`);
    this.name = "UniqueConstraintError";
  }
}

/** Thrown when a caller attempts a mutation the interface forbids. */
export class AppendOnlyViolationError extends Error {
  constructor(entity: string, operation: string) {
    super(
      `${entity} is append-only: ${operation} is not permitted. ` +
        "Record a corrective event instead of altering history.",
    );
    this.name = "AppendOnlyViolationError";
  }
}
