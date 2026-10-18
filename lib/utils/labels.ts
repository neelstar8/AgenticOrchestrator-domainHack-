/**
 * Human-readable labels and tone mappings for every enum.
 *
 * Centralised so the same wording appears in tables, detail pages, CSV exports
 * and generated PDFs. The wording is part of the product's correctness: evidence
 * labels, "not checked" states and simulated-origin tags are all defined here.
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
} from "@/lib/types/enums";

/** Visual tone used by badges. `critical` is reserved for genuine warnings. */
export type Tone = "neutral" | "info" | "verified" | "review" | "critical" | "muted";

export const ROLE_LABELS: Record<Role, string> = {
  ADMINISTRATOR: "Administrator",
  INVESTIGATOR: "Investigator",
  REVIEWER: "Reviewer",
  VIEWER: "Read-only viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMINISTRATOR:
    "Full access, including settings, regulatory source configuration and demo data reset.",
  INVESTIGATOR:
    "Can run scans, triage domains, add reviewer assessments and draft reports.",
  REVIEWER:
    "Can triage domains and approve reports, and can record submission references and authority responses.",
  VIEWER: "Read-only access. Cannot run scans, change review status or alter reports.",
};

export const DATA_ORIGIN_LABELS: Record<DataOrigin, string> = {
  SIMULATED_DEMO: "Simulated demo data",
  LIVE_COLLECTED: "Collected from live source",
};

export const DATA_ORIGIN_TONES: Record<DataOrigin, Tone> = {
  SIMULATED_DEMO: "info",
  LIVE_COLLECTED: "verified",
};

export const SCAN_PROFILE_LABELS: Record<ScanProfile, string> = {
  QUICK: "Quick",
  COMPREHENSIVE: "Comprehensive",
};

export const SCAN_PROFILE_DESCRIPTIONS: Record<ScanProfile, string> = {
  QUICK:
    "Runs discovery, enumeration and a reduced inspection pass. Fewer candidates, faster result.",
  COMPREHENSIVE:
    "Runs every selected scope with the full inspection, regulatory matching and relationship analysis passes.",
};

export const SCAN_STATUS_LABELS: Record<ScanStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  COMPLETED: "Completed",
  COMPLETED_WITH_WARNINGS: "Completed with warnings",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const SCAN_STATUS_TONES: Record<ScanStatus, Tone> = {
  QUEUED: "muted",
  RUNNING: "info",
  COMPLETED: "verified",
  COMPLETED_WITH_WARNINGS: "review",
  FAILED: "critical",
  CANCELLED: "muted",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: "Pending",
  RUNNING: "Running",
  COMPLETED: "Completed",
  COMPLETED_WITH_WARNINGS: "Completed with warnings",
  FAILED: "Failed",
  SKIPPED: "Skipped",
  CANCELLED: "Cancelled",
};

export const TASK_STATUS_TONES: Record<TaskStatus, Tone> = {
  PENDING: "muted",
  RUNNING: "info",
  COMPLETED: "verified",
  COMPLETED_WITH_WARNINGS: "review",
  FAILED: "critical",
  SKIPPED: "muted",
  CANCELLED: "muted",
};

export const AGENT_LABELS: Record<AgentKey, string> = {
  WEB_DISCOVERY: "Web Discovery Agent",
  DOMAIN_ENUMERATION: "Domain Enumeration Agent",
  WEBSITE_INSPECTION: "Website Inspection Agent",
  REGULATORY_VERIFICATION: "Regulatory Verification Agent",
  RELATIONSHIP_ANALYSIS: "Relationship Analysis Agent",
  EVIDENCE_REPORTING: "Evidence & Reporting Agent",
};

export const AGENT_SHORT_LABELS: Record<AgentKey, string> = {
  WEB_DISCOVERY: "Web discovery",
  DOMAIN_ENUMERATION: "Enumeration",
  WEBSITE_INSPECTION: "Inspection",
  REGULATORY_VERIFICATION: "Regulatory",
  RELATIONSHIP_ANALYSIS: "Relationships",
  EVIDENCE_REPORTING: "Reporting",
};

export const AGENT_PURPOSES: Record<AgentKey, string> = {
  WEB_DISCOVERY:
    "Discovers candidate website URLs and domains through configured search providers and other authorised public discovery sources.",
  DOMAIN_ENUMERATION:
    "Generates candidate domain variations and subdomains and validates them with bounded DNS and domain-data checks. Produces candidates for verification — it does not claim to enumerate every possible domain.",
  WEBSITE_INSPECTION:
    "Inspects public page metadata, visible content, outbound links, redirects and technical fingerprints.",
  REGULATORY_VERIFICATION:
    "Compares discovered entities against configured official sources and preserves references to the source records. Reports no-match explicitly.",
  RELATIONSHIP_ANALYSIS:
    "Correlates domains using evidence gathered by the other agents and returns explainable relationships with stated uncertainty and limitations.",
  EVIDENCE_REPORTING:
    "Consolidates findings, scores evidence completeness, drafts structured reports and flags what still needs verification.",
};

export const DISCOVERY_SCOPE_LABELS: Record<DiscoveryScope, string> = {
  SEARCH_INDEX: "Search-index discovery",
  DOMAIN_VARIATIONS: "Domain variations and subdomains",
  CERTIFICATE_TRANSPARENCY: "Certificate-transparency discovery",
  TECHNICAL_INSPECTION: "Technical website inspection",
  REGULATORY_MATCHING: "Regulatory-source matching",
  RELATED_DOMAIN_ANALYSIS: "Related-domain analysis",
};

export const DISCOVERY_SCOPE_DESCRIPTIONS: Record<DiscoveryScope, string> = {
  SEARCH_INDEX:
    "Queries the configured search provider for pages that mention the brand or seed domain, and extracts the hostnames behind those results. Finding a page is discovery, not a finding of wrongdoing.",
  DOMAIN_VARIATIONS:
    "Generates plausible spellings, suffix swaps and common subdomain prefixes from the seed, then checks which of those candidates actually exist. Unresolved candidates stay marked 'not checked' rather than being dismissed.",
  CERTIFICATE_TRANSPARENCY:
    "Looks up public certificate-transparency log entries for names matching the seed. CT entries show a certificate was issued for a name — nothing more.",
  TECHNICAL_INSPECTION:
    "Retrieves publicly available page metadata, titles, visible text and redirect behaviour for candidates. Only public pages are read; no authentication, probing or exploitation of any kind is attempted.",
  REGULATORY_MATCHING:
    "Compares discovered entity and domain names against the configured official sources and records the matching source reference. A non-match is recorded as a non-match, never as authorisation.",
  RELATED_DOMAIN_ANALYSIS:
    "Correlates evidence across candidates to propose explainable relationships with confidence and limitations. Shared infrastructure alone is never reported as shared ownership.",
};

export const DISCOVERY_SOURCE_KIND_LABELS: Record<DiscoverySourceKind, string> = {
  SEARCH_INDEX: "Search index",
  DOMAIN_VARIATION: "Domain variation",
  CERTIFICATE_TRANSPARENCY: "Certificate transparency",
  PASSIVE_DNS: "Passive DNS",
  REGULATORY_DOCUMENT: "Regulatory document",
  REFERRAL_LINK: "Referral link",
  MANUAL_SUBMISSION: "Manual submission",
};

export const DNS_STATUS_LABELS: Record<DnsStatus, string> = {
  RESOLVED: "Resolved",
  NXDOMAIN: "Does not resolve (NXDOMAIN)",
  SERVFAIL: "Resolution failed (SERVFAIL)",
  TIMEOUT: "Resolution timed out",
  CHECK_FAILED: "Check failed",
};

export const DNS_STATUS_TONES: Record<DnsStatus, Tone> = {
  RESOLVED: "verified",
  NXDOMAIN: "muted",
  SERVFAIL: "review",
  TIMEOUT: "review",
  CHECK_FAILED: "review",
};

/** Rendered wherever a nullable observation field has never been checked. */
export const NOT_CHECKED_LABEL = "Not checked";
export const NOT_CHECKED_HINT =
  "No check has been attempted for this field. This is not a negative finding.";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  AWAITING_REVIEW: "Awaiting review",
  UNDER_REVIEW: "Under review",
  NEEDS_MORE_EVIDENCE: "Needs more evidence",
  ESCALATED: "Escalated",
  INCLUDED_IN_REPORT: "Included in report",
  NOT_RELATED: "Not related",
  DISMISSED: "Dismissed",
};

export const REVIEW_STATUS_TONES: Record<ReviewStatus, Tone> = {
  AWAITING_REVIEW: "review",
  UNDER_REVIEW: "info",
  NEEDS_MORE_EVIDENCE: "review",
  ESCALATED: "critical",
  INCLUDED_IN_REPORT: "verified",
  NOT_RELATED: "muted",
  DISMISSED: "muted",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  UNTRIAGED: "Untriaged",
};

export const PRIORITY_TONES: Record<Priority, Tone> = {
  CRITICAL: "critical",
  HIGH: "review",
  MEDIUM: "info",
  LOW: "muted",
  UNTRIAGED: "muted",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  UNTRIAGED: 4,
};

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  OBSERVED_FACT: "Observed fact",
  INFERRED_RELATIONSHIP: "Inferred relationship",
  OFFICIAL_SOURCE_MATCH: "Official-source match",
  REVIEWER_ASSESSMENT: "Reviewer assessment",
  UNVERIFIED_CLAIM: "Unverified claim",
};

export const EVIDENCE_KIND_DESCRIPTIONS: Record<EvidenceKind, string> = {
  OBSERVED_FACT:
    "Something directly observed and recorded with a timestamp, such as an HTTP response code or a page title.",
  INFERRED_RELATIONSHIP:
    "A correlation derived from other evidence. An inference, not an observation.",
  OFFICIAL_SOURCE_MATCH:
    "A name or domain matched text in a configured official source. The source reference and retrieval time are preserved.",
  REVIEWER_ASSESSMENT: "A judgement recorded by a named human reviewer.",
  UNVERIFIED_CLAIM:
    "A claim found in third-party content that Sentinel has not verified. Recorded for context only.",
};

export const EVIDENCE_KIND_TONES: Record<EvidenceKind, Tone> = {
  OBSERVED_FACT: "verified",
  INFERRED_RELATIONSHIP: "info",
  OFFICIAL_SOURCE_MATCH: "review",
  REVIEWER_ASSESSMENT: "neutral",
  UNVERIFIED_CLAIM: "muted",
};

export const EVIDENCE_COLLECTION_METHOD_LABELS: Record<EvidenceCollectionMethod, string> = {
  SIMULATED_DEMO_FIXTURE: "Simulated demo fixture",
  SEARCH_PROVIDER: "Search provider response",
  DNS_LOOKUP: "DNS lookup",
  HTTP_RESPONSE: "HTTP response",
  TLS_CERTIFICATE: "TLS certificate",
  CERTIFICATE_TRANSPARENCY_LOG: "Certificate-transparency log",
  REGULATORY_SOURCE_RETRIEVAL: "Regulatory source retrieval",
  LANGUAGE_MODEL_INFERENCE: "Language-model inference",
  CORRELATION_ANALYSIS: "Correlation analysis",
  HUMAN_REVIEW: "Human review",
};

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  REDIRECTS_TO: "Redirects to",
  SHARES_CERTIFICATE_CHARACTERISTIC: "Shares an observed certificate characteristic with",
  SIMILAR_WEBSITE_CONTENT: "Has similar website content to",
  APPEARS_IN_SAME_OFFICIAL_REPORT: "Appears in the same official report as",
  SUSPECTED_BRAND_RELATIONSHIP: "Has a suspected brand relationship with",
  CONFIRMED_RELATIONSHIP: "Confirmed relationship supported by evidence",
};

export const RELATIONSHIP_TYPE_SHORT_LABELS: Record<RelationshipType, string> = {
  REDIRECTS_TO: "Redirect",
  SHARES_CERTIFICATE_CHARACTERISTIC: "Certificate",
  SIMILAR_WEBSITE_CONTENT: "Similar content",
  APPEARS_IN_SAME_OFFICIAL_REPORT: "Same report",
  SUSPECTED_BRAND_RELATIONSHIP: "Suspected brand",
  CONFIRMED_RELATIONSHIP: "Confirmed",
};

export const RELATIONSHIP_TYPE_TONES: Record<RelationshipType, Tone> = {
  REDIRECTS_TO: "verified",
  SHARES_CERTIFICATE_CHARACTERISTIC: "info",
  SIMILAR_WEBSITE_CONTENT: "info",
  APPEARS_IN_SAME_OFFICIAL_REPORT: "review",
  SUSPECTED_BRAND_RELATIONSHIP: "review",
  CONFIRMED_RELATIONSHIP: "verified",
};

export const REGULATORY_SOURCE_TYPE_LABELS: Record<RegulatorySourceType, string> = {
  INVESTOR_WARNING_LIST: "Investor warning list",
  AUTHORISED_ENTITY_REGISTER: "Authorised-entity register",
  PRESS_RELEASE: "Press release",
  CIRCULAR_OR_NOTIFICATION: "Circular or notification",
  ENFORCEMENT_ORDER: "Enforcement order",
  PUBLIC_ADVISORY: "Public advisory",
  OTHER_OFFICIAL_PUBLICATION: "Other official publication",
};

export const RETRIEVAL_STATUS_LABELS: Record<RetrievalStatus, string> = {
  NEVER_CHECKED: "Never checked",
  OK: "Retrieved successfully",
  STALE: "Stale",
  UNREACHABLE: "Unreachable",
  HTTP_ERROR: "HTTP error",
  PARSE_ERROR: "Could not be parsed",
  BLOCKED_BY_SOURCE: "Blocked by source",
  DISABLED: "Disabled",
};

export const RETRIEVAL_STATUS_TONES: Record<RetrievalStatus, Tone> = {
  NEVER_CHECKED: "muted",
  OK: "verified",
  STALE: "review",
  UNREACHABLE: "critical",
  HTTP_ERROR: "critical",
  PARSE_ERROR: "review",
  BLOCKED_BY_SOURCE: "review",
  DISABLED: "muted",
};

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  EXACT_DOMAIN: "Exact domain match",
  EXACT_ENTITY_NAME: "Exact entity-name match",
  PARTIAL_ENTITY_NAME: "Partial entity-name match",
  BRAND_TOKEN: "Brand token match",
  CONTEXTUAL_MENTION: "Contextual mention",
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  DRAFT: "Draft",
  AWAITING_REVIEW: "Awaiting review",
  APPROVED: "Approved",
  SUBMITTED: "Submitted",
  RESPONSE_RECEIVED: "Response received",
  ACTION_CONFIRMED: "Action confirmed",
  CLOSED: "Closed",
};

export const REPORT_STATUS_TONES: Record<ReportStatus, Tone> = {
  DRAFT: "muted",
  AWAITING_REVIEW: "review",
  APPROVED: "info",
  SUBMITTED: "info",
  RESPONSE_RECEIVED: "info",
  ACTION_CONFIRMED: "verified",
  CLOSED: "muted",
};

export const REPORT_STATUS_DESCRIPTIONS: Record<ReportStatus, string> = {
  DRAFT: "Being prepared. Contents can still be edited freely.",
  AWAITING_REVIEW: "Submitted for internal review by an authorised reviewer.",
  APPROVED: "Approved internally by a named reviewer. Contents are frozen.",
  SUBMITTED:
    "A human recorded that this report was sent to the receiving authority out of band. Sentinel does not transmit reports.",
  RESPONSE_RECEIVED: "A response from the authority has been recorded.",
  ACTION_CONFIRMED:
    "An official action was confirmed and recorded by a reviewer, with a reference.",
  CLOSED: "No further action is planned.",
};

export const RECEIVING_AUTHORITY_LABELS: Record<ReceivingAuthority, string> = {
  SEBI: "Securities and Exchange Board of India (SEBI)",
  RBI: "Reserve Bank of India (RBI)",
  CERT_IN: "Indian Computer Emergency Response Team (CERT-In)",
  MEITY_I4C: "MeitY / Indian Cybercrime Coordination Centre (I4C)",
  LAW_ENFORCEMENT: "Law enforcement",
  INTERNAL_RECORD_ONLY: "Internal record only (not for submission)",
  OTHER: "Other authority",
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  USER_SIGNED_IN: "User signed in",
  USER_SIGNED_OUT: "User signed out",
  SCAN_CREATED: "Scan created",
  SCAN_CANCELLED: "Scan cancelled",
  SCAN_COMPLETED: "Scan completed",
  SCAN_FAILED: "Scan failed",
  AGENT_TASK_STARTED: "Agent task started",
  AGENT_TASK_COMPLETED: "Agent task completed",
  AGENT_TASK_FAILED: "Agent task failed",
  AGENT_TASK_RETRIED: "Agent task retried",
  DOMAIN_DISCOVERED: "Domain discovered",
  DOMAIN_UPDATED: "Domain updated",
  EVIDENCE_ADDED: "Evidence added",
  REVIEW_STATUS_CHANGED: "Review status changed",
  REVIEWER_ASSIGNED: "Reviewer assigned",
  RELATIONSHIP_RECORDED: "Relationship recorded",
  REGULATORY_SOURCE_CREATED: "Regulatory source created",
  REGULATORY_SOURCE_UPDATED: "Regulatory source updated",
  REGULATORY_SOURCE_CHECKED: "Regulatory source checked",
  REGULATORY_MATCH_RECORDED: "Regulatory match recorded",
  REPORT_CREATED: "Report created",
  REPORT_UPDATED: "Report updated",
  REPORT_GENERATED: "Report generated",
  REPORT_SUBMITTED_FOR_REVIEW: "Report submitted for review",
  REPORT_APPROVED: "Report approved",
  REPORT_EXPORTED: "Report exported",
  SUBMISSION_REFERENCE_RECORDED: "Submission reference recorded",
  AUTHORITY_RESPONSE_RECORDED: "Authority response recorded",
  OFFICIAL_OUTCOME_RECORDED: "Official outcome recorded",
  REPORT_CLOSED: "Report closed",
  SETTING_UPDATED: "Setting updated",
  DEMO_DATA_RESET: "Demo data reset",
};

export const AUDIT_ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  USER: "User",
  SCAN: "Scan",
  AGENT_TASK: "Agent task",
  DOMAIN: "Domain",
  EVIDENCE: "Evidence",
  DOMAIN_RELATIONSHIP: "Relationship",
  REGULATORY_SOURCE: "Regulatory source",
  REGULATORY_MATCH: "Regulatory match",
  REPORT: "Report",
  APPLICATION_SETTING: "Setting",
  SYSTEM: "System",
};

export const SETTING_CATEGORY_LABELS: Record<SettingCategory, string> = {
  APPLICATION: "Application",
  MODE: "Demo / live mode",
  AGENTS: "Agent configuration",
  PROVIDERS: "Provider configuration",
  SCAN_LIMITS: "Scan limits",
  RATE_LIMITING: "Rate limiting",
  EVIDENCE_RETENTION: "Evidence retention",
  REPORT_DEFAULTS: "Report defaults",
  APPEARANCE: "Theme preferences",
};
