/**
 * Shared constants that are safe on both the server and the client.
 * No environment access here — see lib/config/env.ts for that.
 */

export const APP_NAME = "Sentinel";
export const APP_TAGLINE = "Trading Domain Intelligence";

/**
 * Standing disclaimer shown wherever simulated findings are displayed, and
 * embedded in every exported report. Wording is deliberate: these are
 * investigative signals, not legal determinations.
 */
export const SIMULATION_NOTICE =
  "Demo simulation. These findings were generated locally by Sentinel's simulated " +
  "agent provider from synthetic fixtures. They are not the result of a real search " +
  "query, DNS or HTTP check, language-model call, or regulatory source retrieval, and " +
  "they establish nothing about any real organisation or website.";

export const SIGNAL_NOT_DETERMINATION_NOTICE =
  "Similarity scores, discovery sources and model-generated analysis are investigative " +
  "signals only. They are not findings of fraud, illegality, or lack of authorisation.";

export const ABSENCE_IS_NOT_AUTHORISATION_NOTICE =
  "The absence of a name from a warning list is not evidence of regulatory " +
  "authorisation. Authorisation can only be established from an authorised-entity " +
  "register entry.";

export const SHARED_INFRASTRUCTURE_NOTICE =
  "Shared hosting, a shared IP address or a similar TLS certificate does not, by " +
  "itself, establish shared ownership or control.";

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const MAX_PAGE_SIZE = 200;

/** Interval at which the UI polls a running scan for progress. */
export const SCAN_PROGRESS_POLL_INTERVAL_MS = 700;

export const NAV_SECTIONS = [
  { href: "/overview", label: "Overview", icon: "LayoutDashboard" },
  { href: "/scans", label: "Discovery Scans", icon: "Radar" },
  { href: "/domains", label: "Domain Registry", icon: "Globe" },
  { href: "/relationships", label: "Domain Relationships", icon: "Share2" },
  { href: "/regulatory-sources", label: "Regulatory Sources", icon: "Landmark" },
  { href: "/reports", label: "Reports", icon: "FileText" },
  { href: "/audit-log", label: "Audit Log", icon: "ScrollText" },
  { href: "/settings", label: "Settings", icon: "Settings" },
] as const;

export type NavSection = (typeof NAV_SECTIONS)[number];
