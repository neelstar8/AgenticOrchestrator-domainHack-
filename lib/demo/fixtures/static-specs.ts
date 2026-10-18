/**
 * Static fixtures: demo users, discovery sources, platforms and settings.
 */

import type { DiscoverySourceKind, Role, SettingCategory } from "@/lib/types/enums";
import type { JsonValue } from "@/lib/types/models";

/**
 * Demo accounts.
 *
 * These are real credentials with real bcrypt hashes and real server-side
 * role enforcement — not a bypass. They are nevertheless DEMO accounts with a
 * published password, so the login page and the README say so plainly. See
 * docs/security-checklist.md for what must change before any deployment.
 */
export const DEMO_PASSWORD = "SentinelDemo!2026";

export interface UserSpec {
  key: "admin" | "investigator" | "reviewer" | "viewer";
  email: string;
  name: string;
  role: Role;
  jobTitle: string;
}

export const USER_SPECS: UserSpec[] = [
  {
    key: "admin",
    email: "admin@sentinel.demo",
    name: "Priya Raghavan",
    role: "ADMINISTRATOR",
    jobTitle: "Platform administrator",
  },
  {
    key: "investigator",
    email: "investigator@sentinel.demo",
    name: "Arjun Mehta",
    role: "INVESTIGATOR",
    jobTitle: "Domain intelligence investigator",
  },
  {
    key: "reviewer",
    email: "reviewer@sentinel.demo",
    name: "Lakshmi Iyer",
    role: "REVIEWER",
    jobTitle: "Senior review officer",
  },
  {
    key: "viewer",
    email: "viewer@sentinel.demo",
    name: "Sanjay Bose",
    role: "VIEWER",
    jobTitle: "Compliance observer (read-only)",
  },
];

export interface DiscoverySourceSpec {
  key: string;
  name: string;
  kind: DiscoverySourceKind;
  description: string;
  isEnabled: boolean;
}

export const DISCOVERY_SOURCE_SPECS: DiscoverySourceSpec[] = [
  {
    key: "search-index",
    name: "Search index",
    kind: "SEARCH_INDEX",
    description:
      "Hostnames extracted from search-provider results. In demo mode these come from the " +
      "simulated provider, not from a real search API.",
    isEnabled: true,
  },
  {
    key: "domain-variation",
    name: "Domain variation generator",
    kind: "DOMAIN_VARIATION",
    description:
      "Bounded, deterministic name variations generated from the seed as candidates for " +
      "verification. Generating a name says nothing about whether it exists or who holds it.",
    isEnabled: true,
  },
  {
    key: "cert-transparency",
    name: "Certificate transparency log",
    kind: "CERTIFICATE_TRANSPARENCY",
    description:
      "Names appearing in public certificate-transparency entries. A CT entry shows a " +
      "certificate was issued for a name — not that a website is running there.",
    isEnabled: true,
  },
  {
    key: "passive-dns",
    name: "Passive DNS",
    kind: "PASSIVE_DNS",
    description:
      "Hostnames observed in historical resolution data. In demo mode these are simulated.",
    isEnabled: true,
  },
  {
    key: "regulatory-document",
    name: "Regulatory document reference",
    kind: "REGULATORY_DOCUMENT",
    description:
      "Domains named inside a configured official source document. In demo mode only the " +
      "clearly-labelled fixture sources are consulted.",
    isEnabled: true,
  },
  {
    key: "referral-link",
    name: "Referral link",
    kind: "REFERRAL_LINK",
    description: "Hostnames reached by following an outbound link on an inspected public page.",
    isEnabled: true,
  },
  {
    key: "manual-submission",
    name: "Manual submission",
    kind: "MANUAL_SUBMISSION",
    description: "Entered directly by an operator as a seed or a candidate of interest.",
    isEnabled: true,
  },
];

export interface PlatformSpec {
  key: "quotex" | "binarix";
  name: string;
  slug: string;
  aliases: string[];
  investigationId: string;
  description: string;
}

export const PLATFORM_SPECS: PlatformSpec[] = [
  {
    key: "quotex",
    name: "Quotex Investigation Demo",
    slug: "quotex-investigation-demo",
    aliases: ["Quotex", "Quotex India", "Qu0tex"],
    investigationId: "SNT-DEMO-2026-0147",
    description:
      "Demonstration investigation built around the example in the product brief. All findings " +
      "attached to this platform are synthetic and unverified. Nothing here asserts that any " +
      "real website is fraudulent, unauthorised, or connected to any other website.",
  },
  {
    key: "binarix",
    name: "Binarix Demo Platform",
    slug: "binarix-demo-platform",
    aliases: ["Binarix", "Binarix Pro"],
    investigationId: "SNT-DEMO-2026-0162",
    description:
      "A second, entirely fictional demonstration investigation. It exists so platform " +
      "filtering and multi-investigation views are demonstrable.",
  },
];

export interface SettingSpec {
  key: string;
  category: SettingCategory;
  label: string;
  description: string;
  value: JsonValue;
  isSecret?: boolean;
  isEditable?: boolean;
}

/**
 * Non-secret application settings.
 *
 * No credential is stored here. Secrets live in server environment variables
 * only; the Settings page shows whether each one is configured and never
 * returns a value. Entries marked `isEditable: false` are derived from the
 * environment and are shown read-only so the UI cannot imply that changing a
 * toggle in the browser would enable a live integration.
 */
export const SETTING_SPECS: SettingSpec[] = [
  {
    key: "application.displayName",
    category: "APPLICATION",
    label: "Display name",
    description: "Name shown in the sidebar and on exported reports.",
    value: "Sentinel",
  },
  {
    key: "application.organisationName",
    category: "APPLICATION",
    label: "Organisation name",
    description: "Printed on the cover page of every exported report.",
    value: "Sentinel Demonstration Deployment",
  },
  {
    key: "application.contactEmail",
    category: "APPLICATION",
    label: "Report contact address",
    description: "Contact address printed on exported reports for the receiving authority.",
    value: "reports@sentinel.demo",
  },
  {
    key: "mode.runtimeMode",
    category: "MODE",
    label: "Runtime mode",
    description:
      "Set by the SENTINEL_MODE environment variable. Shown here read-only: switching modes in " +
      "the browser would not configure any provider.",
    value: "demo",
    isEditable: false,
  },
  {
    key: "mode.showSimulationBanners",
    category: "MODE",
    label: "Show simulation banners",
    description:
      "Display the 'Demo simulation' banner wherever simulated findings appear. Strongly " +
      "recommended; turning it off does not change the data, only the labelling.",
    value: true,
  },
  {
    key: "agents.defaultProfile",
    category: "AGENTS",
    label: "Default scan profile",
    description: "Profile pre-selected in the New Scan form.",
    value: "QUICK",
  },
  {
    key: "agents.maxAttemptsPerTask",
    category: "AGENTS",
    label: "Maximum attempts per agent task",
    description: "How many times the orchestrator retries a failing agent task before giving up.",
    value: 2,
  },
  {
    key: "agents.taskTimeoutSeconds",
    category: "AGENTS",
    label: "Agent task timeout (seconds)",
    description: "An agent task exceeding this is cancelled and recorded as a timeout.",
    value: 120,
  },
  {
    key: "agents.enableRelationshipAnalysis",
    category: "AGENTS",
    label: "Enable relationship analysis",
    description:
      "Run the Relationship Analysis Agent by default. Its output is always labelled as " +
      "inference, never as observation.",
    value: true,
  },
  {
    key: "providers.searchProvider",
    category: "PROVIDERS",
    label: "Search provider",
    description:
      "Which SearchProvider implementation the registry resolves. Set by SEARCH_PROVIDER; " +
      "read-only here because selecting a provider without its credentials would do nothing.",
    value: "mock",
    isEditable: false,
  },
  {
    key: "providers.languageModel",
    category: "PROVIDERS",
    label: "Language model provider",
    description:
      "Set by GEMINI_API_KEY and GEMINI_MODEL. Unconfigured providers report 'not configured' " +
      "and the orchestrator uses the simulated provider instead.",
    value: "not-configured",
    isEditable: false,
  },
  {
    key: "scanLimits.maxCandidatesDefault",
    category: "SCAN_LIMITS",
    label: "Default maximum candidates per scan",
    description: "Pre-filled in the New Scan form. Capped by SENTINEL_MAX_CANDIDATES_PER_SCAN.",
    value: 50,
  },
  {
    key: "scanLimits.maxConcurrentScans",
    category: "SCAN_LIMITS",
    label: "Maximum concurrent scans",
    description: "Scans beyond this limit are rejected rather than queued indefinitely.",
    value: 3,
  },
  {
    key: "rateLimiting.perHostPerMinute",
    category: "RATE_LIMITING",
    label: "Requests per host per minute",
    description:
      "Applies to live outbound inspection. Live fetching is disabled by default, in which case " +
      "this limit is not exercised.",
    value: 10,
  },
  {
    key: "rateLimiting.maxConcurrentRequests",
    category: "RATE_LIMITING",
    label: "Maximum concurrent outbound requests",
    description: "Global ceiling on simultaneous outbound inspection requests.",
    value: 4,
  },
  {
    key: "evidenceRetention.retainDays",
    category: "EVIDENCE_RETENTION",
    label: "Evidence retention (days)",
    description:
      "How long collected evidence is kept before it is eligible for deletion. Audit events are " +
      "never deleted by retention.",
    value: 365,
  },
  {
    key: "evidenceRetention.retainRawPayloads",
    category: "EVIDENCE_RETENTION",
    label: "Retain raw provider payloads",
    description:
      "Keep the structured payload each provider returned, so a conclusion can always be traced " +
      "to the record that supported it.",
    value: true,
  },
  {
    key: "reportDefaults.receivingAuthority",
    category: "REPORT_DEFAULTS",
    label: "Default receiving authority",
    description:
      "Pre-selected when creating a report. Defaults to internal-record-only so a report is " +
      "never addressed to an authority by accident.",
    value: "INTERNAL_RECORD_ONLY",
  },
  {
    key: "reportDefaults.includeAuditTrail",
    category: "REPORT_DEFAULTS",
    label: "Include audit trail in exports",
    description: "Append the relevant audit events to every exported PDF.",
    value: true,
  },
  {
    key: "reportDefaults.includeLimitations",
    category: "REPORT_DEFAULTS",
    label: "Require a limitations section",
    description:
      "A report cannot be generated without stating what its evidence does not establish. " +
      "This cannot be disabled.",
    value: true,
    isEditable: false,
  },
  {
    key: "appearance.defaultTheme",
    category: "APPEARANCE",
    label: "Default theme",
    description: "Theme applied before a viewer chooses one. Each viewer's choice is remembered locally.",
    value: "dark",
  },
  {
    key: "appearance.densePresentation",
    category: "APPEARANCE",
    label: "Dense table presentation",
    description: "Tighter row height in investigative tables.",
    value: true,
  },
];
