/**
 * Demo scan history fixtures.
 *
 * All six scan statuses exist in the application. Five are seeded here as
 * completed history. QUEUED and RUNNING are deliberately NOT seeded: a scan
 * frozen in "running" that will never progress would be a lie about the state
 * of the system. Start a scan from the UI to observe those two states live.
 */

import type { AgentKey, DiscoveryScope, ScanProfile, ScanStatus } from "@/lib/types/enums";

export interface AgentTaskSpec {
  agentKey: AgentKey;
  title: string;
  status: "COMPLETED" | "COMPLETED_WITH_WARNINGS" | "FAILED" | "SKIPPED" | "CANCELLED";
  durationMs: number;
  attempt?: number;
  outputSummary: string;
  metrics?: Record<string, number>;
  errorMessage?: string;
  hasWarnings?: boolean;
}

export interface ScanSpec {
  reference: string;
  platform: "quotex" | "binarix";
  platformNameInput: string;
  seedDomain: string | null;
  notes: string | null;
  profile: ScanProfile;
  scopes: DiscoveryScope[];
  maxCandidates: number;
  initiatedBy: "admin" | "investigator" | "reviewer";
  status: ScanStatus;
  startedDaysAgo: number;
  durationSeconds: number;
  candidatesFound: number;
  candidatesRequiringReview: number;
  warningCount: number;
  errorMessage?: string;
  /** Domains (by FQDN) attributed to this scan as their discovering scan. */
  discoveredFqdns: string[];
  tasks: AgentTaskSpec[];
}

const ALL_SCOPES: DiscoveryScope[] = [
  "SEARCH_INDEX",
  "DOMAIN_VARIATIONS",
  "CERTIFICATE_TRANSPARENCY",
  "TECHNICAL_INSPECTION",
  "REGULATORY_MATCHING",
  "RELATED_DOMAIN_ANALYSIS",
];

export const SCAN_SPECS: ScanSpec[] = [
  {
    reference: "SNT-SCN-2026-0101",
    platform: "quotex",
    platformNameInput: "Quotex",
    seedDomain: "quotex.com",
    notes:
      "Initial comprehensive sweep for the Quotex Investigation Demo. Simulated run; findings are synthetic.",
    profile: "COMPREHENSIVE",
    scopes: ALL_SCOPES,
    maxCandidates: 120,
    initiatedBy: "investigator",
    status: "COMPLETED",
    startedDaysAgo: 26,
    durationSeconds: 184,
    candidatesFound: 21,
    candidatesRequiringReview: 14,
    warningCount: 0,
    discoveredFqdns: [
      "quotex.com",
      "quotex.com.in",
      "quotex.net.in",
      "www.quotex.com",
      "quotex-india-demo.com",
      "quotexindia-demo.net",
      "quotex-login-demo.com",
      "app.quotex.com.in",
      "login.quotex.net.in",
      "quotex-trade-demo.co.in",
      "quotexpro-demo.com",
      "qu0tex-demo.com",
      "marketnews-review-demo.com",
      "tradingforum-demo.org",
      "quotexpertise-demo.com",
      "parked-listing-demo.in",
      "brokerreviews-demo.net",
      "quotation-express-demo.com",
      "regulatory-archive-demo.org",
      "shared-cdn-demo.net",
      "quotex-official-demo.in",
    ],
    tasks: [
      {
        agentKey: "WEB_DISCOVERY",
        title: "Discover candidate URLs from configured search providers",
        status: "COMPLETED",
        durationMs: 21_400,
        outputSummary:
          "Simulated search provider returned 34 result URLs across 11 distinct hostnames.",
        metrics: { resultsReturned: 34, distinctHosts: 11, queriesIssued: 6 },
      },
      {
        agentKey: "DOMAIN_ENUMERATION",
        title: "Generate and validate candidate domain variations",
        status: "COMPLETED",
        durationMs: 28_900,
        outputSummary:
          "Generated 58 bounded candidates; 13 were confirmed by the simulated resolver, 45 remain unverified.",
        metrics: { candidatesGenerated: 58, candidatesResolved: 13, candidatesUnverified: 45 },
      },
      {
        agentKey: "WEBSITE_INSPECTION",
        title: "Inspect public page metadata and redirects",
        status: "COMPLETED",
        durationMs: 54_200,
        outputSummary:
          "Inspected 18 hosts. Recorded 16 page titles, 2 redirects and 3 non-200 responses as observed facts.",
        metrics: { hostsInspected: 18, titlesRecorded: 16, redirectsObserved: 2, nonOkResponses: 3 },
      },
      {
        agentKey: "REGULATORY_VERIFICATION",
        title: "Compare entities against configured official sources",
        status: "COMPLETED",
        durationMs: 31_700,
        outputSummary:
          "Checked 21 entities against 4 enabled fixture sources. 3 matches recorded, 18 explicit non-matches. Real authority sources were not retrieved because live fetching is disabled.",
        metrics: { entitiesChecked: 21, matchesFound: 3, explicitNonMatches: 18, sourcesSkipped: 5 },
      },
      {
        agentKey: "RELATIONSHIP_ANALYSIS",
        title: "Correlate candidates into explainable relationships",
        status: "COMPLETED",
        durationMs: 26_800,
        outputSummary:
          "Proposed 14 relationships with stated confidence and limitations. None asserts shared ownership.",
        metrics: { relationshipsProposed: 14, averageConfidence: 63 },
      },
      {
        agentKey: "EVIDENCE_REPORTING",
        title: "Consolidate evidence and score completeness",
        status: "COMPLETED",
        durationMs: 21_000,
        outputSummary:
          "Scored 21 candidates. 6 have enough evidence to support a report draft; 15 are missing at least one required factor.",
        metrics: { candidatesScored: 21, reportable: 6, missingFactors: 15 },
      },
    ],
  },
  {
    reference: "SNT-SCN-2026-0102",
    platform: "quotex",
    platformNameInput: "Quotex India",
    seedDomain: "quotex.com.in",
    notes: "Follow-up sweep focused on the .in variants. Simulated run.",
    profile: "QUICK",
    scopes: ["SEARCH_INDEX", "DOMAIN_VARIATIONS", "TECHNICAL_INSPECTION", "REGULATORY_MATCHING"],
    maxCandidates: 60,
    initiatedBy: "investigator",
    status: "COMPLETED_WITH_WARNINGS",
    startedDaysAgo: 16,
    durationSeconds: 97,
    candidatesFound: 9,
    candidatesRequiringReview: 6,
    warningCount: 2,
    discoveredFqdns: [
      "quotex-signup-demo.net",
      "quotexglobal-demo.trade",
      "quotex-partner-demo.co",
      "trade-quotex-demo.online",
      "quotex-cabinet-demo.site",
      "quotexbroker-demo.info",
      "my.quotex-india-demo.com",
      "promo.quotexindia-demo.net",
      "quotex-mirror-demo.xyz",
    ],
    tasks: [
      {
        agentKey: "WEB_DISCOVERY",
        title: "Discover candidate URLs from configured search providers",
        status: "COMPLETED",
        durationMs: 18_300,
        outputSummary: "Simulated search provider returned 19 result URLs across 7 hostnames.",
        metrics: { resultsReturned: 19, distinctHosts: 7, queriesIssued: 4 },
      },
      {
        agentKey: "DOMAIN_ENUMERATION",
        title: "Generate and validate candidate domain variations",
        status: "COMPLETED_WITH_WARNINGS",
        durationMs: 24_100,
        hasWarnings: true,
        outputSummary:
          "Generated 44 candidates. The simulated resolver timed out on 6 names, which are recorded as unchecked rather than as non-existent.",
        metrics: { candidatesGenerated: 44, candidatesResolved: 7, resolverTimeouts: 6 },
      },
      {
        agentKey: "WEBSITE_INSPECTION",
        title: "Inspect public page metadata and redirects",
        status: "COMPLETED_WITH_WARNINGS",
        durationMs: 33_600,
        hasWarnings: true,
        outputSummary:
          "Inspected 9 hosts. One host exceeded the response-size limit and was abandoned; that is recorded as a failed check.",
        metrics: { hostsInspected: 9, titlesRecorded: 7, sizeLimitAbandoned: 1 },
      },
      {
        agentKey: "REGULATORY_VERIFICATION",
        title: "Compare entities against configured official sources",
        status: "COMPLETED",
        durationMs: 21_000,
        outputSummary:
          "Checked 9 entities against 4 enabled fixture sources. 1 low-confidence brand-token match recorded.",
        metrics: { entitiesChecked: 9, matchesFound: 1, explicitNonMatches: 8 },
      },
    ],
  },
  {
    reference: "SNT-SCN-2026-0103",
    platform: "quotex",
    platformNameInput: "Quotex",
    seedDomain: "quotex-trade-demo.co.in",
    notes: "Targeted re-check of a candidate that previously returned 403. Simulated run.",
    profile: "QUICK",
    scopes: ["TECHNICAL_INSPECTION", "RELATED_DOMAIN_ANALYSIS"],
    maxCandidates: 25,
    initiatedBy: "investigator",
    status: "FAILED",
    startedDaysAgo: 9,
    durationSeconds: 38,
    candidatesFound: 0,
    candidatesRequiringReview: 0,
    warningCount: 1,
    errorMessage:
      "Simulated failure: the website-inspection task exhausted its 2 permitted attempts. The upstream host closed the connection before any response headers were received. No candidate data was produced, and nothing has been inferred from the failure.",
    discoveredFqdns: [],
    tasks: [
      {
        agentKey: "WEBSITE_INSPECTION",
        title: "Inspect public page metadata and redirects",
        status: "FAILED",
        durationMs: 29_400,
        attempt: 2,
        hasWarnings: true,
        errorMessage:
          "Simulated transport error on attempt 2 of 2: connection reset before response headers. Recorded as a failed check — not as evidence that the host is offline or that the candidate is invalid.",
        outputSummary: "No page metadata could be collected.",
        metrics: { attempts: 2, hostsInspected: 0 },
      },
      {
        agentKey: "RELATIONSHIP_ANALYSIS",
        title: "Correlate candidates into explainable relationships",
        status: "SKIPPED",
        durationMs: 0,
        outputSummary: "Skipped: the upstream inspection task produced no input to correlate.",
      },
    ],
  },
  {
    reference: "SNT-SCN-2026-0104",
    platform: "quotex",
    platformNameInput: "Quotex",
    seedDomain: "quotex.com",
    notes: "Broad sweep cancelled by the operator after the discovery stage. Simulated run.",
    profile: "COMPREHENSIVE",
    scopes: ALL_SCOPES,
    maxCandidates: 200,
    initiatedBy: "admin",
    status: "CANCELLED",
    startedDaysAgo: 6,
    durationSeconds: 42,
    candidatesFound: 4,
    candidatesRequiringReview: 4,
    warningCount: 0,
    discoveredFqdns: [
      "quotex-alt-demo-01.com",
      "quotex-alt-demo-02.net",
      "quotex-alt-demo-03.site",
      "quotex-support-demo.biz",
    ],
    tasks: [
      {
        agentKey: "WEB_DISCOVERY",
        title: "Discover candidate URLs from configured search providers",
        status: "COMPLETED",
        durationMs: 19_800,
        outputSummary: "Simulated search provider returned 8 result URLs across 4 hostnames.",
        metrics: { resultsReturned: 8, distinctHosts: 4 },
      },
      {
        agentKey: "DOMAIN_ENUMERATION",
        title: "Generate and validate candidate domain variations",
        status: "CANCELLED",
        durationMs: 11_200,
        outputSummary:
          "Cancelled by the operator mid-task. Candidates generated before cancellation were kept and are marked unchecked.",
        metrics: { candidatesGenerated: 17, candidatesResolved: 0 },
      },
      {
        agentKey: "WEBSITE_INSPECTION",
        title: "Inspect public page metadata and redirects",
        status: "CANCELLED",
        durationMs: 0,
        outputSummary: "Not started: the scan was cancelled.",
      },
      {
        agentKey: "REGULATORY_VERIFICATION",
        title: "Compare entities against configured official sources",
        status: "CANCELLED",
        durationMs: 0,
        outputSummary: "Not started: the scan was cancelled.",
      },
      {
        agentKey: "RELATIONSHIP_ANALYSIS",
        title: "Correlate candidates into explainable relationships",
        status: "CANCELLED",
        durationMs: 0,
        outputSummary: "Not started: the scan was cancelled.",
      },
      {
        agentKey: "EVIDENCE_REPORTING",
        title: "Consolidate evidence and score completeness",
        status: "CANCELLED",
        durationMs: 0,
        outputSummary: "Not started: the scan was cancelled.",
      },
    ],
  },
  {
    reference: "SNT-SCN-2026-0105",
    platform: "binarix",
    platformNameInput: "Binarix",
    seedDomain: "binarix-demo.com",
    notes: "Second demonstration investigation, used to show platform filtering. Simulated run.",
    profile: "QUICK",
    scopes: ["SEARCH_INDEX", "DOMAIN_VARIATIONS", "CERTIFICATE_TRANSPARENCY", "TECHNICAL_INSPECTION"],
    maxCandidates: 40,
    initiatedBy: "admin",
    status: "COMPLETED",
    startedDaysAgo: 7,
    durationSeconds: 76,
    candidatesFound: 5,
    candidatesRequiringReview: 4,
    warningCount: 0,
    discoveredFqdns: [
      "binarix-demo.com",
      "binarix-trade-demo.in",
      "app.binarix-demo.com",
      "binarix-login-demo.net",
      "binarixpro-demo.co.in",
    ],
    tasks: [
      {
        agentKey: "WEB_DISCOVERY",
        title: "Discover candidate URLs from configured search providers",
        status: "COMPLETED",
        durationMs: 16_200,
        outputSummary: "Simulated search provider returned 11 result URLs across 4 hostnames.",
        metrics: { resultsReturned: 11, distinctHosts: 4 },
      },
      {
        agentKey: "DOMAIN_ENUMERATION",
        title: "Generate and validate candidate domain variations",
        status: "COMPLETED",
        durationMs: 20_400,
        outputSummary: "Generated 31 candidates; 4 confirmed by the simulated resolver.",
        metrics: { candidatesGenerated: 31, candidatesResolved: 4 },
      },
      {
        agentKey: "WEBSITE_INSPECTION",
        title: "Inspect public page metadata and redirects",
        status: "COMPLETED",
        durationMs: 25_300,
        outputSummary: "Inspected 4 hosts and recorded 3 page titles as observed facts.",
        metrics: { hostsInspected: 4, titlesRecorded: 3 },
      },
      {
        agentKey: "EVIDENCE_REPORTING",
        title: "Consolidate evidence and score completeness",
        status: "COMPLETED",
        durationMs: 14_100,
        outputSummary: "Scored 5 candidates. None yet has a reviewer assessment, so none is reportable.",
        metrics: { candidatesScored: 5, reportable: 0 },
      },
    ],
  },
  {
    reference: "SNT-SCN-2026-0106",
    platform: "quotex",
    platformNameInput: "Quotex",
    seedDomain: "quotex.com",
    notes: "Scheduled re-check of previously escalated candidates. Simulated run.",
    profile: "QUICK",
    scopes: ["TECHNICAL_INSPECTION", "REGULATORY_MATCHING", "RELATED_DOMAIN_ANALYSIS"],
    maxCandidates: 40,
    initiatedBy: "reviewer",
    status: "COMPLETED",
    startedDaysAgo: 2,
    durationSeconds: 64,
    candidatesFound: 4,
    candidatesRequiringReview: 2,
    warningCount: 0,
    discoveredFqdns: [
      "quotex-bonus-demo.online",
      "quotex-alt-demo-04.online",
      "quotex-alt-demo-05.co",
      "quotex-variant-demo.in",
    ],
    tasks: [
      {
        agentKey: "WEBSITE_INSPECTION",
        title: "Inspect public page metadata and redirects",
        status: "COMPLETED",
        durationMs: 23_800,
        outputSummary: "Re-inspected 6 escalated hosts. No change from the previous observation.",
        metrics: { hostsInspected: 6, changesDetected: 0 },
      },
      {
        agentKey: "REGULATORY_VERIFICATION",
        title: "Compare entities against configured official sources",
        status: "COMPLETED",
        durationMs: 19_600,
        outputSummary:
          "Re-checked 6 entities. The simulated authorised-entity register returned no entry for any of them, which is recorded as a checked non-match and is not authorisation.",
        metrics: { entitiesChecked: 6, matchesFound: 2, explicitNonMatches: 4 },
      },
      {
        agentKey: "RELATIONSHIP_ANALYSIS",
        title: "Correlate candidates into explainable relationships",
        status: "COMPLETED",
        durationMs: 20_600,
        outputSummary: "Confirmed 6 existing relationships and proposed 2 new ones.",
        metrics: { relationshipsProposed: 2, relationshipsReaffirmed: 6 },
      },
    ],
  },
];
