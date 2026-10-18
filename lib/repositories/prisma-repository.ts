import "server-only";
import { PrismaClient } from "@prisma/client";

import { computeEvidenceCompleteness } from "@/lib/utils/evidence";
import { normalizeDomain } from "@/lib/utils/domain-name";
import type { AuditEntityType } from "@/lib/types/enums";
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

import {
  buildIndex,
  composeRelationship,
  computeOverviewMetrics,
  emptyDataset,
  getDomainDetail as selectDomainDetail,
  getRegulatorySourceDetail as selectRegulatorySourceDetail,
  getReportDetail as selectReportDetail,
  getRelationshipGraph as selectRelationshipGraph,
  getScanDetail as selectScanDetail,
  listRegulatorySources as selectRegulatorySources,
  queryAllDomains,
  queryAuditEvents,
  queryDomains,
  queryRelationships,
  queryReports,
  queryScans,
  type Dataset,
} from "./dataset";
import {
  RecordNotFoundError,
  type AppendAuditEventInput,
  type ApplyReportTransitionInput,
  type CreateAgentTaskInput,
  type CreateEvidenceInput,
  type CreateRegulatoryMatchInput,
  type CreateRegulatorySourceCheckInput,
  type CreateRegulatorySourceInput,
  type CreateReportInput,
  type CreateScanInput,
  type CreateUserInput,
  type SentinelRepository,
  type UpdateAgentTaskInput,
  type UpdateDomainReviewInput,
  type UpdateRegulatorySourceInput,
  type UpdateReportContentInput,
  type UpdateScanInput,
  type UpsertDomainInput,
  type UpsertDomainResult,
  type UpsertPlatformInput,
  type UpsertRelationshipInput,
} from "./types";

/**
 * PostgreSQL adapter.
 *
 * Active only when DATABASE_URL is set AND SENTINEL_MODE=live. Writes go
 * straight to Postgres as real SQL.
 *
 * Reads take a deliberate shortcut, and it is worth being explicit about it:
 * rather than reimplementing every filter, sort, pagination rule and metric
 * aggregation in Prisma query syntax, this adapter loads a working-set
 * snapshot and hands it to the SAME pure functions in dataset.ts that the
 * file adapter uses. The benefit is that both adapters answer every question
 * identically — there is exactly one definition of "awaiting review" or
 * "confirmed official action" in the codebase, so the two cannot drift.
 *
 * The cost is that a read transfers more rows than a pushed-down query would.
 * For the dataset sizes this product deals with (thousands of domains, tens of
 * thousands of evidence rows) that is a comfortable trade. Pushing the hot
 * filters down into SQL is the documented next optimisation — see
 * docs/database.md. Queries are bounded by SNAPSHOT_LIMITS so a large database
 * degrades predictably rather than exhausting memory.
 */

const SNAPSHOT_LIMITS = {
  domains: 20_000,
  evidence: 100_000,
  auditEvents: 50_000,
  relationships: 50_000,
  scans: 10_000,
  agentTasks: 60_000,
} as const;

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function isoRequired(value: Date): string {
  return value.toISOString();
}

function toJson(value: unknown): JsonValue | null {
  if (value === null || value === undefined) return null;
  return value as JsonValue;
}

export class PrismaRepository implements SentinelRepository {
  readonly kind = "prisma" as const;

  constructor(private readonly prisma: PrismaClient) {}

  async initialize(): Promise<void> {
    // Fails fast with a clear message rather than at the first page render.
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      throw new Error(
        "Could not connect to the configured PostgreSQL database. Check DATABASE_URL and that " +
          "migrations have been applied (`npm run db:migrate:deploy`). " +
          `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async resetToSeed(): Promise<void> {
    throw new Error(
      "Resetting is not supported against a live database. Use `npm run db:migrate` and " +
        "`npm run db:seed` deliberately instead.",
    );
  }

  // --- snapshot -----------------------------------------------------------

  /**
   * Loads a bounded snapshot of the database into the shared Dataset shape.
   *
   * `scope` narrows the load where a caller only needs part of the model, so a
   * domain-list request does not pull the entire report and audit history.
   */
  private async snapshot(
    scope: "full" | "domains" | "scans" | "reports" | "regulatory" | "audit" = "full",
  ): Promise<Dataset> {
    const data = emptyDataset();

    const needsDomains = scope !== "audit";
    const needsScans = scope === "full" || scope === "scans" || scope === "domains";
    const needsReports = scope === "full" || scope === "reports";
    const needsRegulatory = scope === "full" || scope === "regulatory" || scope === "domains";
    const needsAudit = scope === "full" || scope === "audit";

    const [users, platforms, discoverySources] = await Promise.all([
      this.prisma.user.findMany(),
      this.prisma.platform.findMany(),
      this.prisma.discoverySource.findMany(),
    ]);

    data.users = users.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      passwordHash: row.passwordHash,
      jobTitle: row.jobTitle,
      isActive: row.isActive,
      isDemoUser: row.isDemoUser,
      lastLoginAt: iso(row.lastLoginAt),
      createdAt: isoRequired(row.createdAt),
      updatedAt: isoRequired(row.updatedAt),
    }));

    data.platforms = platforms.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      aliases: row.aliases,
      investigationId: row.investigationId,
      description: row.description,
      origin: row.origin,
      createdAt: isoRequired(row.createdAt),
      updatedAt: isoRequired(row.updatedAt),
    }));

    data.discoverySources = discoverySources.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      kind: row.kind,
      description: row.description,
      isEnabled: row.isEnabled,
      createdAt: isoRequired(row.createdAt),
      updatedAt: isoRequired(row.updatedAt),
    }));

    if (needsDomains) {
      const [domains, domainPlatforms, domainSources, evidence, relationships] =
        await Promise.all([
          this.prisma.domain.findMany({
            take: SNAPSHOT_LIMITS.domains,
            orderBy: { firstSeenAt: "desc" },
          }),
          this.prisma.domainPlatform.findMany(),
          this.prisma.domainDiscoverySource.findMany(),
          this.prisma.evidence.findMany({
            take: SNAPSHOT_LIMITS.evidence,
            orderBy: { collectedAt: "desc" },
          }),
          this.prisma.domainRelationship.findMany({ take: SNAPSHOT_LIMITS.relationships }),
        ]);

      data.domains = domains.map(mapDomain);
      data.domainPlatforms = domainPlatforms.map((row) => ({
        domainId: row.domainId,
        platformId: row.platformId,
        rationale: row.rationale,
        confidence: row.confidence,
        origin: row.origin,
        createdAt: isoRequired(row.createdAt),
      }));
      data.domainDiscoverySources = domainSources.map((row) => ({
        domainId: row.domainId,
        discoverySourceId: row.discoverySourceId,
        firstSeenAt: isoRequired(row.firstSeenAt),
        lastSeenAt: isoRequired(row.lastSeenAt),
        detail: row.detail,
        origin: row.origin,
      }));
      data.evidence = evidence.map(mapEvidence);
      data.relationships = relationships.map((row) => ({
        id: row.id,
        sourceDomainId: row.sourceDomainId,
        targetDomainId: row.targetDomainId,
        type: row.type,
        confidence: row.confidence,
        rationale: row.rationale,
        limitations: row.limitations,
        relationSource: row.relationSource,
        firstObservedAt: isoRequired(row.firstObservedAt),
        lastObservedAt: isoRequired(row.lastObservedAt),
        reviewerConfirmed: row.reviewerConfirmed,
        reviewerConfirmedAt: iso(row.reviewerConfirmedAt),
        origin: row.origin,
        evidenceId: row.evidenceId,
        createdAt: isoRequired(row.createdAt),
        updatedAt: isoRequired(row.updatedAt),
      }));
    }

    if (needsScans) {
      const [scans, agentTasks] = await Promise.all([
        this.prisma.scan.findMany({ take: SNAPSHOT_LIMITS.scans, orderBy: { queuedAt: "desc" } }),
        this.prisma.agentTask.findMany({ take: SNAPSHOT_LIMITS.agentTasks }),
      ]);
      data.scans = scans.map(mapScan);
      data.agentTasks = agentTasks.map(mapAgentTask);
    }

    if (needsRegulatory) {
      const [sources, checks, matches] = await Promise.all([
        this.prisma.regulatorySource.findMany(),
        this.prisma.regulatorySourceCheck.findMany({ orderBy: { startedAt: "desc" } }),
        this.prisma.regulatoryMatch.findMany(),
      ]);
      data.regulatorySources = sources.map(mapRegulatorySource);
      data.regulatorySourceChecks = checks.map(mapRegulatorySourceCheck);
      data.regulatoryMatches = matches.map(mapRegulatoryMatch);
    }

    if (needsReports) {
      const [reports, reportDomains, reportEvidence] = await Promise.all([
        this.prisma.report.findMany({ orderBy: { createdAt: "desc" } }),
        this.prisma.reportDomain.findMany(),
        this.prisma.reportEvidence.findMany(),
      ]);
      data.reports = reports.map(mapReport);
      data.reportDomains = reportDomains.map((row) => ({
        reportId: row.reportId,
        domainId: row.domainId,
        includedRationale: row.includedRationale,
        orderIndex: row.orderIndex,
      }));
      data.reportEvidence = reportEvidence.map((row) => ({
        reportId: row.reportId,
        evidenceId: row.evidenceId,
        orderIndex: row.orderIndex,
      }));
    }

    if (needsAudit) {
      const auditEvents = await this.prisma.auditEvent.findMany({
        take: SNAPSHOT_LIMITS.auditEvents,
        orderBy: { occurredAt: "desc" },
      });
      data.auditEvents = auditEvents.map(mapAuditEvent);
    }

    const settings = await this.prisma.applicationSetting.findMany();
    data.settings = settings.map(mapSetting);

    return data;
  }

  // --- users --------------------------------------------------------------

  async listUsers(): Promise<User[]> {
    const rows = await this.prisma.user.findMany({ orderBy: { name: "asc" } });
    return rows.map(({ passwordHash: _hash, ...row }) => ({
      ...row,
      lastLoginAt: iso(row.lastLoginAt),
      createdAt: isoRequired(row.createdAt),
      updatedAt: isoRequired(row.updatedAt),
    }));
  }

  async getUserById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    if (!row) return null;
    const { passwordHash: _hash, ...rest } = row;
    return {
      ...rest,
      lastLoginAt: iso(row.lastLoginAt),
      createdAt: isoRequired(row.createdAt),
      updatedAt: isoRequired(row.updatedAt),
    };
  }

  async findUserWithSecretByEmail(email: string): Promise<UserWithSecret | null> {
    const row = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!row) return null;
    return {
      ...row,
      lastLoginAt: iso(row.lastLoginAt),
      createdAt: isoRequired(row.createdAt),
      updatedAt: isoRequired(row.updatedAt),
    };
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        name: input.name,
        role: input.role,
        passwordHash: input.passwordHash,
        jobTitle: input.jobTitle ?? null,
        isDemoUser: input.isDemoUser ?? false,
      },
    });
    const { passwordHash: _hash, ...rest } = row;
    return {
      ...rest,
      lastLoginAt: iso(row.lastLoginAt),
      createdAt: isoRequired(row.createdAt),
      updatedAt: isoRequired(row.updatedAt),
    };
  }

  async recordUserLogin(id: string, at: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { lastLoginAt: new Date(at) } });
  }

  // --- platforms and discovery sources ------------------------------------

  async listPlatforms(): Promise<Platform[]> {
    const rows = await this.prisma.platform.findMany({ orderBy: { name: "asc" } });
    return rows.map((row) => ({
      ...row,
      createdAt: isoRequired(row.createdAt),
      updatedAt: isoRequired(row.updatedAt),
    }));
  }

  async getPlatformById(id: string): Promise<Platform | null> {
    const row = await this.prisma.platform.findUnique({ where: { id } });
    return row
      ? { ...row, createdAt: isoRequired(row.createdAt), updatedAt: isoRequired(row.updatedAt) }
      : null;
  }

  async findPlatformByName(name: string): Promise<Platform | null> {
    const needle = name.trim();
    const row = await this.prisma.platform.findFirst({
      where: {
        OR: [
          { name: { equals: needle, mode: "insensitive" } },
          { slug: slugify(needle) },
          { aliases: { has: needle } },
        ],
      },
    });
    return row
      ? { ...row, createdAt: isoRequired(row.createdAt), updatedAt: isoRequired(row.updatedAt) }
      : null;
  }

  async upsertPlatform(input: UpsertPlatformInput): Promise<Platform> {
    const slug = input.slug ?? slugify(input.name);
    const row = await this.prisma.platform.upsert({
      where: { slug },
      create: {
        name: input.name,
        slug,
        aliases: input.aliases ?? [],
        investigationId: input.investigationId ?? null,
        description: input.description ?? null,
        origin: input.origin,
      },
      update: {
        aliases: input.aliases ?? undefined,
        description: input.description ?? undefined,
        investigationId: input.investigationId ?? undefined,
      },
    });
    return { ...row, createdAt: isoRequired(row.createdAt), updatedAt: isoRequired(row.updatedAt) };
  }

  async listDiscoverySources(): Promise<DiscoverySource[]> {
    const rows = await this.prisma.discoverySource.findMany({ orderBy: { name: "asc" } });
    return rows.map((row) => ({
      ...row,
      createdAt: isoRequired(row.createdAt),
      updatedAt: isoRequired(row.updatedAt),
    }));
  }

  // --- scans --------------------------------------------------------------

  async createScan(input: CreateScanInput): Promise<Scan> {
    const row = await this.prisma.scan.create({
      data: {
        reference: input.reference,
        platformId: input.platformId,
        platformNameInput: input.platformNameInput,
        seedDomain: input.seedDomain,
        notes: input.notes,
        profile: input.profile,
        scopes: input.scopes,
        maxCandidates: input.maxCandidates,
        initiatedById: input.initiatedById,
        origin: input.origin,
      },
    });
    return mapScan(row);
  }

  async getScanById(id: string): Promise<Scan | null> {
    const row = await this.prisma.scan.findUnique({ where: { id } });
    return row ? mapScan(row) : null;
  }

  async getScanDetail(id: string): Promise<ScanDetail | null> {
    return selectScanDetail(await this.snapshot("full"), id);
  }

  async updateScan(id: string, input: UpdateScanInput): Promise<Scan> {
    const row = await this.prisma.scan.update({
      where: { id },
      data: {
        status: input.status,
        platformId: input.platformId,
        startedAt: toDate(input.startedAt),
        completedAt: toDate(input.completedAt),
        cancelledAt: toDate(input.cancelledAt),
        durationMs: input.durationMs,
        candidatesFound: input.candidatesFound,
        candidatesRequiringReview: input.candidatesRequiringReview,
        warningCount: input.warningCount,
        errorMessage: input.errorMessage,
      },
    });
    return mapScan(row);
  }

  async listScans(query: ScanQuery): Promise<Paginated<ScanListItem>> {
    return queryScans(await this.snapshot("scans"), query);
  }

  async countActiveScans(): Promise<number> {
    return this.prisma.scan.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } });
  }

  // --- agent tasks --------------------------------------------------------

  async createAgentTask(input: CreateAgentTaskInput): Promise<AgentTask> {
    const row = await this.prisma.agentTask.create({
      data: {
        scanId: input.scanId,
        agentKey: input.agentKey,
        sequence: input.sequence,
        title: input.title,
        maxAttempts: input.maxAttempts,
        inputSummary: input.inputSummary,
      },
    });
    return mapAgentTask(row);
  }

  async getAgentTaskById(id: string): Promise<AgentTask | null> {
    const row = await this.prisma.agentTask.findUnique({ where: { id } });
    return row ? mapAgentTask(row) : null;
  }

  async updateAgentTask(id: string, input: UpdateAgentTaskInput): Promise<AgentTask> {
    const row = await this.prisma.agentTask.update({
      where: { id },
      data: {
        status: input.status,
        attempt: input.attempt,
        startedAt: toDate(input.startedAt),
        completedAt: toDate(input.completedAt),
        durationMs: input.durationMs,
        outputSummary: input.outputSummary,
        metrics: input.metrics ?? undefined,
        errorMessage: input.errorMessage,
        hasWarnings: input.hasWarnings,
      },
    });
    return mapAgentTask(row);
  }

  async listAgentTasksForScan(scanId: string): Promise<AgentTask[]> {
    const rows = await this.prisma.agentTask.findMany({
      where: { scanId },
      orderBy: { sequence: "asc" },
    });
    return rows.map(mapAgentTask);
  }

  // --- domains ------------------------------------------------------------

  async upsertDomain(input: UpsertDomainInput): Promise<UpsertDomainResult> {
    const parsed = normalizeDomain(input.fqdn);
    const existing = await this.prisma.domain.findUnique({ where: { fqdn: parsed.fqdn } });

    const hasObservation =
      input.dnsStatus != null ||
      input.httpStatusCode != null ||
      input.siteTitle != null ||
      input.certFingerprintSha256 != null ||
      input.redirectsToUrl != null;

    // `undefined` means "not supplied" and must leave the stored value alone.
    const technical = {
      dnsStatus: input.dnsStatus ?? undefined,
      dnsCheckedAt: input.dnsStatus ? new Date(input.observedAt) : undefined,
      resolvedIpCount: input.resolvedIpCount ?? undefined,
      httpStatusCode: input.httpStatusCode ?? undefined,
      httpCheckedAt: input.httpStatusCode != null ? new Date(input.observedAt) : undefined,
      redirectsToUrl: input.redirectsToUrl ?? undefined,
      redirectObservedAt: input.redirectsToUrl ? new Date(input.observedAt) : undefined,
      certIssuer: input.certIssuer ?? undefined,
      certSubjectCommonName: input.certSubjectCommonName ?? undefined,
      certNotBefore: toDate(input.certNotBefore) ?? undefined,
      certNotAfter: toDate(input.certNotAfter) ?? undefined,
      certFingerprintSha256: input.certFingerprintSha256 ?? undefined,
      certObservedAt: input.certFingerprintSha256 ? new Date(input.observedAt) : undefined,
      siteTitle: input.siteTitle ?? undefined,
      siteDescription: input.siteDescription ?? undefined,
      siteLanguage: input.siteLanguage ?? undefined,
      brandSimilarityScore: input.brandSimilarityScore ?? undefined,
      contentSimilarityScore: input.contentSimilarityScore ?? undefined,
      similarityRationale: input.similarityRationale ?? undefined,
    };

    const row = existing
      ? await this.prisma.domain.update({
          where: { id: existing.id },
          data: {
            ...technical,
            lastSeenAt:
              new Date(input.observedAt) > existing.lastSeenAt
                ? new Date(input.observedAt)
                : undefined,
            lastCheckedAt: hasObservation ? new Date(input.observedAt) : undefined,
            observedAt: hasObservation ? new Date(input.observedAt) : undefined,
            associatedNames: input.associatedNames?.length
              ? { set: [...new Set([...existing.associatedNames, ...input.associatedNames])] }
              : undefined,
            detectedTechnologies: input.detectedTechnologies?.length
              ? {
                  set: [
                    ...new Set([...existing.detectedTechnologies, ...input.detectedTechnologies]),
                  ],
                }
              : undefined,
            seedPlatformId:
              existing.seedPlatformId === null ? (input.seedPlatformId ?? undefined) : undefined,
            priority:
              existing.priority === "UNTRIAGED" ? (input.priority ?? undefined) : undefined,
            origin: input.origin === "LIVE_COLLECTED" ? "LIVE_COLLECTED" : undefined,
          },
        })
      : await this.prisma.domain.create({
          data: {
            fqdn: parsed.fqdn,
            normalizedDomain: parsed.normalizedDomain,
            registrableDomain: parsed.registrableDomain,
            suffix: parsed.suffix,
            seedPlatformId: input.seedPlatformId ?? null,
            associatedNames: input.associatedNames ?? [],
            detectedTechnologies: input.detectedTechnologies ?? [],
            firstSeenAt: new Date(input.observedAt),
            lastSeenAt: new Date(input.observedAt),
            lastCheckedAt: hasObservation ? new Date(input.observedAt) : null,
            observedAt: hasObservation ? new Date(input.observedAt) : null,
            priority: input.priority ?? "UNTRIAGED",
            origin: input.origin,
            discoveredByScanId: input.discoveredByScanId ?? null,
            ...technical,
          },
        });

    for (const source of input.discoverySources ?? []) {
      const discoverySource = await this.prisma.discoverySource.findUnique({
        where: { key: source.sourceKey },
      });
      if (!discoverySource) continue;
      await this.prisma.domainDiscoverySource.upsert({
        where: {
          domainId_discoverySourceId: {
            domainId: row.id,
            discoverySourceId: discoverySource.id,
          },
        },
        create: {
          domainId: row.id,
          discoverySourceId: discoverySource.id,
          firstSeenAt: new Date(source.observedAt),
          lastSeenAt: new Date(source.observedAt),
          detail: source.detail ?? null,
          origin: input.origin,
        },
        update: {
          lastSeenAt: new Date(source.observedAt),
          detail: source.detail ?? undefined,
        },
      });
    }

    const refreshed = await this.recomputeDomainEvidenceCompleteness(row.id);
    return { domain: refreshed, created: !existing };
  }

  async getDomainById(id: string): Promise<Domain | null> {
    const row = await this.prisma.domain.findUnique({ where: { id } });
    return row ? mapDomain(row) : null;
  }

  async getDomainByFqdn(fqdn: string): Promise<Domain | null> {
    const row = await this.prisma.domain.findUnique({
      where: { fqdn: fqdn.trim().toLowerCase() },
    });
    return row ? mapDomain(row) : null;
  }

  async getDomainDetail(idOrFqdn: string): Promise<DomainDetail | null> {
    return selectDomainDetail(await this.snapshot("full"), idOrFqdn);
  }

  async listDomains(query: DomainQuery): Promise<Paginated<DomainListItem>> {
    return queryDomains(await this.snapshot("domains"), query);
  }

  async listAllDomainsForExport(query: DomainQuery, limit: number): Promise<DomainListItem[]> {
    return queryAllDomains(await this.snapshot("domains"), query, limit);
  }

  async updateDomainReview(id: string, input: UpdateDomainReviewInput): Promise<Domain> {
    await this.prisma.domain.update({
      where: { id },
      data: {
        reviewStatus: input.reviewStatus,
        priority: input.priority,
        assignedReviewerId: input.assignedReviewerId,
        reviewerNotes: input.reviewerNotes,
        reviewedAt: toDate(input.reviewedAt),
      },
    });
    return this.recomputeDomainEvidenceCompleteness(id);
  }

  async recomputeDomainEvidenceCompleteness(id: string): Promise<Domain> {
    const row = await this.prisma.domain.findUnique({
      where: { id },
      include: {
        evidence: { select: { kind: true, sourceUrl: true } },
        regulatoryMatches: { select: { id: true } },
        outgoingRelationships: { select: { id: true } },
        incomingRelationships: { select: { id: true } },
      },
    });
    if (!row) throw new RecordNotFoundError("Domain", id);

    const percent = computeEvidenceCompleteness(
      {
        dnsStatus: row.dnsStatus,
        httpStatusCode: row.httpStatusCode,
        siteTitle: row.siteTitle,
        certFingerprintSha256: row.certFingerprintSha256,
        reviewerNotes: row.reviewerNotes,
        redirectsToUrl: row.redirectsToUrl,
      },
      row.evidence,
      {
        regulatoryMatchCount: row.regulatoryMatches.length,
        relationshipCount: row.outgoingRelationships.length + row.incomingRelationships.length,
      },
    ).percent;

    const updated = await this.prisma.domain.update({
      where: { id },
      data: { evidenceCompleteness: percent },
    });
    return mapDomain(updated);
  }

  async listDomainSuffixes(): Promise<Array<{ suffix: string; count: number }>> {
    const grouped = await this.prisma.domain.groupBy({
      by: ["suffix"],
      _count: { suffix: true },
      orderBy: { _count: { suffix: "desc" } },
    });
    return grouped.map((row) => ({ suffix: row.suffix, count: row._count.suffix }));
  }

  // --- evidence -----------------------------------------------------------

  async createEvidence(input: CreateEvidenceInput): Promise<Evidence> {
    const row = await this.prisma.evidence.create({
      data: {
        domainId: input.domainId ?? null,
        scanId: input.scanId ?? null,
        agentTaskId: input.agentTaskId ?? null,
        kind: input.kind,
        title: input.title,
        description: input.description,
        sourceUrl: input.sourceUrl ?? null,
        sourceLabel: input.sourceLabel ?? null,
        collectedAt: new Date(input.collectedAt),
        collectionMethod: input.collectionMethod,
        confidence: input.confidence ?? null,
        limitations: input.limitations ?? null,
        origin: input.origin,
        rawReference: (input.rawReference ?? undefined) as never,
        createdById: input.createdById ?? null,
      },
    });
    if (input.domainId) await this.recomputeDomainEvidenceCompleteness(input.domainId);
    return mapEvidence(row);
  }

  async listEvidenceForDomain(domainId: string): Promise<Evidence[]> {
    const rows = await this.prisma.evidence.findMany({
      where: { domainId },
      orderBy: { collectedAt: "desc" },
    });
    return rows.map(mapEvidence);
  }

  async listEvidenceForScan(scanId: string): Promise<Evidence[]> {
    const rows = await this.prisma.evidence.findMany({
      where: { scanId },
      orderBy: { collectedAt: "desc" },
    });
    return rows.map(mapEvidence);
  }

  async getEvidenceByIds(ids: string[]): Promise<Evidence[]> {
    const rows = await this.prisma.evidence.findMany({ where: { id: { in: ids } } });
    return rows.map(mapEvidence);
  }

  // --- relationships ------------------------------------------------------

  async upsertRelationship(input: UpsertRelationshipInput): Promise<RelationshipWithEndpoints> {
    if (input.sourceDomainId === input.targetDomainId) {
      throw new Error("A domain cannot have a relationship with itself.");
    }

    await this.prisma.domainRelationship.upsert({
      where: {
        sourceDomainId_targetDomainId_type: {
          sourceDomainId: input.sourceDomainId,
          targetDomainId: input.targetDomainId,
          type: input.type,
        },
      },
      create: {
        sourceDomainId: input.sourceDomainId,
        targetDomainId: input.targetDomainId,
        type: input.type,
        confidence: input.confidence,
        rationale: input.rationale,
        limitations: input.limitations,
        relationSource: input.relationSource,
        firstObservedAt: new Date(input.observedAt),
        lastObservedAt: new Date(input.observedAt),
        origin: input.origin,
        evidenceId: input.evidenceId ?? null,
      },
      update: {
        confidence: input.confidence,
        rationale: input.rationale,
        limitations: input.limitations,
        relationSource: input.relationSource,
        lastObservedAt: new Date(input.observedAt),
        evidenceId: input.evidenceId ?? undefined,
        origin: input.origin === "LIVE_COLLECTED" ? "LIVE_COLLECTED" : undefined,
      },
    });

    const data = await this.snapshot("domains");
    const relationship = data.relationships.find(
      (candidate) =>
        candidate.sourceDomainId === input.sourceDomainId &&
        candidate.targetDomainId === input.targetDomainId &&
        candidate.type === input.type,
    );
    if (!relationship) throw new RecordNotFoundError("DomainRelationship", input.type);
    const composed = composeRelationship(relationship, buildIndex(data));
    if (!composed) throw new RecordNotFoundError("DomainRelationship", relationship.id);
    return composed;
  }

  async listRelationships(query: RelationshipQuery): Promise<RelationshipWithEndpoints[]> {
    return queryRelationships(await this.snapshot("domains"), query);
  }

  async getRelationshipGraph(query: RelationshipQuery): Promise<RelationshipGraph> {
    return selectRelationshipGraph(await this.snapshot("domains"), query);
  }

  async confirmRelationship(id: string, at: string): Promise<RelationshipWithEndpoints> {
    await this.prisma.domainRelationship.update({
      where: { id },
      data: { reviewerConfirmed: true, reviewerConfirmedAt: new Date(at) },
    });
    const data = await this.snapshot("domains");
    const relationship = data.relationships.find((candidate) => candidate.id === id);
    if (!relationship) throw new RecordNotFoundError("DomainRelationship", id);
    const composed = composeRelationship(relationship, buildIndex(data));
    if (!composed) throw new RecordNotFoundError("DomainRelationship", id);
    return composed;
  }

  // --- regulatory sources -------------------------------------------------

  async listRegulatorySources(): Promise<RegulatorySourceListItem[]> {
    return selectRegulatorySources(await this.snapshot("regulatory"), Date.now());
  }

  async getRegulatorySourceDetail(id: string): Promise<RegulatorySourceDetail | null> {
    return selectRegulatorySourceDetail(await this.snapshot("full"), id, Date.now());
  }

  async getRegulatorySourceById(id: string): Promise<RegulatorySource | null> {
    const row = await this.prisma.regulatorySource.findUnique({ where: { id } });
    return row ? mapRegulatorySource(row) : null;
  }

  async createRegulatorySource(input: CreateRegulatorySourceInput): Promise<RegulatorySource> {
    const row = await this.prisma.regulatorySource.create({
      data: {
        authorityName: input.authorityName,
        authorityShortName: input.authorityShortName,
        title: input.title,
        sourceUrl: input.sourceUrl,
        sourceType: input.sourceType,
        description: input.description ?? null,
        isEnabled: input.isEnabled,
        checkIntervalHours: input.checkIntervalHours,
        verificationNotes: input.verificationNotes ?? null,
        origin: input.origin,
      },
    });
    return mapRegulatorySource(row);
  }

  async updateRegulatorySource(
    id: string,
    input: UpdateRegulatorySourceInput,
  ): Promise<RegulatorySource> {
    const row = await this.prisma.regulatorySource.update({
      where: { id },
      data: {
        authorityName: input.authorityName,
        authorityShortName: input.authorityShortName,
        title: input.title,
        sourceUrl: input.sourceUrl,
        sourceType: input.sourceType,
        description: input.description,
        isEnabled: input.isEnabled,
        checkIntervalHours: input.checkIntervalHours,
        verificationNotes: input.verificationNotes,
        retrievalStatus: input.retrievalStatus,
        retrievalError: input.retrievalError,
        lastCheckAttemptAt: toDate(input.lastCheckAttemptAt),
        lastSuccessfulCheckAt: toDate(input.lastSuccessfulCheckAt),
        lastModifiedReported: toDate(input.lastModifiedReported),
        matchedEntityCount: input.matchedEntityCount,
      },
    });
    return mapRegulatorySource(row);
  }

  async createRegulatorySourceCheck(
    input: CreateRegulatorySourceCheckInput,
  ): Promise<RegulatorySourceCheck> {
    const row = await this.prisma.regulatorySourceCheck.create({
      data: {
        regulatorySourceId: input.regulatorySourceId,
        startedAt: new Date(input.startedAt),
        completedAt: toDate(input.completedAt),
        status: input.status,
        httpStatusCode: input.httpStatusCode ?? null,
        bytesRetrieved: input.bytesRetrieved ?? null,
        matchedEntityCount: input.matchedEntityCount,
        errorMessage: input.errorMessage ?? null,
        note: input.note ?? null,
        origin: input.origin,
        triggeredById: input.triggeredById ?? null,
      },
    });
    return mapRegulatorySourceCheck(row);
  }

  async createRegulatoryMatch(input: CreateRegulatoryMatchInput): Promise<RegulatoryMatch> {
    const row = await this.prisma.regulatoryMatch.create({
      data: {
        regulatorySourceId: input.regulatorySourceId,
        regulatorySourceCheckId: input.regulatorySourceCheckId ?? null,
        domainId: input.domainId ?? null,
        matchedTerm: input.matchedTerm,
        matchedContext: input.matchedContext,
        matchType: input.matchType,
        confidence: input.confidence,
        sourceUrl: input.sourceUrl,
        sourceRetrievedAt: new Date(input.sourceRetrievedAt),
        notes: input.notes ?? null,
        origin: input.origin,
      },
    });

    const count = await this.prisma.regulatoryMatch.count({
      where: { regulatorySourceId: input.regulatorySourceId },
    });
    await this.prisma.regulatorySource.update({
      where: { id: input.regulatorySourceId },
      data: { matchedEntityCount: count },
    });
    if (input.domainId) await this.recomputeDomainEvidenceCompleteness(input.domainId);

    return mapRegulatoryMatch(row);
  }

  async listRegulatoryMatchesForDomain(domainId: string): Promise<RegulatoryMatch[]> {
    const rows = await this.prisma.regulatoryMatch.findMany({ where: { domainId } });
    return rows.map(mapRegulatoryMatch);
  }

  // --- reports ------------------------------------------------------------

  async createReport(input: CreateReportInput): Promise<Report> {
    const row = await this.prisma.report.create({
      data: {
        reference: input.reference,
        title: input.title,
        receivingAuthority: input.receivingAuthority,
        authorityOther: input.authorityOther ?? null,
        executiveSummary: input.executiveSummary,
        findings: input.findings,
        recommendations: input.recommendations,
        limitations: input.limitations,
        methodology: input.methodology,
        preparedById: input.preparedById,
        origin: input.origin,
        domainLinks: {
          create: input.domainIds.map((domainId, orderIndex) => ({
            domainId,
            includedRationale: input.domainRationales?.[domainId] ?? null,
            orderIndex,
          })),
        },
        evidenceLinks: {
          create: input.evidenceIds.map((evidenceId, orderIndex) => ({
            evidenceId,
            orderIndex,
          })),
        },
      },
    });
    return mapReport(row);
  }

  async getReportById(id: string): Promise<Report | null> {
    const row = await this.prisma.report.findUnique({ where: { id } });
    return row ? mapReport(row) : null;
  }

  async getReportDetail(id: string): Promise<ReportDetail | null> {
    return selectReportDetail(await this.snapshot("full"), id);
  }

  async updateReportContent(id: string, input: UpdateReportContentInput): Promise<Report> {
    const { domainIds, evidenceIds, domainRationales, ...content } = input;

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.report.update({
        where: { id },
        data: {
          title: content.title,
          receivingAuthority: content.receivingAuthority,
          authorityOther: content.authorityOther,
          executiveSummary: content.executiveSummary,
          findings: content.findings,
          recommendations: content.recommendations,
          limitations: content.limitations,
          methodology: content.methodology,
        },
      });

      if (domainIds) {
        await tx.reportDomain.deleteMany({ where: { reportId: id } });
        await tx.reportDomain.createMany({
          data: domainIds.map((domainId, orderIndex) => ({
            reportId: id,
            domainId,
            includedRationale: domainRationales?.[domainId] ?? null,
            orderIndex,
          })),
        });
      }
      if (evidenceIds) {
        await tx.reportEvidence.deleteMany({ where: { reportId: id } });
        await tx.reportEvidence.createMany({
          data: evidenceIds.map((evidenceId, orderIndex) => ({
            reportId: id,
            evidenceId,
            orderIndex,
          })),
        });
      }
      return updated;
    });

    return mapReport(row);
  }

  async applyReportTransition(
    id: string,
    input: ApplyReportTransitionInput,
  ): Promise<Report> {
    const row = await this.prisma.report.update({
      where: { id },
      data: {
        status: input.status,
        approvedById: input.approvedById,
        approvedAt: toDate(input.approvedAt),
        submittedAt: toDate(input.submittedAt),
        submissionReference: input.submissionReference,
        submissionChannel: input.submissionChannel,
        responseReceivedAt: toDate(input.responseReceivedAt),
        responseSummary: input.responseSummary,
        outcomeConfirmedAt: toDate(input.outcomeConfirmedAt),
        outcomeSummary: input.outcomeSummary,
        closedAt: toDate(input.closedAt),
        closingNote: input.closingNote,
      },
    });
    return mapReport(row);
  }

  async listReports(query: ReportQuery): Promise<Paginated<ReportListItem>> {
    return queryReports(await this.snapshot("reports"), query);
  }

  // --- audit (append-only) ------------------------------------------------

  async appendAuditEvent(input: AppendAuditEventInput): Promise<AuditEvent> {
    const row = await this.prisma.auditEvent.create({
      data: {
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        entityLabel: input.entityLabel ?? null,
        previousState: (input.previousState ?? undefined) as never,
        newState: (input.newState ?? undefined) as never,
        reason: input.reason ?? null,
        requestId: input.requestId ?? null,
      },
    });
    return mapAuditEvent(row);
  }

  async listAuditEvents(query: AuditQuery): Promise<Paginated<AuditEventListItem>> {
    return queryAuditEvents(await this.snapshot("audit"), query);
  }

  async listAuditEventsForEntity(
    entityType: AuditEntityType,
    entityId: string,
    limit: number,
  ): Promise<AuditEvent[]> {
    const rows = await this.prisma.auditEvent.findMany({
      where: { entityType, entityId },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(mapAuditEvent);
  }

  async listAuditActors(): Promise<Array<{ id: string; name: string }>> {
    const rows = await this.prisma.user.findMany({
      where: { auditEvents: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return rows;
  }

  // --- settings -----------------------------------------------------------

  async listSettings(): Promise<ApplicationSetting[]> {
    const rows = await this.prisma.applicationSetting.findMany({
      orderBy: [{ category: "asc" }, { label: "asc" }],
    });
    return rows.map(mapSetting);
  }

  async getSetting(key: string): Promise<ApplicationSetting | null> {
    const row = await this.prisma.applicationSetting.findUnique({ where: { key } });
    return row ? mapSetting(row) : null;
  }

  async updateSetting(
    key: string,
    value: JsonValue,
    updatedById: string | null,
  ): Promise<ApplicationSetting> {
    const row = await this.prisma.applicationSetting.update({
      where: { key },
      data: { value: value as never, updatedById },
    });
    return mapSetting(row);
  }

  // --- metrics ------------------------------------------------------------

  async getOverviewMetrics(): Promise<OverviewMetrics> {
    return computeOverviewMetrics(await this.snapshot("full"), Date.now());
  }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapDomain(row: any): Domain {
  return {
    id: row.id,
    fqdn: row.fqdn,
    normalizedDomain: row.normalizedDomain,
    registrableDomain: row.registrableDomain,
    suffix: row.suffix,
    seedPlatformId: row.seedPlatformId,
    associatedNames: row.associatedNames,
    firstSeenAt: isoRequired(row.firstSeenAt),
    lastSeenAt: isoRequired(row.lastSeenAt),
    lastCheckedAt: iso(row.lastCheckedAt),
    dnsStatus: row.dnsStatus,
    dnsCheckedAt: iso(row.dnsCheckedAt),
    resolvedIpCount: row.resolvedIpCount,
    httpStatusCode: row.httpStatusCode,
    httpCheckedAt: iso(row.httpCheckedAt),
    redirectsToUrl: row.redirectsToUrl,
    redirectObservedAt: iso(row.redirectObservedAt),
    certIssuer: row.certIssuer,
    certSubjectCommonName: row.certSubjectCommonName,
    certNotBefore: iso(row.certNotBefore),
    certNotAfter: iso(row.certNotAfter),
    certFingerprintSha256: row.certFingerprintSha256,
    certObservedAt: iso(row.certObservedAt),
    siteTitle: row.siteTitle,
    siteDescription: row.siteDescription,
    siteLanguage: row.siteLanguage,
    detectedTechnologies: row.detectedTechnologies,
    observedAt: iso(row.observedAt),
    brandSimilarityScore: row.brandSimilarityScore,
    contentSimilarityScore: row.contentSimilarityScore,
    similarityRationale: row.similarityRationale,
    evidenceCompleteness: row.evidenceCompleteness,
    reviewStatus: row.reviewStatus,
    priority: row.priority,
    assignedReviewerId: row.assignedReviewerId,
    reviewerNotes: row.reviewerNotes,
    reviewedAt: iso(row.reviewedAt),
    origin: row.origin,
    discoveredByScanId: row.discoveredByScanId,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  };
}

function mapScan(row: any): Scan {
  return {
    id: row.id,
    reference: row.reference,
    platformId: row.platformId,
    platformNameInput: row.platformNameInput,
    seedDomain: row.seedDomain,
    notes: row.notes,
    profile: row.profile,
    scopes: row.scopes,
    maxCandidates: row.maxCandidates,
    status: row.status,
    origin: row.origin,
    initiatedById: row.initiatedById,
    queuedAt: isoRequired(row.queuedAt),
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    cancelledAt: iso(row.cancelledAt),
    durationMs: row.durationMs,
    candidatesFound: row.candidatesFound,
    candidatesRequiringReview: row.candidatesRequiringReview,
    warningCount: row.warningCount,
    errorMessage: row.errorMessage,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  };
}

function mapAgentTask(row: any): AgentTask {
  return {
    id: row.id,
    scanId: row.scanId,
    agentKey: row.agentKey,
    sequence: row.sequence,
    title: row.title,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    durationMs: row.durationMs,
    inputSummary: row.inputSummary,
    outputSummary: row.outputSummary,
    metrics: (row.metrics ?? null) as Record<string, number> | null,
    errorMessage: row.errorMessage,
    hasWarnings: row.hasWarnings,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  };
}

function mapEvidence(row: any): Evidence {
  return {
    id: row.id,
    domainId: row.domainId,
    scanId: row.scanId,
    agentTaskId: row.agentTaskId,
    kind: row.kind,
    title: row.title,
    description: row.description,
    sourceUrl: row.sourceUrl,
    sourceLabel: row.sourceLabel,
    collectedAt: isoRequired(row.collectedAt),
    collectionMethod: row.collectionMethod,
    confidence: row.confidence,
    limitations: row.limitations,
    origin: row.origin,
    rawReference: toJson(row.rawReference),
    createdById: row.createdById,
    createdAt: isoRequired(row.createdAt),
  };
}

function mapRegulatorySource(row: any): RegulatorySource {
  return {
    id: row.id,
    authorityName: row.authorityName,
    authorityShortName: row.authorityShortName,
    title: row.title,
    sourceUrl: row.sourceUrl,
    sourceType: row.sourceType,
    description: row.description,
    isEnabled: row.isEnabled,
    checkIntervalHours: row.checkIntervalHours,
    lastCheckAttemptAt: iso(row.lastCheckAttemptAt),
    lastSuccessfulCheckAt: iso(row.lastSuccessfulCheckAt),
    lastModifiedReported: iso(row.lastModifiedReported),
    retrievalStatus: row.retrievalStatus,
    retrievalError: row.retrievalError,
    matchedEntityCount: row.matchedEntityCount,
    verificationNotes: row.verificationNotes,
    origin: row.origin,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  };
}

function mapRegulatorySourceCheck(row: any): RegulatorySourceCheck {
  return {
    id: row.id,
    regulatorySourceId: row.regulatorySourceId,
    startedAt: isoRequired(row.startedAt),
    completedAt: iso(row.completedAt),
    status: row.status,
    httpStatusCode: row.httpStatusCode,
    bytesRetrieved: row.bytesRetrieved,
    matchedEntityCount: row.matchedEntityCount,
    errorMessage: row.errorMessage,
    note: row.note,
    origin: row.origin,
    triggeredById: row.triggeredById,
    createdAt: isoRequired(row.createdAt),
  };
}

function mapRegulatoryMatch(row: any): RegulatoryMatch {
  return {
    id: row.id,
    regulatorySourceId: row.regulatorySourceId,
    regulatorySourceCheckId: row.regulatorySourceCheckId,
    domainId: row.domainId,
    matchedTerm: row.matchedTerm,
    matchedContext: row.matchedContext,
    matchType: row.matchType,
    confidence: row.confidence,
    sourceUrl: row.sourceUrl,
    sourceRetrievedAt: isoRequired(row.sourceRetrievedAt),
    reviewerConfirmed: row.reviewerConfirmed,
    reviewerConfirmedById: row.reviewerConfirmedById,
    reviewerConfirmedAt: iso(row.reviewerConfirmedAt),
    notes: row.notes,
    origin: row.origin,
    createdAt: isoRequired(row.createdAt),
  };
}

function mapReport(row: any): Report {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    status: row.status,
    receivingAuthority: row.receivingAuthority,
    authorityOther: row.authorityOther,
    executiveSummary: row.executiveSummary,
    findings: row.findings,
    recommendations: row.recommendations,
    limitations: row.limitations,
    methodology: row.methodology,
    preparedById: row.preparedById,
    approvedById: row.approvedById,
    approvedAt: iso(row.approvedAt),
    submittedAt: iso(row.submittedAt),
    submissionReference: row.submissionReference,
    submissionChannel: row.submissionChannel,
    responseReceivedAt: iso(row.responseReceivedAt),
    responseSummary: row.responseSummary,
    outcomeConfirmedAt: iso(row.outcomeConfirmedAt),
    outcomeSummary: row.outcomeSummary,
    closedAt: iso(row.closedAt),
    closingNote: row.closingNote,
    origin: row.origin,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  };
}

function mapAuditEvent(row: any): AuditEvent {
  return {
    id: row.id,
    occurredAt: isoRequired(row.occurredAt),
    actorId: row.actorId,
    actorLabel: row.actorLabel,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    previousState: toJson(row.previousState),
    newState: toJson(row.newState),
    reason: row.reason,
    requestId: row.requestId,
    createdAt: isoRequired(row.createdAt),
  };
}

function mapSetting(row: any): ApplicationSetting {
  return {
    key: row.key,
    category: row.category,
    label: row.label,
    description: row.description,
    value: toJson(row.value) as JsonValue,
    isSecret: row.isSecret,
    isEditable: row.isEditable,
    updatedById: row.updatedById,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

const GLOBAL_KEY = "__sentinelPrismaClient__";
type GlobalWithPrisma = typeof globalThis & { [GLOBAL_KEY]?: PrismaClient };

/**
 * One PrismaClient per process, reused across hot reloads so a dev server does
 * not exhaust the database's connection limit.
 */
export function createPrismaRepository(databaseUrl: string): PrismaRepository {
  const scope = globalThis as GlobalWithPrisma;
  const existing = scope[GLOBAL_KEY];
  if (existing) return new PrismaRepository(existing);

  // Prisma 7 reads the URL from prisma.config.ts for CLI commands; the client
  // needs it passed explicitly. The cast narrows a generic constructor
  // signature that cannot be expressed without the generated client options.
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  } as never) as PrismaClient;

  scope[GLOBAL_KEY] = client;
  return new PrismaRepository(client);
}
