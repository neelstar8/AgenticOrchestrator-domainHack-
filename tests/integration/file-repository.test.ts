import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFileRepository } from "@/lib/repositories/file-repository";
import type { FileRepository } from "@/lib/repositories/file-repository";
import { AppendOnlyViolationError } from "@/lib/repositories/types";

let dataDir: string;
let repository: FileRepository;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "sentinel-test-"));
  repository = createFileRepository({ dataDir, isolated: true });
  await repository.initialize();
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("FileRepository persistence", () => {
  it("seeds on first access and writes one JSON file per collection", async () => {
    const domains = await repository.listDomains({ pageSize: 100 });
    expect(domains.total).toBe(45);

    const raw = await readFile(path.join(dataDir, "domains.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed as unknown[]).length).toBe(45);

    const meta: unknown = JSON.parse(await readFile(path.join(dataDir, "_meta.json"), "utf8"));
    expect(meta).toMatchObject({ schemaVersion: 1 });
  });

  it("reloads persisted data in a fresh repository instance", async () => {
    const created = await repository.upsertDomain({
      fqdn: "round-trip-demo.example",
      observedAt: new Date().toISOString(),
      origin: "SIMULATED_DEMO",
      siteTitle: "Round trip",
    });
    expect(created.created).toBe(true);

    const reopened = createFileRepository({ dataDir, isolated: true });
    await reopened.initialize();
    const found = await reopened.getDomainByFqdn("round-trip-demo.example");
    expect(found?.siteTitle).toBe("Round trip");
  });

  it("serialises concurrent writes without losing updates", async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        repository.appendAuditEvent({
          actorId: null,
          actorLabel: "concurrency test",
          action: "DOMAIN_UPDATED",
          entityType: "DOMAIN",
          entityId: `concurrent-${index}`,
        }),
      ),
    );

    const events = await repository.listAuditEvents({
      search: "concurrency test",
      pageSize: 100,
    });
    expect(events.total).toBe(25);
  });
});

describe("FileRepository domain deduplication", () => {
  it("merges a repeat observation into the existing record", async () => {
    const first = await repository.upsertDomain({
      fqdn: "HTTPS://Dedup-Demo.Example./some/path",
      observedAt: "2026-10-01T00:00:00.000Z",
      origin: "SIMULATED_DEMO",
      discoverySources: [{ sourceKey: "search-index", observedAt: "2026-10-01T00:00:00.000Z" }],
    });
    expect(first.created).toBe(true);
    expect(first.domain.fqdn).toBe("dedup-demo.example");

    const second = await repository.upsertDomain({
      fqdn: "dedup-demo.example",
      observedAt: "2026-10-05T00:00:00.000Z",
      origin: "SIMULATED_DEMO",
      httpStatusCode: 200,
      discoverySources: [
        { sourceKey: "domain-variation", observedAt: "2026-10-05T00:00:00.000Z" },
      ],
    });
    expect(second.created).toBe(false);
    expect(second.domain.id).toBe(first.domain.id);
    expect(second.domain.firstSeenAt).toBe("2026-10-01T00:00:00.000Z");
    expect(second.domain.lastSeenAt).toBe("2026-10-05T00:00:00.000Z");
    expect(second.domain.httpStatusCode).toBe(200);

    const detail = await repository.getDomainDetail(first.domain.id);
    expect(detail?.discoverySources.map((source) => source.key).sort()).toEqual([
      "domain-variation",
      "search-index",
    ]);
  });

  it("never overwrites an existing observation with an omitted field", async () => {
    await repository.upsertDomain({
      fqdn: "preserve-demo.example",
      observedAt: "2026-10-01T00:00:00.000Z",
      origin: "SIMULATED_DEMO",
      dnsStatus: "RESOLVED",
      httpStatusCode: 200,
      siteTitle: "Original title",
    });

    // A later observation that only carries a redirect must not erase the
    // earlier DNS and HTTP facts.
    const merged = await repository.upsertDomain({
      fqdn: "preserve-demo.example",
      observedAt: "2026-10-02T00:00:00.000Z",
      origin: "SIMULATED_DEMO",
      redirectsToUrl: "https://elsewhere-demo.example/",
    });

    expect(merged.domain.dnsStatus).toBe("RESOLVED");
    expect(merged.domain.httpStatusCode).toBe(200);
    expect(merged.domain.siteTitle).toBe("Original title");
    expect(merged.domain.redirectsToUrl).toBe("https://elsewhere-demo.example/");
  });

  it("leaves a never-observed domain explicitly unchecked", async () => {
    const { domain } = await repository.upsertDomain({
      fqdn: "unchecked-demo.example",
      observedAt: "2026-10-01T00:00:00.000Z",
      origin: "SIMULATED_DEMO",
    });

    expect(domain.dnsStatus).toBeNull();
    expect(domain.dnsCheckedAt).toBeNull();
    expect(domain.httpStatusCode).toBeNull();
    expect(domain.lastCheckedAt).toBeNull();
    expect(domain.evidenceCompleteness).toBe(0);
  });

  it("rejects an IP address as a registry entry", async () => {
    await expect(
      repository.upsertDomain({
        fqdn: "203.0.113.10",
        observedAt: new Date().toISOString(),
        origin: "SIMULATED_DEMO",
      }),
    ).rejects.toThrow(/IP address/);
  });
});

describe("FileRepository audit log", () => {
  it("exposes no update or delete operation", () => {
    const surface = repository as unknown as Record<string, unknown>;
    expect(surface.updateAuditEvent).toBeUndefined();
    expect(surface.deleteAuditEvent).toBeUndefined();
    expect(typeof surface.appendAuditEvent).toBe("function");
  });

  it("records an append-only violation type for callers that try", () => {
    const error = new AppendOnlyViolationError("AuditEvent", "update");
    expect(error.message).toMatch(/append-only/);
  });

  it("recomputes evidence completeness when evidence is added", async () => {
    const { domain } = await repository.upsertDomain({
      fqdn: "completeness-demo.example",
      observedAt: "2026-10-01T00:00:00.000Z",
      origin: "SIMULATED_DEMO",
      dnsStatus: "RESOLVED",
    });
    expect(domain.evidenceCompleteness).toBe(15);

    await repository.createEvidence({
      domainId: domain.id,
      kind: "OBSERVED_FACT",
      title: "HTTP response 200",
      description: "Observed.",
      sourceUrl: "https://completeness-demo.example/",
      collectedAt: "2026-10-01T00:00:00.000Z",
      collectionMethod: "HTTP_RESPONSE",
      origin: "SIMULATED_DEMO",
    });

    const updated = await repository.getDomainById(domain.id);
    expect(updated?.evidenceCompleteness).toBe(30);
  });
});

describe("FileRepository queries", () => {
  it("filters, sorts and paginates domains", async () => {
    const page = await repository.listDomains({
      reviewStatus: ["NOT_RELATED", "DISMISSED"],
      sortBy: "fqdn",
      sortDirection: "asc",
      pageSize: 5,
    });

    expect(page.total).toBeGreaterThanOrEqual(8);
    expect(page.items).toHaveLength(5);
    expect(page.pageCount).toBeGreaterThan(1);

    const fqdns = page.items.map((item) => item.fqdn);
    expect([...fqdns].sort()).toEqual(fqdns);
  });

  it("searches across fqdn, brand and title", async () => {
    const byBrand = await repository.listDomains({ search: "binarix", pageSize: 100 });
    expect(byBrand.total).toBe(5);
  });

  it("returns a composed domain detail", async () => {
    const detail = await repository.getDomainDetail("quotex.net.in");

    expect(detail).not.toBeNull();
    expect(detail?.evidence.length).toBeGreaterThan(0);
    expect(detail?.relationships.length).toBeGreaterThan(0);
    expect(detail?.auditEvents.length).toBeGreaterThan(0);
    expect(detail?.seedPlatform?.name).toBe("Quotex Investigation Demo");
    // Every evidence item carries a label and a collection timestamp.
    for (const item of detail?.evidence ?? []) {
      expect(item.kind).toBeTruthy();
      expect(item.collectedAt).toBeTruthy();
      expect(item.origin).toBe("SIMULATED_DEMO");
    }
  });

  it("builds a relationship graph with reachability from a focus node", async () => {
    const seed = await repository.getDomainByFqdn("quotex.com.in");
    expect(seed).not.toBeNull();

    const graph = await repository.getRelationshipGraph({
      focusDomainId: seed!.id,
      depth: 1,
    });

    expect(graph.nodes.length).toBeGreaterThan(1);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.nodes.some((node) => node.isFocus)).toBe(true);
    for (const edge of graph.edges) {
      expect(edge.limitations.length).toBeGreaterThan(0);
    }
  });

  it("resets back to the seeded dataset", async () => {
    await repository.upsertDomain({
      fqdn: "temporary-demo.example",
      observedAt: new Date().toISOString(),
      origin: "SIMULATED_DEMO",
    });
    expect(await repository.getDomainByFqdn("temporary-demo.example")).not.toBeNull();

    await repository.resetToSeed();

    expect(await repository.getDomainByFqdn("temporary-demo.example")).toBeNull();
    expect((await repository.listDomains({ pageSize: 100 })).total).toBe(45);
  });
});
