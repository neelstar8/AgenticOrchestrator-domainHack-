/**
 * Regulatory source fixtures.
 *
 * ========================= CRITICAL DISTINCTION =========================
 * This file contains two structurally separate kinds of record, and the
 * difference is the most important correctness property in the application:
 *
 *   1. CONFIGURED REAL SOURCES (`isRealAuthority: true`)
 *      Real authorities with their real published URLs, present purely as
 *      configuration. Sentinel has NEVER retrieved any of them — live fetching
 *      is disabled by default — so each one is NEVER_CHECKED with zero matches
 *      and zero check history. Sentinel holds no content from them and makes
 *      no claim about what they do or do not say.
 *
 *   2. SIMULATED FIXTURE SOURCES (`isRealAuthority: false`)
 *      A fictional authority at a reserved, non-routable `.invalid` hostname.
 *      These carry simulated check history and simulated matches so the
 *      matching, staleness and failure workflows are demonstrable.
 *
 * NO SIMULATED MATCH IS EVER ATTACHED TO A REAL AUTHORITY. Sentinel does not
 * fabricate regulatory warnings, and the UI renders the two groups in visually
 * separate, explicitly labelled sections.
 *
 * Note also: one fixture source is an authorised-entity register that returns
 * NO match for the demo platform. That record exists specifically to show that
 * absence from a list is recorded as "no match found" and is never rendered as
 * regulatory authorisation.
 * ========================================================================
 */

import type { MatchType, RegulatorySourceType, RetrievalStatus } from "@/lib/types/enums";

export interface RegulatorySourceSpec {
  key: string;
  authorityName: string;
  authorityShortName: string;
  title: string;
  sourceUrl: string;
  sourceType: RegulatorySourceType;
  description: string;
  isEnabled: boolean;
  checkIntervalHours: number;
  /** True for a genuine authority configured as a source but never retrieved. */
  isRealAuthority: boolean;
  verificationNotes: string;

  /** Simulated check history. Only ever present on fixture sources. */
  checks?: Array<{
    daysAgo: number;
    status: RetrievalStatus;
    httpStatusCode?: number;
    bytesRetrieved?: number;
    matchedEntityCount: number;
    errorMessage?: string;
    note?: string;
    durationSeconds: number;
  }>;

  /** Simulated matches. Only ever present on fixture sources. */
  matches?: Array<{
    domainFqdn: string | null;
    matchedTerm: string;
    matchedContext: string;
    matchType: MatchType;
    confidence: number;
    daysAgo: number;
    notes?: string;
  }>;
}

export const REGULATORY_SOURCE_SPECS: RegulatorySourceSpec[] = [
  // =====================================================================
  // 1. Real authorities, configured only. Never retrieved by Sentinel.
  // =====================================================================
  {
    key: "sebi-unauthorised-advisory",
    authorityName: "Securities and Exchange Board of India",
    authorityShortName: "SEBI",
    title: "SEBI — investor cautions and advisories",
    sourceUrl: "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes",
    sourceType: "INVESTOR_WARNING_LIST",
    description:
      "Official SEBI publication configured as a source for the regulatory-matching scope.",
    isEnabled: true,
    checkIntervalHours: 24,
    isRealAuthority: true,
    verificationNotes:
      "Configured official source. Live retrieval is disabled (SENTINEL_ALLOW_LIVE_FETCH=false), " +
      "so Sentinel has never requested this URL and holds no content from it. The record exists " +
      "to show how a real source is configured. It is not evidence about any entity.",
  },
  {
    key: "sebi-intermediaries-register",
    authorityName: "Securities and Exchange Board of India",
    authorityShortName: "SEBI",
    title: "SEBI — register of recognised intermediaries",
    sourceUrl: "https://www.sebi.gov.in/intermediaries.html",
    sourceType: "AUTHORISED_ENTITY_REGISTER",
    description:
      "Official register configured as the authoritative place to check whether an entity is registered.",
    isEnabled: true,
    checkIntervalHours: 24,
    isRealAuthority: true,
    verificationNotes:
      "Configured official source, never retrieved by Sentinel. Registration status can only be " +
      "established from a positive entry in a register such as this one — never inferred from " +
      "absence elsewhere.",
  },
  {
    key: "rbi-alert-list",
    authorityName: "Reserve Bank of India",
    authorityShortName: "RBI",
    title: "RBI — Alert List of entities not authorised to deal in foreign exchange",
    sourceUrl: "https://www.rbi.org.in/Scripts/BS_ViewContent.aspx?Id=4070",
    sourceType: "INVESTOR_WARNING_LIST",
    description:
      "Official RBI Alert List configured as a source for the regulatory-matching scope.",
    isEnabled: true,
    checkIntervalHours: 24,
    isRealAuthority: true,
    verificationNotes:
      "Configured official source. Sentinel has never retrieved this page and has recorded no " +
      "matches against it. Any check against this source must be performed and verified by a " +
      "human against the published document.",
  },
  {
    key: "rbi-authorised-persons",
    authorityName: "Reserve Bank of India",
    authorityShortName: "RBI",
    title: "RBI — Authorised Persons under FEMA",
    sourceUrl: "https://www.rbi.org.in/Scripts/bs_viewcontent.aspx?Id=1762",
    sourceType: "AUTHORISED_ENTITY_REGISTER",
    description: "Official list of persons authorised to deal in foreign exchange.",
    isEnabled: true,
    checkIntervalHours: 48,
    isRealAuthority: true,
    verificationNotes:
      "Configured official source, never retrieved. Authorisation is established only by a " +
      "positive entry here.",
  },
  {
    key: "cert-in-advisories",
    authorityName: "Indian Computer Emergency Response Team",
    authorityShortName: "CERT-In",
    title: "CERT-In — public advisories",
    sourceUrl: "https://www.cert-in.org.in/",
    sourceType: "PUBLIC_ADVISORY",
    description: "Official CERT-In advisory publication configured as a source.",
    isEnabled: false,
    checkIntervalHours: 72,
    isRealAuthority: true,
    verificationNotes:
      "Configured but disabled. Disabled sources are never checked and contribute nothing to any " +
      "finding.",
  },

  // =====================================================================
  // 2. Simulated fixture sources. Fictional authority, reserved hostname.
  //    Every match in the demo dataset belongs to one of these.
  // =====================================================================
  {
    key: "fixture-warning-list",
    authorityName: "Demonstration Regulatory Authority (SIMULATED — not a real body)",
    authorityShortName: "DEMO-SIM",
    title: "Simulated investor warning list (demonstration fixture)",
    sourceUrl: "https://regulator.invalid/simulated/warning-list",
    sourceType: "INVESTOR_WARNING_LIST",
    description:
      "A fictional warning list used to demonstrate the matching workflow. The hostname is in the " +
      "reserved .invalid namespace and can never resolve.",
    isEnabled: true,
    checkIntervalHours: 12,
    isRealAuthority: false,
    verificationNotes:
      "SIMULATED FIXTURE. This authority does not exist. Every match recorded against it is " +
      "synthetic demonstration data and says nothing about any real entity or domain.",
    checks: [
      {
        daysAgo: 0,
        status: "OK",
        httpStatusCode: 200,
        bytesRetrieved: 184_320,
        matchedEntityCount: 3,
        note: "Simulated retrieval. No network request was made.",
        durationSeconds: 2,
      },
      {
        daysAgo: 1,
        status: "OK",
        httpStatusCode: 200,
        bytesRetrieved: 184_102,
        matchedEntityCount: 3,
        note: "Simulated retrieval.",
        durationSeconds: 2,
      },
      {
        daysAgo: 3,
        status: "OK",
        httpStatusCode: 200,
        bytesRetrieved: 183_990,
        matchedEntityCount: 2,
        note: "Simulated retrieval.",
        durationSeconds: 3,
      },
      {
        daysAgo: 5,
        status: "HTTP_ERROR",
        httpStatusCode: 503,
        matchedEntityCount: 0,
        errorMessage:
          "Simulated upstream error: the source returned 503. Recorded as a failed check, not as an absence of matches.",
        durationSeconds: 8,
      },
    ],
    matches: [
      {
        domainFqdn: "quotex.com.in",
        matchedTerm: "quotex.com.in",
        matchedContext:
          "[SIMULATED FIXTURE TEXT] Entry 41 of the demonstration warning list names the domain " +
          "quotex.com.in. This sentence was written for the demo dataset and does not reproduce " +
          "any real publication.",
        matchType: "EXACT_DOMAIN",
        confidence: 95,
        daysAgo: 0,
        notes:
          "Simulated match against a fictional list. Requires human verification against a real " +
          "official source before it can support any conclusion.",
      },
      {
        domainFqdn: "quotex.net.in",
        matchedTerm: "quotex.net.in",
        matchedContext:
          "[SIMULATED FIXTURE TEXT] Entry 42 of the demonstration warning list names the domain " +
          "quotex.net.in. Synthetic text written for the demo dataset.",
        matchType: "EXACT_DOMAIN",
        confidence: 93,
        daysAgo: 0,
        notes: "Simulated match. Not verified against any real publication.",
      },
      {
        domainFqdn: "quotex-mirror-demo.xyz",
        matchedTerm: "Quotex",
        matchedContext:
          "[SIMULATED FIXTURE TEXT] The demonstration list mentions the brand token 'Quotex' in a " +
          "narrative paragraph. A brand-token match is the weakest match type and is frequently a " +
          "false positive.",
        matchType: "BRAND_TOKEN",
        confidence: 44,
        daysAgo: 0,
        notes:
          "Low-confidence brand-token match. Recorded so the reviewer can see and dismiss a weak signal.",
      },
    ],
  },
  {
    key: "fixture-authorised-register",
    authorityName: "Demonstration Regulatory Authority (SIMULATED — not a real body)",
    authorityShortName: "DEMO-SIM",
    title: "Simulated authorised-entity register (demonstration fixture)",
    sourceUrl: "https://regulator.invalid/simulated/authorised-register",
    sourceType: "AUTHORISED_ENTITY_REGISTER",
    description:
      "A fictional register used to demonstrate that a no-match result is recorded explicitly as " +
      "'no match found' — and is never interpreted as authorisation.",
    isEnabled: true,
    checkIntervalHours: 12,
    isRealAuthority: false,
    verificationNotes:
      "SIMULATED FIXTURE. The last check found NO entry for any domain in this investigation. " +
      "That is recorded as a checked non-match. It does NOT mean the entities are unauthorised, " +
      "and it does NOT mean they are authorised. Only a positive entry in a real register " +
      "establishes authorisation.",
    checks: [
      {
        daysAgo: 0,
        status: "OK",
        httpStatusCode: 200,
        bytesRetrieved: 96_240,
        matchedEntityCount: 0,
        note:
          "Simulated retrieval completed with zero matches. Recorded as 'checked, no match found'.",
        durationSeconds: 2,
      },
      {
        daysAgo: 2,
        status: "OK",
        httpStatusCode: 200,
        bytesRetrieved: 96_240,
        matchedEntityCount: 0,
        note: "Simulated retrieval, zero matches.",
        durationSeconds: 2,
      },
    ],
  },
  {
    key: "fixture-unreachable-source",
    authorityName: "Demonstration Regulatory Authority (SIMULATED — not a real body)",
    authorityShortName: "DEMO-SIM",
    title: "Simulated unreachable source (demonstration fixture)",
    sourceUrl: "https://regulator.invalid/simulated/offline-feed",
    sourceType: "CIRCULAR_OR_NOTIFICATION",
    description:
      "A fixture that always fails, so failure handling and error display are demonstrable.",
    isEnabled: true,
    checkIntervalHours: 6,
    isRealAuthority: false,
    verificationNotes:
      "SIMULATED FIXTURE that always fails. A failed retrieval is recorded as an error. It is " +
      "never silently converted into 'no matches found'.",
    checks: [
      {
        daysAgo: 0,
        status: "UNREACHABLE",
        matchedEntityCount: 0,
        errorMessage:
          "Simulated failure: host regulator.invalid could not be resolved. No content was retrieved, so this check produced no information either way.",
        durationSeconds: 8,
      },
      {
        daysAgo: 1,
        status: "UNREACHABLE",
        matchedEntityCount: 0,
        errorMessage: "Simulated failure: host could not be resolved.",
        durationSeconds: 8,
      },
    ],
  },
  {
    key: "fixture-stale-source",
    authorityName: "Demonstration Regulatory Authority (SIMULATED — not a real body)",
    authorityShortName: "DEMO-SIM",
    title: "Simulated stale source (demonstration fixture)",
    sourceUrl: "https://regulator.invalid/simulated/quarterly-bulletin",
    sourceType: "PRESS_RELEASE",
    description:
      "A fixture whose last successful check is older than its configured interval, so the stale " +
      "indicator is demonstrable.",
    isEnabled: true,
    checkIntervalHours: 24,
    isRealAuthority: false,
    verificationNotes:
      "SIMULATED FIXTURE. Data from this source is older than its check interval and must be " +
      "treated as potentially out of date.",
    checks: [
      {
        daysAgo: 14,
        status: "OK",
        httpStatusCode: 200,
        bytesRetrieved: 42_880,
        matchedEntityCount: 1,
        note: "Simulated retrieval, 14 days ago.",
        durationSeconds: 3,
      },
    ],
    matches: [
      {
        domainFqdn: "quotexpro-demo.com",
        matchedTerm: "Quotexpro",
        matchedContext:
          "[SIMULATED FIXTURE TEXT] A synthetic bulletin paragraph naming a demonstration entity. " +
          "Written for the demo dataset; corresponds to no real publication.",
        matchType: "PARTIAL_ENTITY_NAME",
        confidence: 61,
        daysAgo: 14,
        notes: "Simulated match from a stale fixture source. Treat as potentially out of date.",
      },
    ],
  },
];
