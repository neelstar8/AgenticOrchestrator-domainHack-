-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMINISTRATOR', 'INVESTIGATOR', 'REVIEWER', 'VIEWER');

-- CreateEnum
CREATE TYPE "DataOrigin" AS ENUM ('SIMULATED_DEMO', 'LIVE_COLLECTED');

-- CreateEnum
CREATE TYPE "ScanProfile" AS ENUM ('QUICK', 'COMPREHENSIVE');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscoveryScope" AS ENUM ('SEARCH_INDEX', 'DOMAIN_VARIATIONS', 'CERTIFICATE_TRANSPARENCY', 'TECHNICAL_INSPECTION', 'REGULATORY_MATCHING', 'RELATED_DOMAIN_ANALYSIS');

-- CreateEnum
CREATE TYPE "AgentKey" AS ENUM ('WEB_DISCOVERY', 'DOMAIN_ENUMERATION', 'WEBSITE_INSPECTION', 'REGULATORY_VERIFICATION', 'RELATIONSHIP_ANALYSIS', 'EVIDENCE_REPORTING');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscoverySourceKind" AS ENUM ('SEARCH_INDEX', 'DOMAIN_VARIATION', 'CERTIFICATE_TRANSPARENCY', 'PASSIVE_DNS', 'REGULATORY_DOCUMENT', 'REFERRAL_LINK', 'MANUAL_SUBMISSION');

-- CreateEnum
CREATE TYPE "DnsStatus" AS ENUM ('RESOLVED', 'NXDOMAIN', 'SERVFAIL', 'TIMEOUT', 'CHECK_FAILED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('AWAITING_REVIEW', 'UNDER_REVIEW', 'NEEDS_MORE_EVIDENCE', 'ESCALATED', 'INCLUDED_IN_REPORT', 'NOT_RELATED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNTRIAGED');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('OBSERVED_FACT', 'INFERRED_RELATIONSHIP', 'OFFICIAL_SOURCE_MATCH', 'REVIEWER_ASSESSMENT', 'UNVERIFIED_CLAIM');

-- CreateEnum
CREATE TYPE "EvidenceCollectionMethod" AS ENUM ('SIMULATED_DEMO_FIXTURE', 'SEARCH_PROVIDER', 'DNS_LOOKUP', 'HTTP_RESPONSE', 'TLS_CERTIFICATE', 'CERTIFICATE_TRANSPARENCY_LOG', 'REGULATORY_SOURCE_RETRIEVAL', 'LANGUAGE_MODEL_INFERENCE', 'CORRELATION_ANALYSIS', 'HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('REDIRECTS_TO', 'SHARES_CERTIFICATE_CHARACTERISTIC', 'SIMILAR_WEBSITE_CONTENT', 'APPEARS_IN_SAME_OFFICIAL_REPORT', 'SUSPECTED_BRAND_RELATIONSHIP', 'CONFIRMED_RELATIONSHIP');

-- CreateEnum
CREATE TYPE "RegulatorySourceType" AS ENUM ('INVESTOR_WARNING_LIST', 'AUTHORISED_ENTITY_REGISTER', 'PRESS_RELEASE', 'CIRCULAR_OR_NOTIFICATION', 'ENFORCEMENT_ORDER', 'PUBLIC_ADVISORY', 'OTHER_OFFICIAL_PUBLICATION');

-- CreateEnum
CREATE TYPE "RetrievalStatus" AS ENUM ('NEVER_CHECKED', 'OK', 'STALE', 'UNREACHABLE', 'HTTP_ERROR', 'PARSE_ERROR', 'BLOCKED_BY_SOURCE', 'DISABLED');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('EXACT_DOMAIN', 'EXACT_ENTITY_NAME', 'PARTIAL_ENTITY_NAME', 'BRAND_TOKEN', 'CONTEXTUAL_MENTION');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'AWAITING_REVIEW', 'APPROVED', 'SUBMITTED', 'RESPONSE_RECEIVED', 'ACTION_CONFIRMED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReceivingAuthority" AS ENUM ('SEBI', 'RBI', 'CERT_IN', 'MEITY_I4C', 'LAW_ENFORCEMENT', 'INTERNAL_RECORD_ONLY', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_SIGNED_IN', 'USER_SIGNED_OUT', 'SCAN_CREATED', 'SCAN_CANCELLED', 'SCAN_COMPLETED', 'SCAN_FAILED', 'AGENT_TASK_STARTED', 'AGENT_TASK_COMPLETED', 'AGENT_TASK_FAILED', 'AGENT_TASK_RETRIED', 'DOMAIN_DISCOVERED', 'DOMAIN_UPDATED', 'EVIDENCE_ADDED', 'REVIEW_STATUS_CHANGED', 'REVIEWER_ASSIGNED', 'RELATIONSHIP_RECORDED', 'REGULATORY_SOURCE_CREATED', 'REGULATORY_SOURCE_UPDATED', 'REGULATORY_SOURCE_CHECKED', 'REGULATORY_MATCH_RECORDED', 'REPORT_CREATED', 'REPORT_UPDATED', 'REPORT_GENERATED', 'REPORT_SUBMITTED_FOR_REVIEW', 'REPORT_APPROVED', 'REPORT_EXPORTED', 'SUBMISSION_REFERENCE_RECORDED', 'AUTHORITY_RESPONSE_RECORDED', 'OFFICIAL_OUTCOME_RECORDED', 'REPORT_CLOSED', 'SETTING_UPDATED', 'DEMO_DATA_RESET');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('USER', 'SCAN', 'AGENT_TASK', 'DOMAIN', 'EVIDENCE', 'DOMAIN_RELATIONSHIP', 'REGULATORY_SOURCE', 'REGULATORY_MATCH', 'REPORT', 'APPLICATION_SETTING', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SettingCategory" AS ENUM ('APPLICATION', 'MODE', 'AGENTS', 'PROVIDERS', 'SCAN_LIMITS', 'RATE_LIMITING', 'EVIDENCE_RETENTION', 'REPORT_DEFAULTS', 'APPEARANCE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "passwordHash" TEXT NOT NULL,
    "jobTitle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemoUser" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Platform" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "investigationId" TEXT,
    "description" TEXT,
    "origin" "DataOrigin" NOT NULL DEFAULT 'SIMULATED_DEMO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoverySource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DiscoverySourceKind" NOT NULL,
    "description" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoverySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "platformId" TEXT,
    "platformNameInput" TEXT NOT NULL,
    "seedDomain" TEXT,
    "notes" TEXT,
    "profile" "ScanProfile" NOT NULL DEFAULT 'QUICK',
    "scopes" "DiscoveryScope"[] DEFAULT ARRAY[]::"DiscoveryScope"[],
    "maxCandidates" INTEGER NOT NULL DEFAULT 50,
    "status" "ScanStatus" NOT NULL DEFAULT 'QUEUED',
    "origin" "DataOrigin" NOT NULL DEFAULT 'SIMULATED_DEMO',
    "initiatedById" TEXT NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "candidatesFound" INTEGER NOT NULL DEFAULT 0,
    "candidatesRequiringReview" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "agentKey" "AgentKey" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "inputSummary" TEXT,
    "outputSummary" TEXT,
    "metrics" JSONB,
    "errorMessage" TEXT,
    "hasWarnings" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "fqdn" TEXT NOT NULL,
    "normalizedDomain" TEXT NOT NULL,
    "registrableDomain" TEXT NOT NULL,
    "suffix" TEXT NOT NULL,
    "seedPlatformId" TEXT,
    "associatedNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "dnsStatus" "DnsStatus",
    "dnsCheckedAt" TIMESTAMP(3),
    "resolvedIpCount" INTEGER,
    "httpStatusCode" INTEGER,
    "httpCheckedAt" TIMESTAMP(3),
    "redirectsToUrl" TEXT,
    "redirectObservedAt" TIMESTAMP(3),
    "certIssuer" TEXT,
    "certSubjectCommonName" TEXT,
    "certNotBefore" TIMESTAMP(3),
    "certNotAfter" TIMESTAMP(3),
    "certFingerprintSha256" TEXT,
    "certObservedAt" TIMESTAMP(3),
    "siteTitle" TEXT,
    "siteDescription" TEXT,
    "siteLanguage" TEXT,
    "detectedTechnologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "observedAt" TIMESTAMP(3),
    "brandSimilarityScore" INTEGER,
    "contentSimilarityScore" INTEGER,
    "similarityRationale" TEXT,
    "evidenceCompleteness" INTEGER NOT NULL DEFAULT 0,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'AWAITING_REVIEW',
    "priority" "Priority" NOT NULL DEFAULT 'UNTRIAGED',
    "assignedReviewerId" TEXT,
    "reviewerNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "origin" "DataOrigin" NOT NULL DEFAULT 'SIMULATED_DEMO',
    "discoveredByScanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainPlatform" (
    "domainId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "origin" "DataOrigin" NOT NULL DEFAULT 'SIMULATED_DEMO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainPlatform_pkey" PRIMARY KEY ("domainId","platformId")
);

-- CreateTable
CREATE TABLE "DomainDiscoverySource" (
    "domainId" TEXT NOT NULL,
    "discoverySourceId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "detail" TEXT,
    "origin" "DataOrigin" NOT NULL DEFAULT 'SIMULATED_DEMO',

    CONSTRAINT "DomainDiscoverySource_pkey" PRIMARY KEY ("domainId","discoverySourceId")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "domainId" TEXT,
    "scanId" TEXT,
    "agentTaskId" TEXT,
    "kind" "EvidenceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceLabel" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "collectionMethod" "EvidenceCollectionMethod" NOT NULL,
    "confidence" INTEGER,
    "limitations" TEXT,
    "origin" "DataOrigin" NOT NULL DEFAULT 'SIMULATED_DEMO',
    "rawReference" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainRelationship" (
    "id" TEXT NOT NULL,
    "sourceDomainId" TEXT NOT NULL,
    "targetDomainId" TEXT NOT NULL,
    "type" "RelationshipType" NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "rationale" TEXT NOT NULL,
    "limitations" TEXT NOT NULL,
    "relationSource" TEXT NOT NULL,
    "firstObservedAt" TIMESTAMP(3) NOT NULL,
    "lastObservedAt" TIMESTAMP(3) NOT NULL,
    "reviewerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "reviewerConfirmedAt" TIMESTAMP(3),
    "origin" "DataOrigin" NOT NULL DEFAULT 'SIMULATED_DEMO',
    "evidenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatorySource" (
    "id" TEXT NOT NULL,
    "authorityName" TEXT NOT NULL,
    "authorityShortName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceType" "RegulatorySourceType" NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "checkIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "lastCheckAttemptAt" TIMESTAMP(3),
    "lastSuccessfulCheckAt" TIMESTAMP(3),
    "lastModifiedReported" TIMESTAMP(3),
    "retrievalStatus" "RetrievalStatus" NOT NULL DEFAULT 'NEVER_CHECKED',
    "retrievalError" TEXT,
    "matchedEntityCount" INTEGER NOT NULL DEFAULT 0,
    "verificationNotes" TEXT,
    "origin" "DataOrigin" NOT NULL DEFAULT 'SIMULATED_DEMO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatorySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatorySourceCheck" (
    "id" TEXT NOT NULL,
    "regulatorySourceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "status" "RetrievalStatus" NOT NULL,
    "httpStatusCode" INTEGER,
    "bytesRetrieved" INTEGER,
    "matchedEntityCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "note" TEXT,
    "origin" "DataOrigin" NOT NULL DEFAULT 'SIMULATED_DEMO',
    "triggeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatorySourceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryMatch" (
    "id" TEXT NOT NULL,
    "regulatorySourceId" TEXT NOT NULL,
    "regulatorySourceCheckId" TEXT,
    "domainId" TEXT,
    "matchedTerm" TEXT NOT NULL,
    "matchedContext" TEXT NOT NULL,
    "matchType" "MatchType" NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "sourceUrl" TEXT NOT NULL,
    "sourceRetrievedAt" TIMESTAMP(3) NOT NULL,
    "reviewerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "reviewerConfirmedById" TEXT,
    "reviewerConfirmedAt" TIMESTAMP(3),
    "notes" TEXT,
    "origin" "DataOrigin" NOT NULL DEFAULT 'SIMULATED_DEMO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "receivingAuthority" "ReceivingAuthority" NOT NULL DEFAULT 'INTERNAL_RECORD_ONLY',
    "authorityOther" TEXT,
    "executiveSummary" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "recommendations" TEXT NOT NULL,
    "limitations" TEXT NOT NULL,
    "methodology" TEXT NOT NULL,
    "preparedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submissionReference" TEXT,
    "submissionChannel" TEXT,
    "responseReceivedAt" TIMESTAMP(3),
    "responseSummary" TEXT,
    "outcomeConfirmedAt" TIMESTAMP(3),
    "outcomeSummary" TEXT,
    "closedAt" TIMESTAMP(3),
    "closingNote" TEXT,
    "origin" "DataOrigin" NOT NULL DEFAULT 'SIMULATED_DEMO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportDomain" (
    "reportId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "includedRationale" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReportDomain_pkey" PRIMARY KEY ("reportId","domainId")
);

-- CreateTable
CREATE TABLE "ReportEvidence" (
    "reportId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReportEvidence_pkey" PRIMARY KEY ("reportId","evidenceId")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT,
    "previousState" JSONB,
    "newState" JSONB,
    "reason" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationSetting" (
    "key" TEXT NOT NULL,
    "category" "SettingCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Platform_name_key" ON "Platform"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Platform_slug_key" ON "Platform"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Platform_investigationId_key" ON "Platform"("investigationId");

-- CreateIndex
CREATE INDEX "Platform_origin_idx" ON "Platform"("origin");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoverySource_key_key" ON "DiscoverySource"("key");

-- CreateIndex
CREATE INDEX "DiscoverySource_kind_idx" ON "DiscoverySource"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "Scan_reference_key" ON "Scan"("reference");

-- CreateIndex
CREATE INDEX "Scan_status_idx" ON "Scan"("status");

-- CreateIndex
CREATE INDEX "Scan_platformId_idx" ON "Scan"("platformId");

-- CreateIndex
CREATE INDEX "Scan_initiatedById_idx" ON "Scan"("initiatedById");

-- CreateIndex
CREATE INDEX "Scan_queuedAt_idx" ON "Scan"("queuedAt");

-- CreateIndex
CREATE INDEX "Scan_origin_idx" ON "Scan"("origin");

-- CreateIndex
CREATE INDEX "AgentTask_scanId_status_idx" ON "AgentTask"("scanId", "status");

-- CreateIndex
CREATE INDEX "AgentTask_agentKey_idx" ON "AgentTask"("agentKey");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTask_scanId_sequence_key" ON "AgentTask"("scanId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_fqdn_key" ON "Domain"("fqdn");

-- CreateIndex
CREATE INDEX "Domain_normalizedDomain_idx" ON "Domain"("normalizedDomain");

-- CreateIndex
CREATE INDEX "Domain_registrableDomain_idx" ON "Domain"("registrableDomain");

-- CreateIndex
CREATE INDEX "Domain_suffix_idx" ON "Domain"("suffix");

-- CreateIndex
CREATE INDEX "Domain_reviewStatus_idx" ON "Domain"("reviewStatus");

-- CreateIndex
CREATE INDEX "Domain_priority_idx" ON "Domain"("priority");

-- CreateIndex
CREATE INDEX "Domain_seedPlatformId_idx" ON "Domain"("seedPlatformId");

-- CreateIndex
CREATE INDEX "Domain_firstSeenAt_idx" ON "Domain"("firstSeenAt");

-- CreateIndex
CREATE INDEX "Domain_origin_idx" ON "Domain"("origin");

-- CreateIndex
CREATE INDEX "Domain_discoveredByScanId_idx" ON "Domain"("discoveredByScanId");

-- CreateIndex
CREATE INDEX "DomainPlatform_platformId_idx" ON "DomainPlatform"("platformId");

-- CreateIndex
CREATE INDEX "DomainDiscoverySource_discoverySourceId_idx" ON "DomainDiscoverySource"("discoverySourceId");

-- CreateIndex
CREATE INDEX "Evidence_domainId_idx" ON "Evidence"("domainId");

-- CreateIndex
CREATE INDEX "Evidence_scanId_idx" ON "Evidence"("scanId");

-- CreateIndex
CREATE INDEX "Evidence_kind_idx" ON "Evidence"("kind");

-- CreateIndex
CREATE INDEX "Evidence_collectedAt_idx" ON "Evidence"("collectedAt");

-- CreateIndex
CREATE INDEX "Evidence_origin_idx" ON "Evidence"("origin");

-- CreateIndex
CREATE INDEX "DomainRelationship_type_idx" ON "DomainRelationship"("type");

-- CreateIndex
CREATE INDEX "DomainRelationship_sourceDomainId_idx" ON "DomainRelationship"("sourceDomainId");

-- CreateIndex
CREATE INDEX "DomainRelationship_targetDomainId_idx" ON "DomainRelationship"("targetDomainId");

-- CreateIndex
CREATE INDEX "DomainRelationship_origin_idx" ON "DomainRelationship"("origin");

-- CreateIndex
CREATE UNIQUE INDEX "DomainRelationship_sourceDomainId_targetDomainId_type_key" ON "DomainRelationship"("sourceDomainId", "targetDomainId", "type");

-- CreateIndex
CREATE INDEX "RegulatorySource_sourceType_idx" ON "RegulatorySource"("sourceType");

-- CreateIndex
CREATE INDEX "RegulatorySource_retrievalStatus_idx" ON "RegulatorySource"("retrievalStatus");

-- CreateIndex
CREATE INDEX "RegulatorySource_isEnabled_idx" ON "RegulatorySource"("isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatorySource_authorityShortName_sourceUrl_key" ON "RegulatorySource"("authorityShortName", "sourceUrl");

-- CreateIndex
CREATE INDEX "RegulatorySourceCheck_regulatorySourceId_startedAt_idx" ON "RegulatorySourceCheck"("regulatorySourceId", "startedAt");

-- CreateIndex
CREATE INDEX "RegulatorySourceCheck_status_idx" ON "RegulatorySourceCheck"("status");

-- CreateIndex
CREATE INDEX "RegulatoryMatch_regulatorySourceId_idx" ON "RegulatoryMatch"("regulatorySourceId");

-- CreateIndex
CREATE INDEX "RegulatoryMatch_domainId_idx" ON "RegulatoryMatch"("domainId");

-- CreateIndex
CREATE INDEX "RegulatoryMatch_matchType_idx" ON "RegulatoryMatch"("matchType");

-- CreateIndex
CREATE INDEX "RegulatoryMatch_origin_idx" ON "RegulatoryMatch"("origin");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reference_key" ON "Report"("reference");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Report_preparedById_idx" ON "Report"("preparedById");

-- CreateIndex
CREATE INDEX "Report_receivingAuthority_idx" ON "Report"("receivingAuthority");

-- CreateIndex
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt");

-- CreateIndex
CREATE INDEX "ReportDomain_domainId_idx" ON "ReportDomain"("domainId");

-- CreateIndex
CREATE INDEX "ReportEvidence_evidenceId_idx" ON "ReportEvidence"("evidenceId");

-- CreateIndex
CREATE INDEX "AuditEvent_occurredAt_idx" ON "AuditEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ApplicationSetting_category_idx" ON "ApplicationSetting"("category");

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_seedPlatformId_fkey" FOREIGN KEY ("seedPlatformId") REFERENCES "Platform"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_discoveredByScanId_fkey" FOREIGN KEY ("discoveredByScanId") REFERENCES "Scan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainPlatform" ADD CONSTRAINT "DomainPlatform_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainPlatform" ADD CONSTRAINT "DomainPlatform_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainDiscoverySource" ADD CONSTRAINT "DomainDiscoverySource_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainDiscoverySource" ADD CONSTRAINT "DomainDiscoverySource_discoverySourceId_fkey" FOREIGN KEY ("discoverySourceId") REFERENCES "DiscoverySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_agentTaskId_fkey" FOREIGN KEY ("agentTaskId") REFERENCES "AgentTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainRelationship" ADD CONSTRAINT "DomainRelationship_sourceDomainId_fkey" FOREIGN KEY ("sourceDomainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainRelationship" ADD CONSTRAINT "DomainRelationship_targetDomainId_fkey" FOREIGN KEY ("targetDomainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainRelationship" ADD CONSTRAINT "DomainRelationship_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatorySourceCheck" ADD CONSTRAINT "RegulatorySourceCheck_regulatorySourceId_fkey" FOREIGN KEY ("regulatorySourceId") REFERENCES "RegulatorySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatorySourceCheck" ADD CONSTRAINT "RegulatorySourceCheck_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryMatch" ADD CONSTRAINT "RegulatoryMatch_regulatorySourceId_fkey" FOREIGN KEY ("regulatorySourceId") REFERENCES "RegulatorySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryMatch" ADD CONSTRAINT "RegulatoryMatch_regulatorySourceCheckId_fkey" FOREIGN KEY ("regulatorySourceCheckId") REFERENCES "RegulatorySourceCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryMatch" ADD CONSTRAINT "RegulatoryMatch_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryMatch" ADD CONSTRAINT "RegulatoryMatch_reviewerConfirmedById_fkey" FOREIGN KEY ("reviewerConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDomain" ADD CONSTRAINT "ReportDomain_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDomain" ADD CONSTRAINT "ReportDomain_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEvidence" ADD CONSTRAINT "ReportEvidence_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEvidence" ADD CONSTRAINT "ReportEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationSetting" ADD CONSTRAINT "ApplicationSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
