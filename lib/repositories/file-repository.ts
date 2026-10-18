import "server-only";

import { computeEvidenceCompleteness } from "@/lib/utils/evidence";
import { generateId } from "@/lib/utils/deterministic";
import { normalizeDomain } from "@/lib/utils/domain-name";
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
import type { AuditEntityType } from "@/lib/types/enums";
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
  getDomainDetail as selectDomainDetail,
  getRegulatorySourceDetail as selectRegulatorySourceDetail,
  getReportDetail as selectReportDetail,
  getRelationshipGraph as selectRelationshipGraph,
  getScanDetail as selectScanDetail,
  listAuditEventsForEntity as selectAuditEventsForEntity,
  listDomainSuffixes as selectDomainSuffixes,
  listRegulatorySources as selectRegulatorySources,
  queryAllDomains,
  queryAuditEvents,
  queryDomains,
  queryRelationships,
  queryReports,
  queryScans,
  type Dataset,
} from "./dataset";
import { getFileStore, type FileStore, type GetFileStoreOptions } from "./file-store";
import {
  RecordNotFoundError,
  UniqueConstraintError,
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
 * The default repository adapter: the full Sentinel data model held in memory
 * and persisted as JSON. It is the only adapter needed to run the complete
 * demo workflow, and it requires no database server.
 */
export class FileRepository implements SentinelRepository {
  readonly kind = "file" as const;

  constructor(private readonly store: FileStore) {}

  // --- lifecycle ----------------------------------------------------------

  async initialize(): Promise<void> {
    await this.store.load();
  }

  async resetToSeed(): Promise<void> {
    await this.store.reset();
  }

  private now(): string {
    return new Date().toISOString();
  }

  // --- users --------------------------------------------------------------

  async listUsers(): Promise<User[]> {
    return this.store.read((data) => data.users.map(stripSecret));
  }

  async getUserById(id: string): Promise<User | null> {
    return this.store.read((data) => {
      const user = data.users.find((candidate) => candidate.id === id);
      return user ? stripSecret(user) : null;
    });
  }

  async findUserWithSecretByEmail(email: string): Promise<UserWithSecret | null> {
    const normalized = email.trim().toLowerCase();
    return this.store.read(
      (data) => data.users.find((user) => user.email.toLowerCase() === normalized) ?? null,
    );
  }

  async createUser(input: CreateUserInput): Promise<User> {
    return this.store.write((data) => {
      const email = input.email.trim().toLowerCase();
      if (data.users.some((user) => user.email.toLowerCase() === email)) {
        throw new UniqueConstraintError("User", "email", email);
      }
      const timestamp = this.now();
      const user: UserWithSecret = {
        id: generateId("usr"),
        email,
        name: input.name,
        role: input.role,
        passwordHash: input.passwordHash,
        jobTitle: input.jobTitle ?? null,
        isActive: true,
        isDemoUser: input.isDemoUser ?? false,
        lastLoginAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      data.users.push(user);
      return stripSecret(user);
    });
  }

  async recordUserLogin(id: string, at: string): Promise<void> {
    await this.store.write((data) => {
      const user = data.users.find((candidate) => candidate.id === id);
      if (!user) throw new RecordNotFoundError("User", id);
      user.lastLoginAt = at;
      user.updatedAt = at;
    });
  }

  // --- platforms and discovery sources ------------------------------------

  async listPlatforms(): Promise<Platform[]> {
    return this.store.read((data) =>
      [...data.platforms].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  async getPlatformById(id: string): Promise<Platform | null> {
    return this.store.read(
      (data) => data.platforms.find((platform) => platform.id === id) ?? null,
    );
  }

  async findPlatformByName(name: string): Promise<Platform | null> {
    const needle = name.trim().toLowerCase();
    return this.store.read(
      (data) =>
        data.platforms.find(
          (platform) =>
            platform.name.toLowerCase() === needle ||
            platform.slug === slugify(needle) ||
            platform.aliases.some((alias) => alias.toLowerCase() === needle),
        ) ?? null,
    );
  }

  async upsertPlatform(input: UpsertPlatformInput): Promise<Platform> {
    return this.store.write((data) => {
      const slug = input.slug ?? slugify(input.name);
      const existing = data.platforms.find(
        (platform) =>
          platform.slug === slug || platform.name.toLowerCase() === input.name.toLowerCase(),
      );
      const timestamp = this.now();
      if (existing) {
        existing.aliases = mergeUnique(existing.aliases, input.aliases ?? []);
        if (input.description !== undefined) existing.description = input.description;
        if (input.investigationId !== undefined) {
          existing.investigationId = input.investigationId;
        }
        existing.updatedAt = timestamp;
        return existing;
      }
      const platform: Platform = {
        id: generateId("plt"),
        name: input.name,
        slug,
        aliases: input.aliases ?? [],
        investigationId: input.investigationId ?? null,
        description: input.description ?? null,
        origin: input.origin,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      data.platforms.push(platform);
      return platform;
    });
  }

  async listDiscoverySources(): Promise<DiscoverySource[]> {
    return this.store.read((data) =>
      [...data.discoverySources].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  // --- scans --------------------------------------------------------------

  async createScan(input: CreateScanInput): Promise<Scan> {
    return this.store.write((data) => {
      if (data.scans.some((scan) => scan.reference === input.reference)) {
        throw new UniqueConstraintError("Scan", "reference", input.reference);
      }
      const timestamp = this.now();
      const scan: Scan = {
        id: generateId("scn"),
        reference: input.reference,
        platformId: input.platformId,
        platformNameInput: input.platformNameInput,
        seedDomain: input.seedDomain,
        notes: input.notes,
        profile: input.profile,
        scopes: input.scopes,
        maxCandidates: input.maxCandidates,
        status: "QUEUED",
        origin: input.origin,
        initiatedById: input.initiatedById,
        queuedAt: timestamp,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        durationMs: null,
        candidatesFound: 0,
        candidatesRequiringReview: 0,
        warningCount: 0,
        errorMessage: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      data.scans.push(scan);
      return scan;
    });
  }

  async getScanById(id: string): Promise<Scan | null> {
    return this.store.read((data) => data.scans.find((scan) => scan.id === id) ?? null);
  }

  async getScanDetail(id: string): Promise<ScanDetail | null> {
    return this.store.read((data) => selectScanDetail(data, id));
  }

  async updateScan(id: string, input: UpdateScanInput): Promise<Scan> {
    return this.store.write((data) => {
      const scan = data.scans.find((candidate) => candidate.id === id);
      if (!scan) throw new RecordNotFoundError("Scan", id);
      Object.assign(scan, stripUndefined(input));
      scan.updatedAt = this.now();
      return scan;
    });
  }

  async listScans(query: ScanQuery): Promise<Paginated<ScanListItem>> {
    return this.store.read((data) => queryScans(data, query));
  }

  async countActiveScans(): Promise<number> {
    return this.store.read(
      (data) =>
        data.scans.filter((scan) => scan.status === "QUEUED" || scan.status === "RUNNING")
          .length,
    );
  }

  // --- agent tasks --------------------------------------------------------

  async createAgentTask(input: CreateAgentTaskInput): Promise<AgentTask> {
    return this.store.write((data) => {
      const timestamp = this.now();
      const task: AgentTask = {
        id: generateId("tsk"),
        scanId: input.scanId,
        agentKey: input.agentKey,
        sequence: input.sequence,
        title: input.title,
        status: "PENDING",
        attempt: 0,
        maxAttempts: input.maxAttempts,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        inputSummary: input.inputSummary,
        outputSummary: null,
        metrics: null,
        errorMessage: null,
        hasWarnings: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      data.agentTasks.push(task);
      return task;
    });
  }

  async getAgentTaskById(id: string): Promise<AgentTask | null> {
    return this.store.read((data) => data.agentTasks.find((task) => task.id === id) ?? null);
  }

  async updateAgentTask(id: string, input: UpdateAgentTaskInput): Promise<AgentTask> {
    return this.store.write((data) => {
      const task = data.agentTasks.find((candidate) => candidate.id === id);
      if (!task) throw new RecordNotFoundError("AgentTask", id);
      Object.assign(task, stripUndefined(input));
      task.updatedAt = this.now();
      return task;
    });
  }

  async listAgentTasksForScan(scanId: string): Promise<AgentTask[]> {
    return this.store.read((data) =>
      data.agentTasks
        .filter((task) => task.scanId === scanId)
        .sort((a, b) => a.sequence - b.sequence),
    );
  }

  // --- domains ------------------------------------------------------------

  async upsertDomain(input: UpsertDomainInput): Promise<UpsertDomainResult> {
    return this.store.write((data) => {
      const parsed = normalizeDomain(input.fqdn);
      const existing = data.domains.find((domain) => domain.fqdn === parsed.fqdn);
      const timestamp = this.now();

      const technicalPatch = stripUndefined({
        dnsStatus: input.dnsStatus,
        dnsCheckedAt: input.dnsCheckedAt,
        resolvedIpCount: input.resolvedIpCount,
        httpStatusCode: input.httpStatusCode,
        httpCheckedAt: input.httpCheckedAt,
        redirectsToUrl: input.redirectsToUrl,
        redirectObservedAt: input.redirectObservedAt,
        certIssuer: input.certIssuer,
        certSubjectCommonName: input.certSubjectCommonName,
        certNotBefore: input.certNotBefore,
        certNotAfter: input.certNotAfter,
        certFingerprintSha256: input.certFingerprintSha256,
        certObservedAt: input.certObservedAt,
        siteTitle: input.siteTitle,
        siteDescription: input.siteDescription,
        siteLanguage: input.siteLanguage,
        brandSimilarityScore: input.brandSimilarityScore,
        contentSimilarityScore: input.contentSimilarityScore,
        similarityRationale: input.similarityRationale,
      });

      let domain: Domain;
      let created: boolean;

      if (existing) {
        // Merge: later observations extend the record, they never erase it.
        Object.assign(existing, technicalPatch);
        existing.lastSeenAt = maxIso(existing.lastSeenAt, input.observedAt);
        existing.associatedNames = mergeUnique(
          existing.associatedNames,
          input.associatedNames ?? [],
        );
        if (input.detectedTechnologies?.length) {
          existing.detectedTechnologies = mergeUnique(
            existing.detectedTechnologies,
            input.detectedTechnologies,
          );
        }
        if (input.seedPlatformId !== undefined && existing.seedPlatformId === null) {
          existing.seedPlatformId = input.seedPlatformId;
        }
        if (input.priority !== undefined && existing.priority === "UNTRIAGED") {
          existing.priority = input.priority;
        }
        if (hasAnyTechnicalObservation(technicalPatch)) {
          existing.lastCheckedAt = input.observedAt;
          existing.observedAt = input.observedAt;
        }
        // An observation collected live upgrades a previously simulated record.
        if (input.origin === "LIVE_COLLECTED") existing.origin = "LIVE_COLLECTED";
        existing.updatedAt = timestamp;
        domain = existing;
        created = false;
      } else {
        domain = {
          id: generateId("dom"),
          fqdn: parsed.fqdn,
          normalizedDomain: parsed.normalizedDomain,
          registrableDomain: parsed.registrableDomain,
          suffix: parsed.suffix,
          seedPlatformId: input.seedPlatformId ?? null,
          associatedNames: input.associatedNames ?? [],
          firstSeenAt: input.observedAt,
          lastSeenAt: input.observedAt,
          lastCheckedAt: hasAnyTechnicalObservation(technicalPatch) ? input.observedAt : null,
          dnsStatus: null,
          dnsCheckedAt: null,
          resolvedIpCount: null,
          httpStatusCode: null,
          httpCheckedAt: null,
          redirectsToUrl: null,
          redirectObservedAt: null,
          certIssuer: null,
          certSubjectCommonName: null,
          certNotBefore: null,
          certNotAfter: null,
          certFingerprintSha256: null,
          certObservedAt: null,
          siteTitle: null,
          siteDescription: null,
          siteLanguage: null,
          detectedTechnologies: input.detectedTechnologies ?? [],
          observedAt: hasAnyTechnicalObservation(technicalPatch) ? input.observedAt : null,
          brandSimilarityScore: null,
          contentSimilarityScore: null,
          similarityRationale: null,
          evidenceCompleteness: 0,
          reviewStatus: "AWAITING_REVIEW",
          priority: input.priority ?? "UNTRIAGED",
          assignedReviewerId: null,
          reviewerNotes: null,
          reviewedAt: null,
          origin: input.origin,
          discoveredByScanId: input.discoveredByScanId ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        Object.assign(domain, technicalPatch);
        data.domains.push(domain);
        created = true;
      }

      // Discovery-source links carry their own first/last seen timestamps, so a
      // domain found repeatedly by one source shows an accurate observation window.
      for (const source of input.discoverySources ?? []) {
        const discoverySource = data.discoverySources.find((s) => s.key === source.sourceKey);
        if (!discoverySource) continue;
        const link = data.domainDiscoverySources.find(
          (candidate) =>
            candidate.domainId === domain.id &&
            candidate.discoverySourceId === discoverySource.id,
        );
        if (link) {
          link.lastSeenAt = maxIso(link.lastSeenAt, source.observedAt);
          if (source.detail) link.detail = source.detail;
        } else {
          data.domainDiscoverySources.push({
            domainId: domain.id,
            discoverySourceId: discoverySource.id,
            firstSeenAt: source.observedAt,
            lastSeenAt: source.observedAt,
            detail: source.detail ?? null,
            origin: input.origin,
          });
        }
      }

      recomputeCompleteness(data, domain);
      return { domain, created };
    });
  }

  async getDomainById(id: string): Promise<Domain | null> {
    return this.store.read((data) => data.domains.find((domain) => domain.id === id) ?? null);
  }

  async getDomainByFqdn(fqdn: string): Promise<Domain | null> {
    const normalized = fqdn.trim().toLowerCase();
    return this.store.read(
      (data) => data.domains.find((domain) => domain.fqdn === normalized) ?? null,
    );
  }

  async getDomainDetail(idOrFqdn: string): Promise<DomainDetail | null> {
    return this.store.read((data) => selectDomainDetail(data, idOrFqdn));
  }

  async listDomains(query: DomainQuery): Promise<Paginated<DomainListItem>> {
    return this.store.read((data) => queryDomains(data, query));
  }

  async listAllDomainsForExport(query: DomainQuery, limit: number): Promise<DomainListItem[]> {
    return this.store.read((data) => queryAllDomains(data, query, limit));
  }

  async updateDomainReview(id: string, input: UpdateDomainReviewInput): Promise<Domain> {
    return this.store.write((data) => {
      const domain = data.domains.find((candidate) => candidate.id === id);
      if (!domain) throw new RecordNotFoundError("Domain", id);
      Object.assign(domain, stripUndefined(input));
      domain.updatedAt = this.now();
      recomputeCompleteness(data, domain);
      return domain;
    });
  }

  async recomputeDomainEvidenceCompleteness(id: string): Promise<Domain> {
    return this.store.write((data) => {
      const domain = data.domains.find((candidate) => candidate.id === id);
      if (!domain) throw new RecordNotFoundError("Domain", id);
      recomputeCompleteness(data, domain);
      return domain;
    });
  }

  async listDomainSuffixes(): Promise<Array<{ suffix: string; count: number }>> {
    return this.store.read((data) => selectDomainSuffixes(data));
  }

  // --- evidence -----------------------------------------------------------

  async createEvidence(input: CreateEvidenceInput): Promise<Evidence> {
    return this.store.write((data) => {
      const evidence: Evidence = {
        id: generateId("evd"),
        domainId: input.domainId ?? null,
        scanId: input.scanId ?? null,
        agentTaskId: input.agentTaskId ?? null,
        kind: input.kind,
        title: input.title,
        description: input.description,
        sourceUrl: input.sourceUrl ?? null,
        sourceLabel: input.sourceLabel ?? null,
        collectedAt: input.collectedAt,
        collectionMethod: input.collectionMethod,
        confidence: input.confidence ?? null,
        limitations: input.limitations ?? null,
        origin: input.origin,
        rawReference: input.rawReference ?? null,
        createdById: input.createdById ?? null,
        createdAt: this.now(),
      };
      data.evidence.push(evidence);

      if (evidence.domainId) {
        const domain = data.domains.find((candidate) => candidate.id === evidence.domainId);
        if (domain) recomputeCompleteness(data, domain);
      }
      return evidence;
    });
  }

  async listEvidenceForDomain(domainId: string): Promise<Evidence[]> {
    return this.store.read((data) =>
      data.evidence
        .filter((item) => item.domainId === domainId)
        .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)),
    );
  }

  async listEvidenceForScan(scanId: string): Promise<Evidence[]> {
    return this.store.read((data) =>
      data.evidence
        .filter((item) => item.scanId === scanId)
        .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)),
    );
  }

  async getEvidenceByIds(ids: string[]): Promise<Evidence[]> {
    const wanted = new Set(ids);
    return this.store.read((data) => data.evidence.filter((item) => wanted.has(item.id)));
  }

  // --- relationships ------------------------------------------------------

  async upsertRelationship(input: UpsertRelationshipInput): Promise<RelationshipWithEndpoints> {
    return this.store.write((data) => {
      if (input.sourceDomainId === input.targetDomainId) {
        throw new Error("A domain cannot have a relationship with itself.");
      }
      for (const id of [input.sourceDomainId, input.targetDomainId]) {
        if (!data.domains.some((domain) => domain.id === id)) {
          throw new RecordNotFoundError("Domain", id);
        }
      }

      const existing = data.relationships.find(
        (relationship) =>
          relationship.sourceDomainId === input.sourceDomainId &&
          relationship.targetDomainId === input.targetDomainId &&
          relationship.type === input.type,
      );
      const timestamp = this.now();

      const relationship = existing ?? {
        id: generateId("rel"),
        sourceDomainId: input.sourceDomainId,
        targetDomainId: input.targetDomainId,
        type: input.type,
        confidence: input.confidence,
        rationale: input.rationale,
        limitations: input.limitations,
        relationSource: input.relationSource,
        firstObservedAt: input.observedAt,
        lastObservedAt: input.observedAt,
        reviewerConfirmed: false,
        reviewerConfirmedAt: null,
        origin: input.origin,
        evidenceId: input.evidenceId ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      if (existing) {
        existing.confidence = input.confidence;
        existing.rationale = input.rationale;
        existing.limitations = input.limitations;
        existing.relationSource = input.relationSource;
        existing.lastObservedAt = maxIso(existing.lastObservedAt, input.observedAt);
        if (input.evidenceId) existing.evidenceId = input.evidenceId;
        if (input.origin === "LIVE_COLLECTED") existing.origin = "LIVE_COLLECTED";
        existing.updatedAt = timestamp;
      } else {
        data.relationships.push(relationship);
      }

      const composed = composeRelationship(relationship, buildIndex(data));
      if (!composed) throw new RecordNotFoundError("DomainRelationship", relationship.id);
      return composed;
    });
  }

  async listRelationships(query: RelationshipQuery): Promise<RelationshipWithEndpoints[]> {
    return this.store.read((data) => queryRelationships(data, query));
  }

  async getRelationshipGraph(query: RelationshipQuery): Promise<RelationshipGraph> {
    return this.store.read((data) => selectRelationshipGraph(data, query));
  }

  async confirmRelationship(id: string, at: string): Promise<RelationshipWithEndpoints> {
    return this.store.write((data) => {
      const relationship = data.relationships.find((candidate) => candidate.id === id);
      if (!relationship) throw new RecordNotFoundError("DomainRelationship", id);
      relationship.reviewerConfirmed = true;
      relationship.reviewerConfirmedAt = at;
      relationship.updatedAt = at;
      const composed = composeRelationship(relationship, buildIndex(data));
      if (!composed) throw new RecordNotFoundError("DomainRelationship", id);
      return composed;
    });
  }

  // --- regulatory sources -------------------------------------------------

  async listRegulatorySources(): Promise<RegulatorySourceListItem[]> {
    return this.store.read((data) => selectRegulatorySources(data, Date.now()));
  }

  async getRegulatorySourceDetail(id: string): Promise<RegulatorySourceDetail | null> {
    return this.store.read((data) => selectRegulatorySourceDetail(data, id, Date.now()));
  }

  async getRegulatorySourceById(id: string): Promise<RegulatorySource | null> {
    return this.store.read(
      (data) => data.regulatorySources.find((source) => source.id === id) ?? null,
    );
  }

  async createRegulatorySource(input: CreateRegulatorySourceInput): Promise<RegulatorySource> {
    return this.store.write((data) => {
      const duplicate = data.regulatorySources.find(
        (source) =>
          source.authorityShortName === input.authorityShortName &&
          source.sourceUrl === input.sourceUrl,
      );
      if (duplicate) {
        throw new UniqueConstraintError("RegulatorySource", "sourceUrl", input.sourceUrl);
      }
      const timestamp = this.now();
      const source: RegulatorySource = {
        id: generateId("reg"),
        authorityName: input.authorityName,
        authorityShortName: input.authorityShortName,
        title: input.title,
        sourceUrl: input.sourceUrl,
        sourceType: input.sourceType,
        description: input.description ?? null,
        isEnabled: input.isEnabled,
        checkIntervalHours: input.checkIntervalHours,
        lastCheckAttemptAt: null,
        lastSuccessfulCheckAt: null,
        lastModifiedReported: null,
        retrievalStatus: "NEVER_CHECKED",
        retrievalError: null,
        matchedEntityCount: 0,
        verificationNotes: input.verificationNotes ?? null,
        origin: input.origin,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      data.regulatorySources.push(source);
      return source;
    });
  }

  async updateRegulatorySource(
    id: string,
    input: UpdateRegulatorySourceInput,
  ): Promise<RegulatorySource> {
    return this.store.write((data) => {
      const source = data.regulatorySources.find((candidate) => candidate.id === id);
      if (!source) throw new RecordNotFoundError("RegulatorySource", id);
      Object.assign(source, stripUndefined(input));
      source.updatedAt = this.now();
      return source;
    });
  }

  async createRegulatorySourceCheck(
    input: CreateRegulatorySourceCheckInput,
  ): Promise<RegulatorySourceCheck> {
    return this.store.write((data) => {
      const check: RegulatorySourceCheck = {
        id: generateId("chk"),
        regulatorySourceId: input.regulatorySourceId,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        status: input.status,
        httpStatusCode: input.httpStatusCode ?? null,
        bytesRetrieved: input.bytesRetrieved ?? null,
        matchedEntityCount: input.matchedEntityCount,
        errorMessage: input.errorMessage ?? null,
        note: input.note ?? null,
        origin: input.origin,
        triggeredById: input.triggeredById ?? null,
        createdAt: this.now(),
      };
      data.regulatorySourceChecks.push(check);
      return check;
    });
  }

  async createRegulatoryMatch(input: CreateRegulatoryMatchInput): Promise<RegulatoryMatch> {
    return this.store.write((data) => {
      const match: RegulatoryMatch = {
        id: generateId("mtc"),
        regulatorySourceId: input.regulatorySourceId,
        regulatorySourceCheckId: input.regulatorySourceCheckId ?? null,
        domainId: input.domainId ?? null,
        matchedTerm: input.matchedTerm,
        matchedContext: input.matchedContext,
        matchType: input.matchType,
        confidence: input.confidence,
        sourceUrl: input.sourceUrl,
        sourceRetrievedAt: input.sourceRetrievedAt,
        reviewerConfirmed: false,
        reviewerConfirmedById: null,
        reviewerConfirmedAt: null,
        notes: input.notes ?? null,
        origin: input.origin,
        createdAt: this.now(),
      };
      data.regulatoryMatches.push(match);

      const source = data.regulatorySources.find((s) => s.id === input.regulatorySourceId);
      if (source) {
        source.matchedEntityCount = data.regulatoryMatches.filter(
          (m) => m.regulatorySourceId === source.id,
        ).length;
      }
      if (match.domainId) {
        const domain = data.domains.find((d) => d.id === match.domainId);
        if (domain) recomputeCompleteness(data, domain);
      }
      return match;
    });
  }

  async listRegulatoryMatchesForDomain(domainId: string): Promise<RegulatoryMatch[]> {
    return this.store.read((data) =>
      data.regulatoryMatches.filter((match) => match.domainId === domainId),
    );
  }

  // --- reports ------------------------------------------------------------

  async createReport(input: CreateReportInput): Promise<Report> {
    return this.store.write((data) => {
      if (data.reports.some((report) => report.reference === input.reference)) {
        throw new UniqueConstraintError("Report", "reference", input.reference);
      }
      const timestamp = this.now();
      const report: Report = {
        id: generateId("rpt"),
        reference: input.reference,
        title: input.title,
        status: "DRAFT",
        receivingAuthority: input.receivingAuthority,
        authorityOther: input.authorityOther ?? null,
        executiveSummary: input.executiveSummary,
        findings: input.findings,
        recommendations: input.recommendations,
        limitations: input.limitations,
        methodology: input.methodology,
        preparedById: input.preparedById,
        approvedById: null,
        approvedAt: null,
        submittedAt: null,
        submissionReference: null,
        submissionChannel: null,
        responseReceivedAt: null,
        responseSummary: null,
        outcomeConfirmedAt: null,
        outcomeSummary: null,
        closedAt: null,
        closingNote: null,
        origin: input.origin,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      data.reports.push(report);
      replaceReportLinks(data, report.id, input.domainIds, input.evidenceIds, input.domainRationales);
      return report;
    });
  }

  async getReportById(id: string): Promise<Report | null> {
    return this.store.read((data) => data.reports.find((report) => report.id === id) ?? null);
  }

  async getReportDetail(id: string): Promise<ReportDetail | null> {
    return this.store.read((data) => selectReportDetail(data, id));
  }

  async updateReportContent(id: string, input: UpdateReportContentInput): Promise<Report> {
    return this.store.write((data) => {
      const report = data.reports.find((candidate) => candidate.id === id);
      if (!report) throw new RecordNotFoundError("Report", id);
      const { domainIds, evidenceIds, domainRationales, ...content } = input;
      Object.assign(report, stripUndefined(content));
      report.updatedAt = this.now();
      if (domainIds || evidenceIds) {
        replaceReportLinks(
          data,
          report.id,
          domainIds ??
            data.reportDomains
              .filter((link) => link.reportId === report.id)
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((link) => link.domainId),
          evidenceIds ??
            data.reportEvidence
              .filter((link) => link.reportId === report.id)
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((link) => link.evidenceId),
          domainRationales,
        );
      }
      return report;
    });
  }

  async applyReportTransition(
    id: string,
    input: ApplyReportTransitionInput,
  ): Promise<Report> {
    return this.store.write((data) => {
      const report = data.reports.find((candidate) => candidate.id === id);
      if (!report) throw new RecordNotFoundError("Report", id);
      Object.assign(report, stripUndefined(input));
      report.updatedAt = this.now();
      return report;
    });
  }

  async listReports(query: ReportQuery): Promise<Paginated<ReportListItem>> {
    return this.store.read((data) => queryReports(data, query));
  }

  // --- audit (append-only) ------------------------------------------------

  async appendAuditEvent(input: AppendAuditEventInput): Promise<AuditEvent> {
    return this.store.write((data) => {
      const timestamp = this.now();
      const event: AuditEvent = {
        id: generateId("aud"),
        occurredAt: input.occurredAt ?? timestamp,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        entityLabel: input.entityLabel ?? null,
        previousState: input.previousState ?? null,
        newState: input.newState ?? null,
        reason: input.reason ?? null,
        requestId: input.requestId ?? null,
        createdAt: timestamp,
      };
      data.auditEvents.push(event);
      return event;
    });
  }

  async listAuditEvents(query: AuditQuery): Promise<Paginated<AuditEventListItem>> {
    return this.store.read((data) => queryAuditEvents(data, query));
  }

  async listAuditEventsForEntity(
    entityType: AuditEntityType,
    entityId: string,
    limit: number,
  ): Promise<AuditEvent[]> {
    return this.store.read((data) =>
      selectAuditEventsForEntity(data, entityType, entityId, limit),
    );
  }

  async listAuditActors(): Promise<Array<{ id: string; name: string }>> {
    return this.store.read((data) => {
      const ids = new Set(
        data.auditEvents
          .map((event) => event.actorId)
          .filter((id): id is string => id !== null),
      );
      return data.users
        .filter((user) => ids.has(user.id))
        .map((user) => ({ id: user.id, name: user.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  // --- settings -----------------------------------------------------------

  async listSettings(): Promise<ApplicationSetting[]> {
    return this.store.read((data) =>
      [...data.settings].sort(
        (a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label),
      ),
    );
  }

  async getSetting(key: string): Promise<ApplicationSetting | null> {
    return this.store.read(
      (data) => data.settings.find((setting) => setting.key === key) ?? null,
    );
  }

  async updateSetting(
    key: string,
    value: JsonValue,
    updatedById: string | null,
  ): Promise<ApplicationSetting> {
    return this.store.write((data) => {
      const setting = data.settings.find((candidate) => candidate.key === key);
      if (!setting) throw new RecordNotFoundError("ApplicationSetting", key);
      setting.value = value;
      setting.updatedById = updatedById;
      setting.updatedAt = this.now();
      return setting;
    });
  }

  // --- metrics ------------------------------------------------------------

  async getOverviewMetrics(): Promise<OverviewMetrics> {
    return this.store.read((data) => computeOverviewMetrics(data, Date.now()));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripSecret(user: UserWithSecret): User {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mergeUnique(existing: string[], additions: string[]): string[] {
  const set = new Set(existing);
  for (const addition of additions) set.add(addition);
  return [...set];
}

function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}

/** Drops `undefined` values so a partial patch never nulls an untouched field. */
function stripUndefined<T extends object>(input: T): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value;
  }
  return output as Partial<T>;
}

function hasAnyTechnicalObservation(patch: Record<string, unknown>): boolean {
  return [
    "dnsStatus",
    "httpStatusCode",
    "siteTitle",
    "certFingerprintSha256",
    "redirectsToUrl",
  ].some((key) => patch[key] !== undefined && patch[key] !== null);
}

function recomputeCompleteness(data: Dataset, domain: Domain): void {
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

function replaceReportLinks(
  data: Dataset,
  reportId: string,
  domainIds: string[],
  evidenceIds: string[],
  domainRationales: Record<string, string> | undefined,
): void {
  data.reportDomains = data.reportDomains.filter((link) => link.reportId !== reportId);
  data.reportEvidence = data.reportEvidence.filter((link) => link.reportId !== reportId);

  domainIds.forEach((domainId, orderIndex) => {
    data.reportDomains.push({
      reportId,
      domainId,
      includedRationale: domainRationales?.[domainId] ?? null,
      orderIndex,
    });
  });
  evidenceIds.forEach((evidenceId, orderIndex) => {
    data.reportEvidence.push({ reportId, evidenceId, orderIndex });
  });
}

export function createFileRepository(options: GetFileStoreOptions = {}): FileRepository {
  return new FileRepository(getFileStore(options));
}
