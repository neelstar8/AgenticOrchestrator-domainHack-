import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  ScanOrchestrator,
  buildProgress,
  getRunState,
  isFixtureSourceUrl,
  reconcileOrphanedScans,
  requestCancellation,
} from "@/agents/orchestrator/scan-orchestrator";
import { createProviderRegistry } from "@/agents/providers/registry";
import { MockRegulatorySourceProvider } from "@/agents/mock/mock-providers";
import { createFileRepository, type FileRepository } from "@/lib/repositories/file-repository";
import { getEnv } from "@/lib/config/env";
import type { DiscoveryScope } from "@/lib/types/enums";

const ALL_SCOPES: DiscoveryScope[] = [
  "SEARCH_INDEX",
  "DOMAIN_VARIATIONS",
  "CERTIFICATE_TRANSPARENCY",
  "TECHNICAL_INSPECTION",
  "REGULATORY_MATCHING",
  "RELATED_DOMAIN_ANALYSIS",
];

async function makeRepository(): Promise<{ dataDir: string; repository: FileRepository }> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "sentinel-orch-"));
  const repository = createFileRepository({ dataDir, isolated: true });
  await repository.initialize();
  return { dataDir, repository };
}

async function setUpScan(
  repository: FileRepository,
  scopes: DiscoveryScope[] = ALL_SCOPES,
  profile: "QUICK" | "COMPREHENSIVE" = "COMPREHENSIVE",
) {
  const reference = `SNT-SCN-TEST-${Math.random().toString(36).slice(2, 10)}`;
  const users = await repository.listUsers();
  const actor = users.find((user) => user.role === "INVESTIGATOR") ?? users[0]!;
  const platforms = await repository.listPlatforms();

  const scan = await repository.createScan({
    reference,
    platformId: platforms[0]?.id ?? null,
    platformNameInput: "Quotex",
    seedDomain: "quotex.com",
    notes: "Orchestrator integration test.",
    profile,
    scopes,
    maxCandidates: 25,
    initiatedById: actor.id,
    origin: "SIMULATED_DEMO",
  });

  const orchestrator = new ScanOrchestrator({
    scan,
    actor: { id: actor.id, name: actor.name },
    repository,
    providers: createProviderRegistry(getEnv()),
    requestId: `test-${reference}`,
    timeoutMs: 120_000,
  });

  return { scan, orchestrator, actor };
}

// ---------------------------------------------------------------------------
// One shared comprehensive run backs every assertion about its outcome. A run
// costs ~15s of simulated latency, so running it once rather than per test
// keeps the suite usable.
// ---------------------------------------------------------------------------

describe("ScanOrchestrator — outcome of one full comprehensive run", () => {
  let dataDir: string;
  let repository: FileRepository;
  let scanId: string;

  beforeAll(async () => {
    ({ dataDir, repository } = await makeRepository());
    const { orchestrator, scan } = await setUpScan(repository);
    scanId = scan.id;
    await orchestrator.prepare();
    await orchestrator.run_();
  }, 240_000);

  afterAll(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("completes and persists domains, evidence and relationships", async () => {
    const finished = await repository.getScanById(scanId);
    expect(finished).not.toBeNull();
    expect(["COMPLETED", "COMPLETED_WITH_WARNINGS"]).toContain(finished!.status);
    expect(finished!.candidatesFound).toBeGreaterThan(0);
    expect(finished!.durationMs).toBeGreaterThan(0);
    expect(finished!.completedAt).not.toBeNull();

    const detail = await repository.getScanDetail(scanId);
    expect(detail!.domains.length).toBeGreaterThan(0);
    expect(detail!.evidence.length).toBeGreaterThan(0);
    expect(detail!.tasks).toHaveLength(6);
    expect(detail!.tasks.every((task) => task.status !== "PENDING")).toBe(true);
    expect(detail!.discoverySources.length).toBeGreaterThan(0);

    for (const domain of detail!.domains) {
      expect(domain.discoveredByScanId).toBe(scanId);
      expect(domain.origin).toBe("SIMULATED_DEMO");
    }
  });

  it("records an audit event for each kind of state change", async () => {
    // Queried per action rather than from one page: a comprehensive run emits
    // well over a page of events.
    for (const action of [
      "SCAN_CREATED",
      "SCAN_COMPLETED",
      "AGENT_TASK_STARTED",
      "AGENT_TASK_COMPLETED",
      "DOMAIN_DISCOVERED",
      "EVIDENCE_ADDED",
      "RELATIONSHIP_RECORDED",
    ]) {
      const page = await repository.listAuditEvents({ action: [action], pageSize: 5 });
      expect(page.total, `expected at least one ${action} event`).toBeGreaterThan(0);
    }

    const scanEvents = await repository.listAuditEventsForEntity("SCAN", scanId, 50);
    expect(scanEvents.length).toBeGreaterThanOrEqual(2);
    // Every event carries a request id so provider calls can be correlated.
    expect(scanEvents.every((event) => event.requestId !== null)).toBe(true);
  });

  it("deduplicates candidates by normalised FQDN", async () => {
    const domains = await repository.listDomains({ pageSize: 200 });
    const fqdns = domains.items.map((domain) => domain.fqdn);
    expect(new Set(fqdns).size).toBe(fqdns.length);
  });

  it("attaches limitations to every piece of evidence it records", async () => {
    const evidence = await repository.listEvidenceForScan(scanId);
    expect(evidence.length).toBeGreaterThan(0);
    for (const item of evidence) {
      expect(item.limitations).toBeTruthy();
      expect(item.limitations!.length).toBeGreaterThan(10);
      expect(item.collectedAt).toBeTruthy();
      expect(item.origin).toBe("SIMULATED_DEMO");
    }
  });

  it("states what every recorded relationship does not establish", async () => {
    const relationships = await repository.listRelationships({ limit: 500 });
    expect(relationships.length).toBeGreaterThan(0);
    for (const relationship of relationships) {
      expect(relationship.limitations.length).toBeGreaterThan(10);
      expect(relationship.rationale.length).toBeGreaterThan(10);
    }

    // Infrastructure-derived edges must disclaim ownership explicitly.
    const infrastructure = relationships.filter(
      (relationship) => relationship.type === "SHARES_CERTIFICATE_CHARACTERISTIC",
    );
    for (const edge of infrastructure) {
      expect(edge.limitations.toLowerCase()).toContain("ownership");
    }
  });

  it("never lets an agent escalate a priority above MEDIUM", async () => {
    // Only domains this scan discovered: a seeded domain keeps the priority a
    // human assigned to it, which is exactly what the cap protects.
    const discovered = await repository.listDomains({ scanId, pageSize: 200 });
    expect(discovered.total).toBeGreaterThan(0);

    for (const domain of discovered.items) {
      if (domain.reviewerNotes !== null) continue;
      expect(
        ["MEDIUM", "LOW", "UNTRIAGED"],
        `${domain.fqdn} reached ${domain.priority} without a reviewer`,
      ).toContain(domain.priority);
    }
  });

  it("leaves unresolved candidates explicitly unchecked", async () => {
    const domains = await repository.listDomains({ scanId, pageSize: 200 });
    const unchecked = domains.items.filter((domain) => domain.dnsStatus === null);

    for (const domain of unchecked) {
      // "Not checked" must stay genuinely empty, not be filled with a guess.
      expect(domain.dnsCheckedAt).toBeNull();
      expect(domain.resolvedIpCount).toBeNull();
    }
  });

  it("reports 100% progress and a terminal status once finished", async () => {
    const progress = buildProgress(
      (await repository.getScanById(scanId))!,
      await repository.listAgentTasksForScan(scanId),
      getRunState(scanId),
    );
    expect(progress.percentComplete).toBe(100);
    expect(progress.isSimulated).toBe(true);
    expect(["COMPLETED", "COMPLETED_WITH_WARNINGS"]).toContain(progress.status);
    expect(progress.tasks).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Behaviours that need their own run.
// ---------------------------------------------------------------------------

describe("ScanOrchestrator — planning, cancellation and failure", () => {
  let dataDir: string;
  let repository: FileRepository;

  beforeEach(async () => {
    ({ dataDir, repository } = await makeRepository());
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("plans the full pipeline before running anything", async () => {
    const { orchestrator, scan } = await setUpScan(repository);
    const tasks = await orchestrator.prepare();

    expect(tasks).toHaveLength(6);
    expect(tasks.map((task) => task.agentKey)).toEqual([
      "WEB_DISCOVERY",
      "DOMAIN_ENUMERATION",
      "WEBSITE_INSPECTION",
      "REGULATORY_VERIFICATION",
      "RELATIONSHIP_ANALYSIS",
      "EVIDENCE_REPORTING",
    ]);
    // The whole plan is visible as PENDING before execution starts.
    expect(tasks.every((task) => task.status === "PENDING")).toBe(true);
    expect(await repository.listAgentTasksForScan(scan.id)).toHaveLength(6);
  }, 60_000);

  it("only plans the steps whose scopes were selected", async () => {
    const { orchestrator } = await setUpScan(repository, ["SEARCH_INDEX"]);
    const tasks = await orchestrator.prepare();

    // Web discovery plus the always-on reporting step.
    expect(tasks.map((task) => task.agentKey)).toEqual(["WEB_DISCOVERY", "EVIDENCE_REPORTING"]);
  }, 60_000);

  it("reports live progress while a scan is running", async () => {
    const { orchestrator, scan } = await setUpScan(repository);
    await orchestrator.prepare();

    const running = orchestrator.run_();
    await new Promise((resolve) => setTimeout(resolve, 1_200));

    const progress = buildProgress(
      (await repository.getScanById(scan.id))!,
      await repository.listAgentTasksForScan(scan.id),
      getRunState(scan.id),
    );

    expect(progress.status).toBe("RUNNING");
    expect(progress.isSimulated).toBe(true);
    expect(progress.percentComplete).toBeLessThan(100);
    expect(progress.tasks).toHaveLength(6);
    expect(progress.elapsedMs).toBeGreaterThan(0);
    expect(progress.currentAgent).not.toBeNull();
    expect(progress.currentMessage).toBeTruthy();

    requestCancellation(scan.id);
    await running;
  }, 120_000);

  it("cancels promptly and keeps what was already collected", async () => {
    const { orchestrator, scan } = await setUpScan(repository);
    await orchestrator.prepare();

    const running = orchestrator.run_();
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(requestCancellation(scan.id)).toBe(true);
    await running;

    const finished = await repository.getScanById(scan.id);
    expect(finished!.status).toBe("CANCELLED");
    expect(finished!.cancelledAt).not.toBeNull();
    // A cancelled scan did not complete, so completedAt stays null.
    expect(finished!.completedAt).toBeNull();

    const tasks = await repository.listAgentTasksForScan(scan.id);
    expect(tasks.some((task) => task.status === "CANCELLED")).toBe(true);

    const events = await repository.listAuditEventsForEntity("SCAN", scan.id, 20);
    expect(events.some((event) => event.action === "SCAN_CANCELLED")).toBe(true);
  }, 120_000);

  it("refuses to cancel a scan that is not running", async () => {
    const { scan } = await setUpScan(repository);
    expect(requestCancellation(scan.id)).toBe(false);
    expect(requestCancellation("no-such-scan")).toBe(false);
  }, 60_000);

  it("retries a retryable failure, then fails the task honestly", async () => {
    const { scan } = await setUpScan(repository, ["SEARCH_INDEX"]);
    const providers = createProviderRegistry(getEnv());

    let attempts = 0;
    providers.search = {
      descriptor: { ...providers.search.descriptor, id: "always-failing-search" },
      async search() {
        attempts += 1;
        return {
          ok: false as const,
          error: {
            code: "UPSTREAM_ERROR" as const,
            message: "Injected failure for the failure-path test.",
            retryable: true,
          },
          metadata: {
            providerId: "always-failing-search",
            origin: "SIMULATED_DEMO" as const,
            durationMs: 1,
            warnings: [],
          },
        };
      },
    };

    const failing = new ScanOrchestrator({
      scan,
      actor: { id: "test-actor", name: "Test Actor" },
      repository,
      providers,
      requestId: "test-failure",
      timeoutMs: 30_000,
      maxAttemptsPerTask: 2,
    });

    await failing.prepare();
    await failing.run_();

    expect(attempts).toBe(2);

    const finished = await repository.getScanById(scan.id);
    // The always-on reporting step still succeeds, so the scan completes with
    // warnings rather than failing outright — and names the failed task.
    expect(["FAILED", "COMPLETED_WITH_WARNINGS"]).toContain(finished!.status);
    expect(finished!.errorMessage).toBeTruthy();
    expect(finished!.warningCount).toBeGreaterThan(0);

    const tasks = await repository.listAgentTasksForScan(scan.id);
    const failed = tasks.find((task) => task.agentKey === "WEB_DISCOVERY")!;
    expect(failed.status).toBe("FAILED");
    expect(failed.attempt).toBe(2);
    expect(failed.errorMessage).toContain("Injected failure");
    // A failed task produced no output, and says so rather than implying one.
    expect(failed.outputSummary).toContain("failed");

    const events = await repository.listAuditEventsForEntity("AGENT_TASK", failed.id, 20);
    expect(events.some((event) => event.action === "AGENT_TASK_RETRIED")).toBe(true);
    expect(events.some((event) => event.action === "AGENT_TASK_FAILED")).toBe(true);
  }, 120_000);

  it("does not retry a non-retryable failure", async () => {
    const { scan } = await setUpScan(repository, ["SEARCH_INDEX"]);
    const providers = createProviderRegistry(getEnv());

    let attempts = 0;
    providers.search = {
      descriptor: { ...providers.search.descriptor, id: "hard-failing-search" },
      async search() {
        attempts += 1;
        return {
          ok: false as const,
          error: {
            code: "NOT_CONFIGURED" as const,
            message: "Injected non-retryable failure.",
            retryable: false,
          },
          metadata: {
            providerId: "hard-failing-search",
            origin: "SIMULATED_DEMO" as const,
            durationMs: 1,
            warnings: [],
          },
        };
      },
    };

    const failing = new ScanOrchestrator({
      scan,
      actor: { id: "test-actor", name: "Test Actor" },
      repository,
      providers,
      requestId: "test-hard-failure",
      timeoutMs: 30_000,
      maxAttemptsPerTask: 3,
    });

    await failing.prepare();
    await failing.run_();

    expect(attempts).toBe(1);
  }, 120_000);

  it("reconciles a scan orphaned by a restart instead of leaving it 'running'", async () => {
    const { scan } = await setUpScan(repository);
    await repository.updateScan(scan.id, {
      status: "RUNNING",
      startedAt: new Date().toISOString(),
    });

    const reconciled = await reconcileOrphanedScans(repository);
    expect(reconciled).toBeGreaterThanOrEqual(1);

    const after = await repository.getScanById(scan.id);
    expect(after!.status).toBe("FAILED");
    expect(after!.errorMessage).toContain("Interrupted");

    const events = await repository.listAuditEventsForEntity("SCAN", scan.id, 20);
    expect(events.some((event) => event.reason?.includes("Reconciled on startup"))).toBe(true);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Regulatory safety — the highest-stakes behaviour in the pipeline.
// ---------------------------------------------------------------------------

describe("regulatory source safety", () => {
  const context = (signal: AbortSignal) => ({
    requestId: "test",
    signal,
    timeoutMs: 10_000,
  });

  it("refuses to simulate the content of a real authority", async () => {
    const provider = new MockRegulatorySourceProvider();
    const result = await provider.check(
      {
        source: {
          sourceId: "sebi-real",
          authorityShortName: "SEBI",
          title: "SEBI — investor cautions",
          sourceUrl: "https://www.sebi.gov.in/anything",
          isFixtureSource: false,
        },
        terms: [{ term: "quotex.com", domainId: "d1", kind: "domain" }],
      },
      context(new AbortController().signal),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("BLOCKED_BY_POLICY");
      expect(result.error.message).toContain("Refused to simulate");
      expect(result.error.message).toContain("false regulatory record");
    }
  });

  it("classifies only reserved .invalid hosts as fixture sources", () => {
    expect(isFixtureSourceUrl("https://regulator.invalid/simulated/warning-list")).toBe(true);
    expect(isFixtureSourceUrl("https://www.sebi.gov.in/x")).toBe(false);
    expect(isFixtureSourceUrl("https://www.rbi.org.in/x")).toBe(false);
    expect(isFixtureSourceUrl("https://www.cert-in.org.in/")).toBe(false);
    expect(isFixtureSourceUrl("not a url")).toBe(false);
  });

  it("records a no-match result as a checked non-match, never as authorisation", async () => {
    const provider = new MockRegulatorySourceProvider();
    const result = await provider.check(
      {
        source: {
          sourceId: "fixture-register",
          authorityShortName: "DEMO-SIM",
          title: "Simulated authorised-entity register",
          sourceUrl: "https://regulator.invalid/simulated/authorised-register",
          isFixtureSource: true,
        },
        terms: [
          { term: "quotex.com", domainId: "d1", kind: "domain" },
          { term: "quotex.com.in", domainId: "d2", kind: "domain" },
        ],
      },
      context(new AbortController().signal),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.matches).toEqual([]);
      expect(result.data.checkedWithoutMatch).toHaveLength(2);
      expect(result.data.note).toContain("does NOT mean the entity is unauthorised");
      expect(result.data.note).toContain("does NOT mean it is authorised");
    }
  }, 30_000);

  it("records a failed retrieval as a failure, not as an absence of matches", async () => {
    const provider = new MockRegulatorySourceProvider();
    const result = await provider.check(
      {
        source: {
          sourceId: "fixture-offline",
          authorityShortName: "DEMO-SIM",
          title: "Simulated unreachable source",
          sourceUrl: "https://regulator.invalid/simulated/offline-feed",
          isFixtureSource: true,
        },
        terms: [{ term: "quotex.com", domainId: "d1", kind: "domain" }],
      },
      context(new AbortController().signal),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("failed retrieval");
      expect(result.error.message).toContain("no information");
    }
  }, 30_000);
});
