import { describe, expect, it } from "vitest";

import { buildSeedDataset } from "@/lib/demo/seed";
import { computeOverviewMetrics } from "@/lib/repositories/dataset";
import { DEMO_BASE_INSTANT } from "@/lib/utils/deterministic";

/**
 * These are not just smoke tests. Several of them encode the product's
 * honesty invariants, so a future change to the fixtures that quietly
 * fabricates a regulatory warning or marks simulated data as live will fail
 * the build rather than ship.
 */

const NOW = DEMO_BASE_INSTANT.getTime();
const REAL_AUTHORITIES = new Set(["SEBI", "RBI", "CERT-In"]);

describe("demo seed dataset", () => {
  it("builds every collection", async () => {
    const data = await buildSeedDataset();

    expect(data.users).toHaveLength(4);
    expect(data.platforms).toHaveLength(2);
    expect(data.discoverySources.length).toBeGreaterThanOrEqual(7);
    expect(data.domains).toHaveLength(45);
    expect(data.scans).toHaveLength(6);
    expect(data.agentTasks.length).toBeGreaterThan(20);
    expect(data.relationships.length).toBeGreaterThanOrEqual(20);
    expect(data.regulatorySources.length).toBeGreaterThanOrEqual(8);
    expect(data.reports).toHaveLength(6);
    expect(data.auditEvents.length).toBeGreaterThanOrEqual(100);
    expect(data.settings.length).toBeGreaterThanOrEqual(15);
    expect(data.evidence.length).toBeGreaterThan(100);
  });

  it("is deterministic apart from password hashes", async () => {
    const [first, second] = await Promise.all([buildSeedDataset(), buildSeedDataset()]);

    const strip = (dataset: Awaited<ReturnType<typeof buildSeedDataset>>) => ({
      ...dataset,
      users: dataset.users.map(({ passwordHash: _hash, ...rest }) => rest),
    });

    expect(JSON.stringify(strip(first))).toEqual(JSON.stringify(strip(second)));
  });

  it("covers every scan status except the two that only exist while running", async () => {
    const data = await buildSeedDataset();
    const statuses = new Set(data.scans.map((scan) => scan.status));

    expect(statuses).toContain("COMPLETED");
    expect(statuses).toContain("COMPLETED_WITH_WARNINGS");
    expect(statuses).toContain("FAILED");
    expect(statuses).toContain("CANCELLED");
    // QUEUED and RUNNING are deliberately not seeded: a scan frozen in
    // "running" forever would misrepresent the state of the system.
    expect(statuses).not.toContain("RUNNING");
  });

  it("covers every report workflow state", async () => {
    const data = await buildSeedDataset();
    const statuses = new Set(data.reports.map((report) => report.status));

    for (const expected of [
      "DRAFT",
      "AWAITING_REVIEW",
      "APPROVED",
      "SUBMITTED",
      "RESPONSE_RECEIVED",
      "ACTION_CONFIRMED",
    ]) {
      expect(statuses).toContain(expected);
    }
  });

  it("uses all five evidence labels", async () => {
    const data = await buildSeedDataset();
    const kinds = new Set(data.evidence.map((item) => item.kind));

    for (const expected of [
      "OBSERVED_FACT",
      "INFERRED_RELATIONSHIP",
      "OFFICIAL_SOURCE_MATCH",
      "REVIEWER_ASSESSMENT",
      "UNVERIFIED_CLAIM",
    ]) {
      expect(kinds).toContain(expected);
    }
  });

  it("uses every relationship type", async () => {
    const data = await buildSeedDataset();
    const types = new Set(data.relationships.map((relationship) => relationship.type));

    for (const expected of [
      "REDIRECTS_TO",
      "SHARES_CERTIFICATE_CHARACTERISTIC",
      "SIMILAR_WEBSITE_CONTENT",
      "APPEARS_IN_SAME_OFFICIAL_REPORT",
      "SUSPECTED_BRAND_RELATIONSHIP",
      "CONFIRMED_RELATIONSHIP",
    ]) {
      expect(types).toContain(expected);
    }
  });

  it("includes unrelated domains so triage and filtering are demonstrable", async () => {
    const data = await buildSeedDataset();
    const dismissed = data.domains.filter(
      (domain) => domain.reviewStatus === "NOT_RELATED" || domain.reviewStatus === "DISMISSED",
    );
    expect(dismissed.length).toBeGreaterThanOrEqual(8);
  });

  it("leaves never-checked domains genuinely unchecked", async () => {
    const data = await buildSeedDataset();
    const unchecked = data.domains.filter((domain) => domain.dnsStatus === null);

    expect(unchecked.length).toBeGreaterThanOrEqual(7);
    for (const domain of unchecked) {
      // "Not checked" must mean every observation field is absent, not that
      // the check ran and found nothing.
      expect(domain.dnsCheckedAt).toBeNull();
      expect(domain.httpStatusCode).toBeNull();
      expect(domain.httpCheckedAt).toBeNull();
      expect(domain.siteTitle).toBeNull();
      expect(domain.lastCheckedAt).toBeNull();
      expect(domain.evidenceCompleteness).toBe(0);
    }
  });

  // --- honesty invariants ------------------------------------------------

  it("tags every record as simulated demo data", async () => {
    const data = await buildSeedDataset();
    const records = [
      ...data.domains,
      ...data.evidence,
      ...data.relationships,
      ...data.regulatoryMatches,
      ...data.regulatorySources,
      ...data.regulatorySourceChecks,
      ...data.scans,
      ...data.reports,
      ...data.platforms,
    ];

    const live = records.filter((record) => record.origin !== "SIMULATED_DEMO");
    expect(live).toEqual([]);
  });

  it("never fabricates a match or a check against a real authority", async () => {
    const data = await buildSeedDataset();
    const realSourceIds = new Set(
      data.regulatorySources
        .filter((source) => REAL_AUTHORITIES.has(source.authorityShortName))
        .map((source) => source.id),
    );

    expect(realSourceIds.size).toBeGreaterThanOrEqual(5);
    expect(
      data.regulatoryMatches.filter((match) => realSourceIds.has(match.regulatorySourceId)),
    ).toEqual([]);
    expect(
      data.regulatorySourceChecks.filter((check) =>
        realSourceIds.has(check.regulatorySourceId),
      ),
    ).toEqual([]);

    for (const source of data.regulatorySources) {
      if (!REAL_AUTHORITIES.has(source.authorityShortName)) continue;
      expect(source.lastSuccessfulCheckAt).toBeNull();
      expect(source.matchedEntityCount).toBe(0);
      expect(["NEVER_CHECKED", "DISABLED"]).toContain(source.retrievalStatus);
    }
  });

  it("points every simulated match at a reserved .invalid fixture host", async () => {
    const data = await buildSeedDataset();
    expect(data.regulatoryMatches.length).toBeGreaterThan(0);
    for (const match of data.regulatoryMatches) {
      expect(new URL(match.sourceUrl).hostname.endsWith(".invalid")).toBe(true);
    }
  });

  it("states limitations on every inferred relationship", async () => {
    const data = await buildSeedDataset();
    for (const relationship of data.relationships) {
      expect(relationship.limitations.length).toBeGreaterThan(20);
      expect(relationship.rationale.length).toBeGreaterThan(20);
    }
  });

  it("disclaims ownership on every shared-infrastructure relationship", async () => {
    const data = await buildSeedDataset();
    const infrastructureEdges = data.relationships.filter(
      (relationship) => relationship.type === "SHARES_CERTIFICATE_CHARACTERISTIC",
    );

    expect(infrastructureEdges.length).toBeGreaterThan(0);
    for (const edge of infrastructureEdges) {
      expect(edge.limitations.toLowerCase()).toMatch(/not .*(evidence|establish|support)/);
      expect(edge.limitations.toLowerCase()).toContain("ownership");
    }
  });

  it("requires every report to state its limitations", async () => {
    const data = await buildSeedDataset();
    for (const report of data.reports) {
      expect(report.limitations.length).toBeGreaterThan(200);
      expect(report.limitations).toContain("not");
      expect(report.methodology.length).toBeGreaterThan(100);
    }
  });

  it("only marks a report submitted when the workflow records it", async () => {
    const data = await buildSeedDataset();
    const submitted = data.reports.filter((report) =>
      ["SUBMITTED", "RESPONSE_RECEIVED", "ACTION_CONFIRMED", "CLOSED"].includes(report.status),
    );

    expect(submitted.length).toBeGreaterThan(0);
    for (const report of submitted) {
      expect(report.submittedAt).not.toBeNull();
      expect(report.submissionReference).toBeTruthy();
      // Submission always follows an internal approval by a named reviewer.
      expect(report.approvedById).not.toBeNull();
      expect(report.approvedAt).not.toBeNull();
    }
  });

  it("only counts a confirmed official action when a reviewer recorded one", async () => {
    const data = await buildSeedDataset();
    const metrics = computeOverviewMetrics(data, NOW);

    const confirmed = data.reports.filter(
      (report) => report.outcomeConfirmedAt !== null && report.outcomeSummary !== null,
    );
    expect(metrics.confirmedOfficialActions).toBe(confirmed.length);
    expect(metrics.confirmedOfficialActions).toBeGreaterThan(0);
    for (const report of confirmed) {
      expect(report.status).toBe("ACTION_CONFIRMED");
      expect(report.outcomeSummary).toContain("SIMULATED");
    }
  });
});

describe("overview metrics derived from the seed", () => {
  it("computes every figure from the dataset rather than a constant", async () => {
    const data = await buildSeedDataset();
    const metrics = computeOverviewMetrics(data, NOW);

    expect(metrics.totalDomainsDiscovered).toBe(data.domains.length);
    expect(metrics.reportsPrepared).toBe(data.reports.length);
    expect(metrics.simulatedDomainCount).toBe(data.domains.length);
    expect(metrics.liveCollectedDomainCount).toBe(0);

    expect(metrics.domainsAwaitingReview).toBe(
      data.domains.filter((domain) =>
        ["AWAITING_REVIEW", "UNDER_REVIEW", "NEEDS_MORE_EVIDENCE"].includes(domain.reviewStatus),
      ).length,
    );

    const distributionTotal = metrics.reviewStatusDistribution.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    expect(distributionTotal).toBe(data.domains.length);
  });

  it("produces populated charts", async () => {
    const data = await buildSeedDataset();
    const metrics = computeOverviewMetrics(data, NOW);

    expect(metrics.discoveriesOverTime).toHaveLength(30);
    expect(metrics.discoveriesOverTime.filter((day) => day.discovered > 0).length).toBeGreaterThan(5);
    expect(metrics.scanActivity.filter((day) => day.total > 0).length).toBeGreaterThanOrEqual(4);
    expect(metrics.discoverySourceContribution.length).toBeGreaterThanOrEqual(5);
    expect(metrics.agentExecutionSummary.length).toBe(6);
    expect(metrics.recentDiscoveries.length).toBe(8);
    expect(metrics.latestRegulatoryChecks.length).toBeGreaterThan(0);
  });

  it("spreads evidence completeness across buckets", async () => {
    const data = await buildSeedDataset();
    const metrics = computeOverviewMetrics(data, NOW);

    const populated = metrics.evidenceCompleteness.buckets.filter((bucket) => bucket.count > 0);
    expect(populated.length).toBeGreaterThanOrEqual(3);
    expect(metrics.evidenceCompleteness.averagePercent).toBeGreaterThan(0);
    expect(metrics.evidenceCompleteness.averagePercent).toBeLessThan(100);
  });
});
