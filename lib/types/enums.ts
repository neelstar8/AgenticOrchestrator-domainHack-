/**
 * Enum values mirroring prisma/schema.prisma exactly.
 *
 * These are declared as plain const objects rather than TypeScript `enum`s so
 * they are safe to import into Client Components and into the file-backed
 * repository adapter without pulling in @prisma/client. The Prisma adapter
 * casts to these same string literals, so both adapters are interchangeable.
 */

export const ROLES = ["ADMINISTRATOR", "INVESTIGATOR", "REVIEWER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const DATA_ORIGINS = ["SIMULATED_DEMO", "LIVE_COLLECTED"] as const;
export type DataOrigin = (typeof DATA_ORIGINS)[number];

export const SCAN_PROFILES = ["QUICK", "COMPREHENSIVE"] as const;
export type ScanProfile = (typeof SCAN_PROFILES)[number];

export const SCAN_STATUSES = [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "COMPLETED_WITH_WARNINGS",
  "FAILED",
  "CANCELLED",
] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const TERMINAL_SCAN_STATUSES: readonly ScanStatus[] = [
  "COMPLETED",
  "COMPLETED_WITH_WARNINGS",
  "FAILED",
  "CANCELLED",
];

export const DISCOVERY_SCOPES = [
  "SEARCH_INDEX",
  "DOMAIN_VARIATIONS",
  "CERTIFICATE_TRANSPARENCY",
  "TECHNICAL_INSPECTION",
  "REGULATORY_MATCHING",
  "RELATED_DOMAIN_ANALYSIS",
] as const;
export type DiscoveryScope = (typeof DISCOVERY_SCOPES)[number];

export const AGENT_KEYS = [
  "WEB_DISCOVERY",
  "DOMAIN_ENUMERATION",
  "WEBSITE_INSPECTION",
  "REGULATORY_VERIFICATION",
  "RELATIONSHIP_ANALYSIS",
  "EVIDENCE_REPORTING",
] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export const TASK_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "COMPLETED_WITH_WARNINGS",
  "FAILED",
  "SKIPPED",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const DISCOVERY_SOURCE_KINDS = [
  "SEARCH_INDEX",
  "DOMAIN_VARIATION",
  "CERTIFICATE_TRANSPARENCY",
  "PASSIVE_DNS",
  "REGULATORY_DOCUMENT",
  "REFERRAL_LINK",
  "MANUAL_SUBMISSION",
] as const;
export type DiscoverySourceKind = (typeof DISCOVERY_SOURCE_KINDS)[number];

export const DNS_STATUSES = [
  "RESOLVED",
  "NXDOMAIN",
  "SERVFAIL",
  "TIMEOUT",
  "CHECK_FAILED",
] as const;
export type DnsStatus = (typeof DNS_STATUSES)[number];

export const REVIEW_STATUSES = [
  "AWAITING_REVIEW",
  "UNDER_REVIEW",
  "NEEDS_MORE_EVIDENCE",
  "ESCALATED",
  "INCLUDED_IN_REPORT",
  "NOT_RELATED",
  "DISMISSED",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNTRIAGED"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const EVIDENCE_KINDS = [
  "OBSERVED_FACT",
  "INFERRED_RELATIONSHIP",
  "OFFICIAL_SOURCE_MATCH",
  "REVIEWER_ASSESSMENT",
  "UNVERIFIED_CLAIM",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_COLLECTION_METHODS = [
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
] as const;
export type EvidenceCollectionMethod = (typeof EVIDENCE_COLLECTION_METHODS)[number];

export const RELATIONSHIP_TYPES = [
  "REDIRECTS_TO",
  "SHARES_CERTIFICATE_CHARACTERISTIC",
  "SIMILAR_WEBSITE_CONTENT",
  "APPEARS_IN_SAME_OFFICIAL_REPORT",
  "SUSPECTED_BRAND_RELATIONSHIP",
  "CONFIRMED_RELATIONSHIP",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const REGULATORY_SOURCE_TYPES = [
  "INVESTOR_WARNING_LIST",
  "AUTHORISED_ENTITY_REGISTER",
  "PRESS_RELEASE",
  "CIRCULAR_OR_NOTIFICATION",
  "ENFORCEMENT_ORDER",
  "PUBLIC_ADVISORY",
  "OTHER_OFFICIAL_PUBLICATION",
] as const;
export type RegulatorySourceType = (typeof REGULATORY_SOURCE_TYPES)[number];

export const RETRIEVAL_STATUSES = [
  "NEVER_CHECKED",
  "OK",
  "STALE",
  "UNREACHABLE",
  "HTTP_ERROR",
  "PARSE_ERROR",
  "BLOCKED_BY_SOURCE",
  "DISABLED",
] as const;
export type RetrievalStatus = (typeof RETRIEVAL_STATUSES)[number];

export const MATCH_TYPES = [
  "EXACT_DOMAIN",
  "EXACT_ENTITY_NAME",
  "PARTIAL_ENTITY_NAME",
  "BRAND_TOKEN",
  "CONTEXTUAL_MENTION",
] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const REPORT_STATUSES = [
  "DRAFT",
  "AWAITING_REVIEW",
  "APPROVED",
  "SUBMITTED",
  "RESPONSE_RECEIVED",
  "ACTION_CONFIRMED",
  "CLOSED",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const RECEIVING_AUTHORITIES = [
  "SEBI",
  "RBI",
  "CERT_IN",
  "MEITY_I4C",
  "LAW_ENFORCEMENT",
  "INTERNAL_RECORD_ONLY",
  "OTHER",
] as const;
export type ReceivingAuthority = (typeof RECEIVING_AUTHORITIES)[number];

export const AUDIT_ACTIONS = [
  "USER_SIGNED_IN",
  "USER_SIGNED_OUT",
  "SCAN_CREATED",
  "SCAN_CANCELLED",
  "SCAN_COMPLETED",
  "SCAN_FAILED",
  "AGENT_TASK_STARTED",
  "AGENT_TASK_COMPLETED",
  "AGENT_TASK_FAILED",
  "AGENT_TASK_RETRIED",
  "DOMAIN_DISCOVERED",
  "DOMAIN_UPDATED",
  "EVIDENCE_ADDED",
  "REVIEW_STATUS_CHANGED",
  "REVIEWER_ASSIGNED",
  "RELATIONSHIP_RECORDED",
  "REGULATORY_SOURCE_CREATED",
  "REGULATORY_SOURCE_UPDATED",
  "REGULATORY_SOURCE_CHECKED",
  "REGULATORY_MATCH_RECORDED",
  "REPORT_CREATED",
  "REPORT_UPDATED",
  "REPORT_GENERATED",
  "REPORT_SUBMITTED_FOR_REVIEW",
  "REPORT_APPROVED",
  "REPORT_EXPORTED",
  "SUBMISSION_REFERENCE_RECORDED",
  "AUTHORITY_RESPONSE_RECORDED",
  "OFFICIAL_OUTCOME_RECORDED",
  "REPORT_CLOSED",
  "SETTING_UPDATED",
  "DEMO_DATA_RESET",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = [
  "USER",
  "SCAN",
  "AGENT_TASK",
  "DOMAIN",
  "EVIDENCE",
  "DOMAIN_RELATIONSHIP",
  "REGULATORY_SOURCE",
  "REGULATORY_MATCH",
  "REPORT",
  "APPLICATION_SETTING",
  "SYSTEM",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const SETTING_CATEGORIES = [
  "APPLICATION",
  "MODE",
  "AGENTS",
  "PROVIDERS",
  "SCAN_LIMITS",
  "RATE_LIMITING",
  "EVIDENCE_RETENTION",
  "REPORT_DEFAULTS",
  "APPEARANCE",
] as const;
export type SettingCategory = (typeof SETTING_CATEGORIES)[number];
