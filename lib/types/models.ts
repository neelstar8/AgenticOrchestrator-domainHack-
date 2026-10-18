/**
 * Sentinel entity types.
 *
 * These mirror prisma/schema.prisma. Dates are `string` (ISO 8601) because the
 * file-backed repository serialises to JSON and because every value here must
 * survive the server/client boundary unchanged. The Prisma adapter converts
 * Date objects to ISO strings at its boundary so callers never have to care
 * which adapter is active.
 *
 * Nullable technical fields mean "not checked" — never a negative finding.
 */

import type {
  AgentKey,
  AuditAction,
  AuditEntityType,
  DataOrigin,
  DiscoveryScope,
  DiscoverySourceKind,
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
  SettingCategory,
  TaskStatus,
} from "./enums";

/** ISO-8601 timestamp string. */
export type IsoDateTime = string;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  jobTitle: string | null;
  isActive: boolean;
  isDemoUser: boolean;
  lastLoginAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Internal shape including the credential hash. Never leaves the server. */
export interface UserWithSecret extends User {
  passwordHash: string;
}

export interface Platform {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  investigationId: string | null;
  description: string | null;
  origin: DataOrigin;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface DiscoverySource {
  id: string;
  key: string;
  name: string;
  kind: DiscoverySourceKind;
  description: string;
  isEnabled: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Scan {
  id: string;
  reference: string;
  platformId: string | null;
  platformNameInput: string;
  seedDomain: string | null;
  notes: string | null;
  profile: ScanProfile;
  scopes: DiscoveryScope[];
  maxCandidates: number;
  status: ScanStatus;
  origin: DataOrigin;
  initiatedById: string;
  queuedAt: IsoDateTime;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  cancelledAt: IsoDateTime | null;
  durationMs: number | null;
  candidatesFound: number;
  candidatesRequiringReview: number;
  warningCount: number;
  errorMessage: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface AgentTask {
  id: string;
  scanId: string;
  agentKey: AgentKey;
  sequence: number;
  title: string;
  status: TaskStatus;
  attempt: number;
  maxAttempts: number;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  durationMs: number | null;
  inputSummary: string | null;
  outputSummary: string | null;
  metrics: Record<string, number> | null;
  errorMessage: string | null;
  hasWarnings: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Domain {
  id: string;
  fqdn: string;
  normalizedDomain: string;
  registrableDomain: string;
  suffix: string;
  seedPlatformId: string | null;
  associatedNames: string[];
  firstSeenAt: IsoDateTime;
  lastSeenAt: IsoDateTime;

  // Technical observations — null means "not checked".
  lastCheckedAt: IsoDateTime | null;
  dnsStatus: DnsStatus | null;
  dnsCheckedAt: IsoDateTime | null;
  resolvedIpCount: number | null;
  httpStatusCode: number | null;
  httpCheckedAt: IsoDateTime | null;
  redirectsToUrl: string | null;
  redirectObservedAt: IsoDateTime | null;
  certIssuer: string | null;
  certSubjectCommonName: string | null;
  certNotBefore: IsoDateTime | null;
  certNotAfter: IsoDateTime | null;
  certFingerprintSha256: string | null;
  certObservedAt: IsoDateTime | null;
  siteTitle: string | null;
  siteDescription: string | null;
  siteLanguage: string | null;
  detectedTechnologies: string[];
  observedAt: IsoDateTime | null;

  // Investigative signals — not determinations.
  brandSimilarityScore: number | null;
  contentSimilarityScore: number | null;
  similarityRationale: string | null;
  evidenceCompleteness: number;

  // Human review.
  reviewStatus: ReviewStatus;
  priority: Priority;
  assignedReviewerId: string | null;
  reviewerNotes: string | null;
  reviewedAt: IsoDateTime | null;

  origin: DataOrigin;
  discoveredByScanId: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface DomainPlatformLink {
  domainId: string;
  platformId: string;
  rationale: string;
  confidence: number;
  origin: DataOrigin;
  createdAt: IsoDateTime;
}

export interface DomainDiscoverySourceLink {
  domainId: string;
  discoverySourceId: string;
  firstSeenAt: IsoDateTime;
  lastSeenAt: IsoDateTime;
  detail: string | null;
  origin: DataOrigin;
}

export interface Evidence {
  id: string;
  domainId: string | null;
  scanId: string | null;
  agentTaskId: string | null;
  kind: EvidenceKind;
  title: string;
  description: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  collectedAt: IsoDateTime;
  collectionMethod: EvidenceCollectionMethod;
  confidence: number | null;
  limitations: string | null;
  origin: DataOrigin;
  rawReference: JsonValue | null;
  createdById: string | null;
  createdAt: IsoDateTime;
}

export interface DomainRelationship {
  id: string;
  sourceDomainId: string;
  targetDomainId: string;
  type: RelationshipType;
  confidence: number;
  rationale: string;
  limitations: string;
  relationSource: string;
  firstObservedAt: IsoDateTime;
  lastObservedAt: IsoDateTime;
  reviewerConfirmed: boolean;
  reviewerConfirmedAt: IsoDateTime | null;
  origin: DataOrigin;
  evidenceId: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface RegulatorySource {
  id: string;
  authorityName: string;
  authorityShortName: string;
  title: string;
  sourceUrl: string;
  sourceType: RegulatorySourceType;
  description: string | null;
  isEnabled: boolean;
  checkIntervalHours: number;
  lastCheckAttemptAt: IsoDateTime | null;
  lastSuccessfulCheckAt: IsoDateTime | null;
  lastModifiedReported: IsoDateTime | null;
  retrievalStatus: RetrievalStatus;
  retrievalError: string | null;
  matchedEntityCount: number;
  verificationNotes: string | null;
  origin: DataOrigin;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface RegulatorySourceCheck {
  id: string;
  regulatorySourceId: string;
  startedAt: IsoDateTime;
  completedAt: IsoDateTime | null;
  status: RetrievalStatus;
  httpStatusCode: number | null;
  bytesRetrieved: number | null;
  matchedEntityCount: number;
  errorMessage: string | null;
  note: string | null;
  origin: DataOrigin;
  triggeredById: string | null;
  createdAt: IsoDateTime;
}

export interface RegulatoryMatch {
  id: string;
  regulatorySourceId: string;
  regulatorySourceCheckId: string | null;
  domainId: string | null;
  matchedTerm: string;
  matchedContext: string;
  matchType: MatchType;
  confidence: number;
  sourceUrl: string;
  sourceRetrievedAt: IsoDateTime;
  reviewerConfirmed: boolean;
  reviewerConfirmedById: string | null;
  reviewerConfirmedAt: IsoDateTime | null;
  notes: string | null;
  origin: DataOrigin;
  createdAt: IsoDateTime;
}

export interface Report {
  id: string;
  reference: string;
  title: string;
  status: ReportStatus;
  receivingAuthority: ReceivingAuthority;
  authorityOther: string | null;
  executiveSummary: string;
  findings: string;
  recommendations: string;
  limitations: string;
  methodology: string;
  preparedById: string;
  approvedById: string | null;
  approvedAt: IsoDateTime | null;
  submittedAt: IsoDateTime | null;
  submissionReference: string | null;
  submissionChannel: string | null;
  responseReceivedAt: IsoDateTime | null;
  responseSummary: string | null;
  outcomeConfirmedAt: IsoDateTime | null;
  outcomeSummary: string | null;
  closedAt: IsoDateTime | null;
  closingNote: string | null;
  origin: DataOrigin;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ReportDomainLink {
  reportId: string;
  domainId: string;
  includedRationale: string | null;
  orderIndex: number;
}

export interface ReportEvidenceLink {
  reportId: string;
  evidenceId: string;
  orderIndex: number;
}

export interface AuditEvent {
  id: string;
  occurredAt: IsoDateTime;
  actorId: string | null;
  actorLabel: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string | null;
  previousState: JsonValue | null;
  newState: JsonValue | null;
  reason: string | null;
  requestId: string | null;
  createdAt: IsoDateTime;
}

export interface ApplicationSetting {
  key: string;
  category: SettingCategory;
  label: string;
  description: string;
  value: JsonValue;
  isSecret: boolean;
  isEditable: boolean;
  updatedById: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
