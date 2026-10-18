// Deliberately NOT marked `server-only`: this module is a pure data builder with
// no environment or credential access, and `prisma/seed.ts` runs it from a plain
// Node process outside the Next.js bundler.
import { hash as bcryptHash } from "bcryptjs";

import { computeEvidenceCompleteness } from "@/lib/utils/evidence";
import { normalizeDomain } from "@/lib/utils/domain-name";
import {
  DEMO_BASE_INSTANT,
  addDays,
  addHours,
  addMinutes,
  iso,
  seededRandom,
  stableId,
} from "@/lib/utils/deterministic";
import { emptyDataset, type Dataset } from "@/lib/repositories/dataset";
import type {
  AgentTask,
  AuditEvent,
  Domain,
  Evidence,
  RegulatoryMatch,
  Report,
  Scan,
  UserWithSecret,
} from "@/lib/types/models";
import type { AuditAction, AuditEntityType, DataOrigin } from "@/lib/types/enums";

import { DOMAIN_SPECS, type DomainSpec } from "./fixtures/domain-specs";
import { REGULATORY_SOURCE_SPECS } from "./fixtures/regulatory-specs";
import { RELATIONSHIP_SPECS } from "./fixtures/relationship-specs";
import { REPORT_SPECS } from "./fixtures/report-specs";
import { SCAN_SPECS } from "./fixtures/scan-specs";
import {
  DEMO_PASSWORD,
  DISCOVERY_SOURCE_SPECS,
  PLATFORM_SPECS,
  SETTING_SPECS,
  USER_SPECS,
} from "./fixtures/static-specs";

/**
 * Builds the complete demo dataset from the declarative fixtures.
 *
 * Determinism is a hard requirement: ids are derived with `stableId` and every
 * timestamp is an offset from DEMO_BASE_INSTANT, so two machines that seed the
 * same version produce byte-identical data. The only non-deterministic values
 * are the bcrypt password hashes, which embed a random salt by design.
 *
 * EVERY record produced here carries `origin: "SIMULATED_DEMO"`. Nothing in
 * this file was collected from a real source.
 */

const ORIGIN: DataOrigin = "SIMULATED_DEMO";
const BASE = DEMO_BASE_INSTANT;

function daysAgo(days: number): Date {
  return addDays(BASE, -days);
}

export async function buildSeedDataset(): Promise<Dataset> {
  const data = emptyDataset();
  const random = seededRandom("sentinel-demo-seed-v1");

  // --- users ---------------------------------------------------------------
  const passwordHash = await bcryptHash(DEMO_PASSWORD, 10);
  const userIdByKey = new Map<string, string>();

  for (const spec of USER_SPECS) {
    const id = stableId("usr", spec.key);
    userIdByKey.set(spec.key, id);
    const user: UserWithSecret = {
      id,
      email: spec.email,
      name: spec.name,
      role: spec.role,
      passwordHash,
      jobTitle: spec.jobTitle,
      isActive: true,
      isDemoUser: true,
      lastLoginAt: iso(addHours(daysAgo(0), -2)),
      createdAt: iso(daysAgo(60)),
      updatedAt: iso(daysAgo(60)),
    };
    data.users.push(user);
  }

  const userId = (key: string): string => {
    const id = userIdByKey.get(key);
    if (!id) throw new Error(`Demo seed: unknown user key "${key}"`);
    return id;
  };
  const userName = (key: string): string =>
    USER_SPECS.find((spec) => spec.key === key)?.name ?? "Unknown";

  // --- platforms -----------------------------------------------------------
  const platformIdByKey = new Map<string, string>();
  for (const spec of PLATFORM_SPECS) {
    const id = stableId("plt", spec.key);
    platformIdByKey.set(spec.key, id);
    data.platforms.push({
      id,
      name: spec.name,
      slug: spec.slug,
      aliases: spec.aliases,
      investigationId: spec.investigationId,
      description: spec.description,
      origin: ORIGIN,
      createdAt: iso(daysAgo(30)),
      updatedAt: iso(daysAgo(30)),
    });
  }
  const platformId = (key: string): string => {
    const id = platformIdByKey.get(key);
    if (!id) throw new Error(`Demo seed: unknown platform key "${key}"`);
    return id;
  };

  // --- discovery sources ---------------------------------------------------
  const discoverySourceIdByKey = new Map<string, string>();
  for (const spec of DISCOVERY_SOURCE_SPECS) {
    const id = stableId("dsc", spec.key);
    discoverySourceIdByKey.set(spec.key, id);
    data.discoverySources.push({
      id,
      key: spec.key,
      name: spec.name,
      kind: spec.kind,
      description: spec.description,
      isEnabled: spec.isEnabled,
      createdAt: iso(daysAgo(60)),
      updatedAt: iso(daysAgo(60)),
    });
  }

  // --- audit helper --------------------------------------------------------
  let auditSequence = 0;
  const audit = (input: {
    at: Date;
    actorKey: string | null;
    action: AuditAction;
    entityType: AuditEntityType;
    entityId: string;
    entityLabel?: string;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
    reason?: string | null;
  }): void => {
    auditSequence += 1;
    const event: AuditEvent = {
      id: stableId("aud", `${auditSequence}`),
      occurredAt: iso(input.at),
      actorId: input.actorKey ? userId(input.actorKey) : null,
      actorLabel: input.actorKey ? userName(input.actorKey) : "Sentinel orchestrator",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel ?? null,
      previousState: (input.previousState ?? null) as AuditEvent["previousState"],
      newState: (input.newState ?? null) as AuditEvent["newState"],
      reason: input.reason ?? null,
      requestId: `demo-seed-${String(auditSequence).padStart(4, "0")}`,
      createdAt: iso(input.at),
    };
    data.auditEvents.push(event);
  };

  // --- scans and agent tasks ----------------------------------------------
  const scanIdByReference = new Map<string, string>();
  const scanIdByFqdn = new Map<string, string>();
  const taskIdByScanAndAgent = new Map<string, string>();

  for (const spec of SCAN_SPECS) {
    const id = stableId("scn", spec.reference);
    scanIdByReference.set(spec.reference, id);
    for (const fqdn of spec.discoveredFqdns) {
      if (!scanIdByFqdn.has(fqdn)) scanIdByFqdn.set(fqdn, id);
    }

    const queuedAt = daysAgo(spec.startedDaysAgo);
    const startedAt = addMinutes(queuedAt, 0);
    const completedAt = new Date(startedAt.getTime() + spec.durationSeconds * 1000);
    const isTerminalSuccess =
      spec.status === "COMPLETED" || spec.status === "COMPLETED_WITH_WARNINGS";

    const scan: Scan = {
      id,
      reference: spec.reference,
      platformId: platformId(spec.platform),
      platformNameInput: spec.platformNameInput,
      seedDomain: spec.seedDomain,
      notes: spec.notes,
      profile: spec.profile,
      scopes: spec.scopes,
      maxCandidates: spec.maxCandidates,
      status: spec.status,
      origin: ORIGIN,
      initiatedById: userId(spec.initiatedBy),
      queuedAt: iso(queuedAt),
      startedAt: iso(startedAt),
      completedAt: isTerminalSuccess || spec.status === "FAILED" ? iso(completedAt) : null,
      cancelledAt: spec.status === "CANCELLED" ? iso(completedAt) : null,
      durationMs: spec.durationSeconds * 1000,
      candidatesFound: spec.candidatesFound,
      candidatesRequiringReview: spec.candidatesRequiringReview,
      warningCount: spec.warningCount,
      errorMessage: spec.errorMessage ?? null,
      createdAt: iso(queuedAt),
      updatedAt: iso(completedAt),
    };
    data.scans.push(scan);

    audit({
      at: queuedAt,
      actorKey: spec.initiatedBy,
      action: "SCAN_CREATED",
      entityType: "SCAN",
      entityId: id,
      entityLabel: spec.reference,
      newState: {
        status: "QUEUED",
        profile: spec.profile,
        seedDomain: spec.seedDomain,
        scopes: spec.scopes,
      },
      reason: "Demo simulation scan created by the seed fixture.",
    });

    let taskClock = startedAt;
    spec.tasks.forEach((taskSpec, index) => {
      const taskId = stableId("tsk", `${spec.reference}:${taskSpec.agentKey}`);
      taskIdByScanAndAgent.set(`${id}:${taskSpec.agentKey}`, taskId);
      const taskStarted = new Date(taskClock);
      const taskCompleted = new Date(taskClock.getTime() + taskSpec.durationMs);
      taskClock = taskCompleted;

      const notStarted = taskSpec.durationMs === 0;
      const task: AgentTask = {
        id: taskId,
        scanId: id,
        agentKey: taskSpec.agentKey,
        sequence: index + 1,
        title: taskSpec.title,
        status: taskSpec.status,
        attempt: taskSpec.attempt ?? (taskSpec.status === "FAILED" ? 2 : 1),
        maxAttempts: 2,
        startedAt: notStarted ? null : iso(taskStarted),
        completedAt: notStarted ? null : iso(taskCompleted),
        durationMs: notStarted ? null : taskSpec.durationMs,
        inputSummary: `Seed: ${spec.platformNameInput}${spec.seedDomain ? ` (${spec.seedDomain})` : ""}`,
        outputSummary: taskSpec.outputSummary,
        metrics: taskSpec.metrics ?? null,
        errorMessage: taskSpec.errorMessage ?? null,
        hasWarnings: taskSpec.hasWarnings ?? false,
        createdAt: iso(startedAt),
        updatedAt: iso(notStarted ? startedAt : taskCompleted),
      };
      data.agentTasks.push(task);

      if (!notStarted) {
        audit({
          at: taskStarted,
          actorKey: null,
          action: "AGENT_TASK_STARTED",
          entityType: "AGENT_TASK",
          entityId: taskId,
          entityLabel: `${spec.reference} · ${taskSpec.agentKey}`,
          newState: { status: "RUNNING", attempt: task.attempt },
        });

        if (taskSpec.status === "FAILED") {
          audit({
            at: taskCompleted,
            actorKey: null,
            action: "AGENT_TASK_FAILED",
            entityType: "AGENT_TASK",
            entityId: taskId,
            entityLabel: `${spec.reference} · ${taskSpec.agentKey}`,
            previousState: { status: "RUNNING" },
            newState: { status: "FAILED", attempt: task.attempt },
            reason: taskSpec.errorMessage ?? null,
          });
        } else {
          audit({
            at: taskCompleted,
            actorKey: null,
            action: "AGENT_TASK_COMPLETED",
            entityType: "AGENT_TASK",
            entityId: taskId,
            entityLabel: `${spec.reference} · ${taskSpec.agentKey}`,
            previousState: { status: "RUNNING" },
            newState: { status: taskSpec.status, durationMs: taskSpec.durationMs },
          });
        }
      }
    });

    // The failed scan retried its inspection task once before giving up.
    if (spec.status === "FAILED") {
      const failedTask = spec.tasks.find((task) => task.status === "FAILED");
      if (failedTask) {
        audit({
          at: addMinutes(startedAt, 1),
          actorKey: null,
          action: "AGENT_TASK_RETRIED",
          entityType: "AGENT_TASK",
          entityId: taskIdByScanAndAgent.get(`${id}:${failedTask.agentKey}`) ?? id,
          entityLabel: `${spec.reference} · ${failedTask.agentKey}`,
          previousState: { attempt: 1, status: "FAILED" },
          newState: { attempt: 2, status: "RUNNING" },
          reason: "Automatic retry after a transport error on attempt 1.",
        });
      }
      audit({
        at: completedAt,
        actorKey: null,
        action: "SCAN_FAILED",
        entityType: "SCAN",
        entityId: id,
        entityLabel: spec.reference,
        previousState: { status: "RUNNING" },
        newState: { status: "FAILED" },
        reason: spec.errorMessage ?? null,
      });
    } else if (spec.status === "CANCELLED") {
      audit({
        at: completedAt,
        actorKey: spec.initiatedBy,
        action: "SCAN_CANCELLED",
        entityType: "SCAN",
        entityId: id,
        entityLabel: spec.reference,
        previousState: { status: "RUNNING" },
        newState: { status: "CANCELLED" },
        reason: "Cancelled by the operator after the discovery stage.",
      });
    } else {
      audit({
        at: completedAt,
        actorKey: null,
        action: "SCAN_COMPLETED",
        entityType: "SCAN",
        entityId: id,
        entityLabel: spec.reference,
        previousState: { status: "RUNNING" },
        newState: {
          status: spec.status,
          candidatesFound: spec.candidatesFound,
          durationMs: spec.durationSeconds * 1000,
        },
      });
    }
  }

  // --- domains, source links, evidence -------------------------------------
  const domainIdByFqdn = new Map<string, string>();

  for (const spec of DOMAIN_SPECS) {
    const parsed = normalizeDomain(spec.fqdn);
    const id = stableId("dom", parsed.fqdn);
    domainIdByFqdn.set(parsed.fqdn, id);

    const firstSeen = daysAgo(spec.firstSeenDaysAgo);
    const lastSeen = daysAgo(spec.lastSeenDaysAgo ?? spec.firstSeenDaysAgo);
    const hasTechnicalCheck = spec.dnsStatus !== undefined || spec.httpStatusCode !== undefined;
    const observedAt = hasTechnicalCheck ? lastSeen : null;

    const certObserved = spec.certFingerprint ? lastSeen : null;
    const certNotBefore = spec.certValidDays ? addDays(lastSeen, -spec.certValidDays / 2) : null;
    const certNotAfter = spec.certValidDays ? addDays(lastSeen, spec.certValidDays / 2) : null;

    const domain: Domain = {
      id,
      fqdn: parsed.fqdn,
      normalizedDomain: parsed.normalizedDomain,
      registrableDomain: parsed.registrableDomain,
      suffix: parsed.suffix,
      seedPlatformId: platformId(spec.platform),
      associatedNames: spec.associatedNames ?? [],
      firstSeenAt: iso(firstSeen),
      lastSeenAt: iso(lastSeen),
      lastCheckedAt: observedAt ? iso(observedAt) : null,
      dnsStatus: spec.dnsStatus ?? null,
      dnsCheckedAt: spec.dnsStatus ? iso(lastSeen) : null,
      resolvedIpCount: spec.resolvedIpCount ?? null,
      httpStatusCode: spec.httpStatusCode ?? null,
      httpCheckedAt: spec.httpStatusCode !== undefined ? iso(lastSeen) : null,
      redirectsToUrl: spec.redirectsToUrl ?? null,
      redirectObservedAt: spec.redirectsToUrl ? iso(lastSeen) : null,
      certIssuer: spec.certIssuer ?? null,
      certSubjectCommonName: spec.certCommonName ?? null,
      certNotBefore: certNotBefore ? iso(certNotBefore) : null,
      certNotAfter: certNotAfter ? iso(certNotAfter) : null,
      certFingerprintSha256: spec.certFingerprint ?? null,
      certObservedAt: certObserved ? iso(certObserved) : null,
      siteTitle: spec.siteTitle ?? null,
      siteDescription: spec.siteDescription ?? null,
      siteLanguage: spec.siteLanguage ?? null,
      detectedTechnologies: spec.technologies ?? [],
      observedAt: observedAt ? iso(observedAt) : null,
      brandSimilarityScore: spec.brandSimilarity ?? null,
      contentSimilarityScore: spec.contentSimilarity ?? null,
      similarityRationale: spec.similarityRationale ?? null,
      evidenceCompleteness: 0,
      reviewStatus: spec.reviewStatus,
      priority: spec.priority,
      assignedReviewerId: spec.assignedReviewer ? userId(spec.assignedReviewer) : null,
      reviewerNotes: spec.reviewerNotes ?? null,
      reviewedAt: spec.reviewerNotes ? iso(addHours(lastSeen, 3)) : null,
      origin: ORIGIN,
      discoveredByScanId: scanIdByFqdn.get(parsed.fqdn) ?? null,
      createdAt: iso(firstSeen),
      updatedAt: iso(lastSeen),
    };
    data.domains.push(domain);

    // Discovery-source links
    for (const sourceKey of spec.sources) {
      const sourceId = discoverySourceIdByKey.get(sourceKey);
      if (!sourceId) continue;
      data.domainDiscoverySources.push({
        domainId: id,
        discoverySourceId: sourceId,
        firstSeenAt: iso(firstSeen),
        lastSeenAt: iso(lastSeen),
        detail: null,
        origin: ORIGIN,
      });
    }

    // Platform link with its rationale
    data.domainPlatforms.push({
      domainId: id,
      platformId: platformId(spec.platform),
      rationale: spec.falsePositive
        ? "Surfaced during this investigation and reviewed. Recorded as not related."
        : (spec.similarityRationale ??
          "Surfaced as a candidate during this investigation. Association is a discovery record, not a finding."),
      confidence: spec.falsePositive ? 5 : (spec.brandSimilarity ?? 0),
      origin: ORIGIN,
      createdAt: iso(firstSeen),
    });

    audit({
      at: firstSeen,
      actorKey: null,
      action: "DOMAIN_DISCOVERED",
      entityType: "DOMAIN",
      entityId: id,
      entityLabel: parsed.fqdn,
      newState: { fqdn: parsed.fqdn, sources: spec.sources, reviewStatus: "AWAITING_REVIEW" },
      reason: "Discovered by the simulated agent pipeline.",
    });

    if (!spec.noEvidence) {
      addEvidenceForDomain(data, {
        domain,
        spec,
        scanId: scanIdByFqdn.get(parsed.fqdn) ?? null,
        taskIdByScanAndAgent,
        lastSeen,
        firstSeen,
        reviewerUserId: spec.assignedReviewer ? userId(spec.assignedReviewer) : null,
      });
    }

    if (spec.reviewerNotes) {
      audit({
        at: addHours(lastSeen, 3),
        actorKey: spec.assignedReviewer ?? "reviewer",
        action: "REVIEW_STATUS_CHANGED",
        entityType: "DOMAIN",
        entityId: id,
        entityLabel: parsed.fqdn,
        previousState: { reviewStatus: "AWAITING_REVIEW" },
        newState: { reviewStatus: spec.reviewStatus, priority: spec.priority },
        reason: spec.reviewerNotes,
      });
    }
  }

  const domainId = (fqdn: string): string | null => domainIdByFqdn.get(fqdn) ?? null;

  // --- relationships -------------------------------------------------------
  for (const spec of RELATIONSHIP_SPECS) {
    const sourceId = domainId(spec.source);
    const targetId = domainId(spec.target);
    if (!sourceId || !targetId) continue;

    const observedAt = daysAgo(spec.observedDaysAgo);
    const id = stableId("rel", `${spec.source}->${spec.target}:${spec.type}`);
    data.relationships.push({
      id,
      sourceDomainId: sourceId,
      targetDomainId: targetId,
      type: spec.type,
      confidence: spec.confidence,
      rationale: spec.rationale,
      limitations: spec.limitations,
      relationSource: spec.relationSource,
      firstObservedAt: iso(addDays(observedAt, -1)),
      lastObservedAt: iso(observedAt),
      reviewerConfirmed: spec.reviewerConfirmed ?? false,
      reviewerConfirmedAt: spec.reviewerConfirmed ? iso(addHours(observedAt, 2)) : null,
      origin: ORIGIN,
      evidenceId: null,
      createdAt: iso(addDays(observedAt, -1)),
      updatedAt: iso(observedAt),
    });

    audit({
      at: observedAt,
      actorKey: spec.reviewerConfirmed ? "reviewer" : null,
      action: "RELATIONSHIP_RECORDED",
      entityType: "DOMAIN_RELATIONSHIP",
      entityId: id,
      entityLabel: `${spec.source} → ${spec.target}`,
      newState: { type: spec.type, confidence: spec.confidence },
      reason: spec.rationale,
    });
  }

  // --- regulatory sources, checks and matches ------------------------------
  for (const spec of REGULATORY_SOURCE_SPECS) {
    const id = stableId("reg", spec.key);
    const checks = spec.checks ?? [];
    const successful = checks.filter((check) => check.status === "OK");
    const latest = checks[0];
    const latestSuccess = successful[0];

    data.regulatorySources.push({
      id,
      authorityName: spec.authorityName,
      authorityShortName: spec.authorityShortName,
      title: spec.title,
      sourceUrl: spec.sourceUrl,
      sourceType: spec.sourceType,
      description: spec.description,
      isEnabled: spec.isEnabled,
      checkIntervalHours: spec.checkIntervalHours,
      lastCheckAttemptAt: latest ? iso(daysAgo(latest.daysAgo)) : null,
      lastSuccessfulCheckAt: latestSuccess ? iso(daysAgo(latestSuccess.daysAgo)) : null,
      lastModifiedReported: latestSuccess
        ? iso(addDays(daysAgo(latestSuccess.daysAgo), -3))
        : null,
      retrievalStatus: spec.isEnabled ? (latest?.status ?? "NEVER_CHECKED") : "DISABLED",
      retrievalError: latest?.errorMessage ?? null,
      matchedEntityCount: spec.matches?.length ?? 0,
      verificationNotes: spec.verificationNotes,
      origin: ORIGIN,
      createdAt: iso(daysAgo(45)),
      updatedAt: iso(latest ? daysAgo(latest.daysAgo) : daysAgo(45)),
    });

    audit({
      at: daysAgo(45),
      actorKey: "admin",
      action: "REGULATORY_SOURCE_CREATED",
      entityType: "REGULATORY_SOURCE",
      entityId: id,
      entityLabel: `${spec.authorityShortName} — ${spec.title}`,
      newState: { sourceUrl: spec.sourceUrl, sourceType: spec.sourceType, isEnabled: spec.isEnabled },
      reason: spec.isRealAuthority
        ? "Real official source configured. Sentinel has never retrieved it."
        : "Simulated fixture source added for demonstration.",
    });

    const checkIdByDaysAgo = new Map<number, string>();
    checks.forEach((check, index) => {
      const checkId = stableId("chk", `${spec.key}:${index}`);
      checkIdByDaysAgo.set(check.daysAgo, checkId);
      const startedAt = daysAgo(check.daysAgo);
      data.regulatorySourceChecks.push({
        id: checkId,
        regulatorySourceId: id,
        startedAt: iso(startedAt),
        completedAt: iso(new Date(startedAt.getTime() + check.durationSeconds * 1000)),
        status: check.status,
        httpStatusCode: check.httpStatusCode ?? null,
        bytesRetrieved: check.bytesRetrieved ?? null,
        matchedEntityCount: check.matchedEntityCount,
        errorMessage: check.errorMessage ?? null,
        note: check.note ?? null,
        origin: ORIGIN,
        triggeredById: index === 0 ? userId("admin") : null,
        createdAt: iso(startedAt),
      });

      audit({
        at: startedAt,
        actorKey: index === 0 ? "admin" : null,
        action: "REGULATORY_SOURCE_CHECKED",
        entityType: "REGULATORY_SOURCE",
        entityId: id,
        entityLabel: `${spec.authorityShortName} — ${spec.title}`,
        newState: { status: check.status, matchedEntityCount: check.matchedEntityCount },
        reason: check.errorMessage ?? check.note ?? null,
      });
    });

    for (const [index, matchSpec] of (spec.matches ?? []).entries()) {
      const matchId = stableId("mtc", `${spec.key}:${index}`);
      const match: RegulatoryMatch = {
        id: matchId,
        regulatorySourceId: id,
        regulatorySourceCheckId: checkIdByDaysAgo.get(matchSpec.daysAgo) ?? null,
        domainId: matchSpec.domainFqdn ? domainId(matchSpec.domainFqdn) : null,
        matchedTerm: matchSpec.matchedTerm,
        matchedContext: matchSpec.matchedContext,
        matchType: matchSpec.matchType,
        confidence: matchSpec.confidence,
        sourceUrl: spec.sourceUrl,
        sourceRetrievedAt: iso(daysAgo(matchSpec.daysAgo)),
        reviewerConfirmed: false,
        reviewerConfirmedById: null,
        reviewerConfirmedAt: null,
        notes: matchSpec.notes ?? null,
        origin: ORIGIN,
        createdAt: iso(daysAgo(matchSpec.daysAgo)),
      };
      data.regulatoryMatches.push(match);

      audit({
        at: daysAgo(matchSpec.daysAgo),
        actorKey: null,
        action: "REGULATORY_MATCH_RECORDED",
        entityType: "REGULATORY_MATCH",
        entityId: matchId,
        entityLabel: `${matchSpec.matchedTerm} · ${spec.authorityShortName}`,
        newState: { matchType: matchSpec.matchType, confidence: matchSpec.confidence },
        reason:
          "Simulated match against a fictional fixture source. Carries no official weight.",
      });

      // An official-source match is evidence against the domain it names.
      if (match.domainId) {
        data.evidence.push({
          id: stableId("evd", `regmatch:${matchId}`),
          domainId: match.domainId,
          scanId: null,
          agentTaskId: null,
          kind: "OFFICIAL_SOURCE_MATCH",
          title: `Match in ${spec.title}`,
          description:
            `The term "${matchSpec.matchedTerm}" matched text in the configured source ` +
            `"${spec.title}" (${spec.authorityShortName}). Context: ${matchSpec.matchedContext}`,
          sourceUrl: spec.sourceUrl,
          sourceLabel: `${spec.authorityShortName} — ${spec.title}`,
          collectedAt: iso(daysAgo(matchSpec.daysAgo)),
          collectionMethod: "REGULATORY_SOURCE_RETRIEVAL",
          confidence: matchSpec.confidence,
          limitations: spec.isRealAuthority
            ? "Unexpected: this source has never been retrieved."
            : "The source is a FICTIONAL demonstration fixture at a reserved .invalid hostname, not a real regulator. This match has no official weight whatsoever and must be independently verified against a genuine publication.",
          origin: ORIGIN,
          rawReference: {
            fixtureSourceKey: spec.key,
            matchType: matchSpec.matchType,
            simulated: true,
          },
          createdById: null,
          createdAt: iso(daysAgo(matchSpec.daysAgo)),
        });
      }
    }
  }

  // --- reports -------------------------------------------------------------
  for (const spec of REPORT_SPECS) {
    const id = stableId("rpt", spec.reference);
    const createdAt = daysAgo(spec.createdDaysAgo);

    const report: Report = {
      id,
      reference: spec.reference,
      title: spec.title,
      status: spec.status,
      receivingAuthority: spec.receivingAuthority,
      authorityOther: null,
      executiveSummary: spec.executiveSummary,
      findings: spec.findings,
      recommendations: spec.recommendations,
      limitations: spec.limitations,
      methodology: spec.methodology,
      preparedById: userId(spec.preparedBy),
      approvedById: spec.approvedBy ? userId(spec.approvedBy) : null,
      approvedAt: spec.approvedDaysAgo !== undefined ? iso(daysAgo(spec.approvedDaysAgo)) : null,
      submittedAt:
        spec.submittedDaysAgo !== undefined ? iso(daysAgo(spec.submittedDaysAgo)) : null,
      submissionReference: spec.submissionReference ?? null,
      submissionChannel: spec.submissionChannel ?? null,
      responseReceivedAt:
        spec.responseDaysAgo !== undefined ? iso(daysAgo(spec.responseDaysAgo)) : null,
      responseSummary: spec.responseSummary ?? null,
      outcomeConfirmedAt:
        spec.outcomeDaysAgo !== undefined ? iso(daysAgo(spec.outcomeDaysAgo)) : null,
      outcomeSummary: spec.outcomeSummary ?? null,
      closedAt: spec.closedDaysAgo !== undefined ? iso(daysAgo(spec.closedDaysAgo)) : null,
      closingNote: spec.closingNote ?? null,
      origin: ORIGIN,
      createdAt: iso(createdAt),
      updatedAt: iso(daysAgo(Math.min(spec.createdDaysAgo, spec.outcomeDaysAgo ?? 99))),
    };
    data.reports.push(report);

    spec.domainFqdns.forEach((fqdn, orderIndex) => {
      const linkedDomainId = domainId(fqdn);
      if (!linkedDomainId) return;
      data.reportDomains.push({
        reportId: id,
        domainId: linkedDomainId,
        includedRationale: spec.domainRationales?.[fqdn] ?? null,
        orderIndex,
      });
      // Attach that domain's strongest evidence to the report.
      const evidenceForDomain = data.evidence
        .filter((item) => item.domainId === linkedDomainId)
        .slice(0, 4);
      evidenceForDomain.forEach((item, evidenceIndex) => {
        if (data.reportEvidence.some((l) => l.reportId === id && l.evidenceId === item.id)) return;
        data.reportEvidence.push({
          reportId: id,
          evidenceId: item.id,
          orderIndex: orderIndex * 10 + evidenceIndex,
        });
      });
    });

    audit({
      at: createdAt,
      actorKey: spec.preparedBy,
      action: "REPORT_CREATED",
      entityType: "REPORT",
      entityId: id,
      entityLabel: spec.reference,
      newState: { status: "DRAFT", domainCount: spec.domainFqdns.length },
    });

    if (spec.status !== "DRAFT") {
      audit({
        at: addHours(createdAt, 6),
        actorKey: spec.preparedBy,
        action: "REPORT_SUBMITTED_FOR_REVIEW",
        entityType: "REPORT",
        entityId: id,
        entityLabel: spec.reference,
        previousState: { status: "DRAFT" },
        newState: { status: "AWAITING_REVIEW" },
      });
    }
    if (spec.approvedDaysAgo !== undefined && spec.approvedBy) {
      audit({
        at: daysAgo(spec.approvedDaysAgo),
        actorKey: spec.approvedBy,
        action: "REPORT_APPROVED",
        entityType: "REPORT",
        entityId: id,
        entityLabel: spec.reference,
        previousState: { status: "AWAITING_REVIEW" },
        newState: { status: "APPROVED", approvedBy: userName(spec.approvedBy) },
        reason: "Reviewer judged the recorded evidence adequate for referral.",
      });
    }
    if (spec.submittedDaysAgo !== undefined) {
      audit({
        at: daysAgo(spec.submittedDaysAgo),
        actorKey: spec.approvedBy ?? spec.preparedBy,
        action: "SUBMISSION_REFERENCE_RECORDED",
        entityType: "REPORT",
        entityId: id,
        entityLabel: spec.reference,
        previousState: { status: "APPROVED" },
        newState: { status: "SUBMITTED", submissionReference: spec.submissionReference },
        reason:
          "A human recorded an out-of-band submission. Sentinel did not transmit this report.",
      });
    }
    if (spec.responseDaysAgo !== undefined) {
      audit({
        at: daysAgo(spec.responseDaysAgo),
        actorKey: "reviewer",
        action: "AUTHORITY_RESPONSE_RECORDED",
        entityType: "REPORT",
        entityId: id,
        entityLabel: spec.reference,
        previousState: { status: "SUBMITTED" },
        newState: { status: "RESPONSE_RECEIVED" },
        reason: spec.responseSummary ?? null,
      });
    }
    if (spec.outcomeDaysAgo !== undefined) {
      audit({
        at: daysAgo(spec.outcomeDaysAgo),
        actorKey: "reviewer",
        action: "OFFICIAL_OUTCOME_RECORDED",
        entityType: "REPORT",
        entityId: id,
        entityLabel: spec.reference,
        previousState: { status: "RESPONSE_RECEIVED" },
        newState: { status: "ACTION_CONFIRMED" },
        reason: spec.outcomeSummary ?? null,
      });
    }
  }

  // --- settings ------------------------------------------------------------
  for (const spec of SETTING_SPECS) {
    data.settings.push({
      key: spec.key,
      category: spec.category,
      label: spec.label,
      description: spec.description,
      value: spec.value,
      isSecret: spec.isSecret ?? false,
      isEditable: spec.isEditable ?? true,
      updatedById: null,
      createdAt: iso(daysAgo(60)),
      updatedAt: iso(daysAgo(60)),
    });
  }

  // --- sign-in history, so the audit log is not uniformly machine-generated
  for (let i = 0; i < 12; i += 1) {
    const key = random.pick(USER_SPECS).key;
    audit({
      at: addHours(daysAgo(random.int(0, 25)), -random.int(1, 10)),
      actorKey: key,
      action: "USER_SIGNED_IN",
      entityType: "USER",
      entityId: userId(key),
      entityLabel: userName(key),
      reason: "Demo session established.",
    });
  }

  // --- derive evidence completeness from the evidence that now exists ------
  for (const domain of data.domains) {
    const evidence = data.evidence.filter((item) => item.domainId === domain.id);
    const matches = data.regulatoryMatches.filter((match) => match.domainId === domain.id);
    const relationships = data.relationships.filter(
      (relationship) =>
        relationship.sourceDomainId === domain.id || relationship.targetDomainId === domain.id,
    );
    domain.evidenceCompleteness = computeEvidenceCompleteness(domain, evidence, {
      regulatoryMatchCount: matches.length,
      relationshipCount: relationships.length,
    }).percent;
  }

  // Audit events read best newest-first; store them chronologically.
  data.auditEvents.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  return data;
}

// ---------------------------------------------------------------------------
// Evidence generation
// ---------------------------------------------------------------------------

interface EvidenceContext {
  domain: Domain;
  spec: DomainSpec;
  scanId: string | null;
  taskIdByScanAndAgent: Map<string, string>;
  firstSeen: Date;
  lastSeen: Date;
  reviewerUserId: string | null;
}

/**
 * Creates the evidence trail for one demo domain.
 *
 * Each item gets its correct epistemic label, a collection method, a
 * timestamp and — where one exists — a source reference. Observations that
 * were never made produce no evidence at all, which is what keeps the
 * completeness score honest.
 */
function addEvidenceForDomain(data: Dataset, context: EvidenceContext): void {
  const { domain, spec, scanId, taskIdByScanAndAgent, lastSeen, reviewerUserId } = context;
  const push = (
    suffix: string,
    evidence: Omit<Evidence, "id" | "domainId" | "scanId" | "createdAt">,
  ): void => {
    data.evidence.push({
      ...evidence,
      id: stableId("evd", `${domain.fqdn}:${suffix}`),
      domainId: domain.id,
      scanId,
      createdAt: evidence.collectedAt,
    });
  };

  const taskFor = (agentKey: string): string | null =>
    scanId ? (taskIdByScanAndAgent.get(`${scanId}:${agentKey}`) ?? null) : null;

  const simulationCaveat =
    "Simulated observation produced by the demo fixture provider. No network request was made.";

  if (spec.dnsStatus) {
    push("dns", {
      agentTaskId: taskFor("DOMAIN_ENUMERATION"),
      kind: "OBSERVED_FACT",
      title: `DNS resolution returned ${spec.dnsStatus}`,
      description:
        spec.dnsStatus === "RESOLVED"
          ? `A resolution attempt returned ${spec.resolvedIpCount ?? 1} address record(s).`
          : `A resolution attempt returned ${spec.dnsStatus}. This is the result of one check at one moment, not a permanent property of the name.`,
      sourceUrl: null,
      sourceLabel: "Simulated resolver",
      collectedAt: iso(lastSeen),
      collectionMethod: "DNS_LOOKUP",
      confidence: null,
      limitations: simulationCaveat,
      origin: ORIGIN,
      rawReference: { dnsStatus: spec.dnsStatus, simulated: true },
      createdById: null,
    });
  }

  if (spec.httpStatusCode !== undefined) {
    push("http", {
      agentTaskId: taskFor("WEBSITE_INSPECTION"),
      kind: "OBSERVED_FACT",
      title: `HTTP response ${spec.httpStatusCode}`,
      description:
        `A request to the public root path returned status ${spec.httpStatusCode}. ` +
        "A status code records what a server said; it is not an assessment of the site.",
      sourceUrl: `https://${domain.fqdn}/`,
      sourceLabel: "Public root path",
      collectedAt: iso(lastSeen),
      collectionMethod: "HTTP_RESPONSE",
      confidence: null,
      limitations: simulationCaveat,
      origin: ORIGIN,
      rawReference: { httpStatusCode: spec.httpStatusCode, simulated: true },
      createdById: null,
    });
  }

  if (spec.redirectsToUrl) {
    push("redirect", {
      agentTaskId: taskFor("WEBSITE_INSPECTION"),
      kind: "OBSERVED_FACT",
      title: `Redirect observed to ${spec.redirectsToUrl}`,
      description: `The request was redirected to ${spec.redirectsToUrl}.`,
      sourceUrl: `https://${domain.fqdn}/`,
      sourceLabel: "Public root path",
      collectedAt: iso(lastSeen),
      collectionMethod: "HTTP_RESPONSE",
      confidence: null,
      limitations:
        simulationCaveat +
        " A redirect shows where one request was sent at one moment and does not establish common ownership or control.",
      origin: ORIGIN,
      rawReference: { redirectsToUrl: spec.redirectsToUrl, simulated: true },
      createdById: null,
    });
  }

  if (spec.siteTitle) {
    push("content", {
      agentTaskId: taskFor("WEBSITE_INSPECTION"),
      kind: "OBSERVED_FACT",
      title: "Public page metadata collected",
      description:
        `Page title: "${spec.siteTitle}".` +
        (spec.siteDescription ? ` Description: "${spec.siteDescription}".` : "") +
        (spec.technologies?.length
          ? ` Fingerprinted technologies: ${spec.technologies.join(", ")}.`
          : ""),
      sourceUrl: `https://${domain.fqdn}/`,
      sourceLabel: "Public page metadata",
      collectedAt: iso(lastSeen),
      collectionMethod: "HTTP_RESPONSE",
      confidence: null,
      limitations:
        simulationCaveat +
        " Page content can change at any time; this records one point-in-time observation.",
      origin: ORIGIN,
      rawReference: { title: spec.siteTitle, simulated: true },
      createdById: null,
    });
  }

  if (spec.certFingerprint) {
    push("certificate", {
      agentTaskId: taskFor("WEBSITE_INSPECTION"),
      kind: "OBSERVED_FACT",
      title: "TLS certificate characteristics recorded",
      description:
        `Issuer: ${spec.certIssuer}. Subject common name: ${spec.certCommonName}. ` +
        `SHA-256 fingerprint: ${spec.certFingerprint}.`,
      sourceUrl: `https://${domain.fqdn}/`,
      sourceLabel: "Served TLS certificate",
      collectedAt: iso(lastSeen),
      collectionMethod: "TLS_CERTIFICATE",
      confidence: null,
      limitations:
        simulationCaveat +
        " Certificates are routinely shared across unrelated sites by hosting providers and CDNs. A shared certificate is not evidence of shared ownership.",
      origin: ORIGIN,
      rawReference: { fingerprint: spec.certFingerprint, simulated: true },
      createdById: null,
    });
  }

  if (spec.sources.includes("search-index")) {
    push("search", {
      agentTaskId: taskFor("WEB_DISCOVERY"),
      kind: "UNVERIFIED_CLAIM",
      title: "Appeared in simulated search results",
      description:
        "This hostname appeared in results returned by the simulated search provider for the " +
        "investigation's brand queries. Appearing in a search result is a discovery signal and " +
        "says nothing about the site's content, operator or lawfulness.",
      sourceUrl: null,
      sourceLabel: "Simulated search provider",
      collectedAt: iso(context.firstSeen),
      collectionMethod: "SEARCH_PROVIDER",
      confidence: 35,
      limitations:
        simulationCaveat + " The underlying page text has not been independently verified.",
      origin: ORIGIN,
      rawReference: { simulated: true },
      createdById: null,
    });
  }

  if (spec.sources.includes("cert-transparency")) {
    push("ct", {
      agentTaskId: taskFor("DOMAIN_ENUMERATION"),
      kind: "OBSERVED_FACT",
      title: "Name present in a simulated certificate-transparency entry",
      description:
        "A simulated certificate-transparency entry covers this name. A CT entry records that a " +
        "certificate was issued; it does not show that a website is running, nor who requested it.",
      sourceUrl: null,
      sourceLabel: "Simulated CT log",
      collectedAt: iso(context.firstSeen),
      collectionMethod: "CERTIFICATE_TRANSPARENCY_LOG",
      confidence: null,
      limitations: simulationCaveat,
      origin: ORIGIN,
      rawReference: { simulated: true },
      createdById: null,
    });
  }

  if (spec.contentSimilarity !== undefined || spec.brandSimilarity !== undefined) {
    push("similarity", {
      agentTaskId: taskFor("RELATIONSHIP_ANALYSIS"),
      kind: "INFERRED_RELATIONSHIP",
      title: "Similarity signals computed",
      description:
        (spec.brandSimilarity !== undefined
          ? `Brand-label similarity: ${spec.brandSimilarity}/100. `
          : "") +
        (spec.contentSimilarity !== undefined
          ? `Page-structure similarity: ${spec.contentSimilarity}/100. `
          : "") +
        (spec.similarityRationale ?? ""),
      sourceUrl: null,
      sourceLabel: "Correlation analysis",
      collectedAt: iso(lastSeen),
      collectionMethod: "CORRELATION_ANALYSIS",
      confidence: Math.max(spec.brandSimilarity ?? 0, spec.contentSimilarity ?? 0),
      limitations:
        "Similarity scores are lexical and structural measurements. They are investigative " +
        "signals for triage ordering and are NOT findings of impersonation, infringement, " +
        "affiliation or illegality.",
      origin: ORIGIN,
      rawReference: {
        brandSimilarity: spec.brandSimilarity ?? null,
        contentSimilarity: spec.contentSimilarity ?? null,
        simulated: true,
      },
      createdById: null,
    });
  }

  if (spec.reviewerNotes) {
    push("review", {
      agentTaskId: null,
      kind: "REVIEWER_ASSESSMENT",
      title: "Reviewer assessment recorded",
      description: spec.reviewerNotes,
      sourceUrl: null,
      sourceLabel: "Human review",
      collectedAt: iso(addHours(lastSeen, 3)),
      collectionMethod: "HUMAN_REVIEW",
      confidence: null,
      limitations:
        "A reviewer's judgement about simulated evidence. It is a professional assessment, not " +
        "a legal determination.",
      origin: ORIGIN,
      rawReference: null,
      createdById: reviewerUserId,
    });
  }
}
