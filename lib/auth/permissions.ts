import type { Role } from "@/lib/types/enums";

/**
 * The permission matrix.
 *
 * Shared between server and client so the UI can hide what a user cannot do —
 * but hiding is never the control. Every permission here is checked again on
 * the server, in the service layer, next to the data. See lib/auth/guards.ts.
 */

export const PERMISSIONS = [
  // Reading
  "domains:read",
  "scans:read",
  "relationships:read",
  "regulatorySources:read",
  "reports:read",
  "audit:read",
  "settings:read",

  // Investigating
  "scans:create",
  "scans:cancel",
  "domains:review",
  "domains:bulkReview",
  "domains:export",
  "relationships:confirm",
  "regulatorySources:check",

  // Reporting
  "reports:create",
  "reports:edit",
  "reports:submitForReview",
  "reports:export",

  // Reviewing — the authority to turn investigative material into a report
  // that leaves the building, and to record an official outcome.
  "reports:approve",
  "reports:recordSubmission",
  "reports:recordResponse",
  "reports:recordOutcome",
  "reports:close",

  // Administration
  "regulatorySources:manage",
  "settings:write",
  "demo:reset",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: Permission[] = [
  "domains:read",
  "scans:read",
  "relationships:read",
  "regulatorySources:read",
  "reports:read",
  "audit:read",
  "settings:read",
];

const INVESTIGATOR: Permission[] = [
  ...VIEWER,
  "scans:create",
  "scans:cancel",
  "domains:review",
  "domains:bulkReview",
  "domains:export",
  "regulatorySources:check",
  "reports:create",
  "reports:edit",
  "reports:submitForReview",
  "reports:export",
];

const REVIEWER: Permission[] = [
  ...INVESTIGATOR,
  "relationships:confirm",
  // Only a reviewer may approve a report or record anything about an authority
  // response or an official outcome.
  "reports:approve",
  "reports:recordSubmission",
  "reports:recordResponse",
  "reports:recordOutcome",
  "reports:close",
];

const ADMINISTRATOR: Permission[] = [
  ...REVIEWER,
  "regulatorySources:manage",
  "settings:write",
  "demo:reset",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  VIEWER,
  INVESTIGATOR,
  REVIEWER,
  ADMINISTRATOR,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** Human-readable explanation used in 403 responses and tooltips. */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  "domains:read": "View the domain registry and domain details",
  "scans:read": "View scan history and scan details",
  "relationships:read": "View the relationship graph",
  "regulatorySources:read": "View configured regulatory sources",
  "reports:read": "View reports",
  "audit:read": "View the audit log",
  "settings:read": "View settings and provider status",
  "scans:create": "Start a discovery scan",
  "scans:cancel": "Cancel a running scan",
  "domains:review": "Change a domain's review status, priority or notes",
  "domains:bulkReview": "Apply a review status to several domains at once",
  "domains:export": "Export the domain registry as CSV",
  "relationships:confirm": "Confirm a proposed relationship against evidence",
  "regulatorySources:check": "Trigger a regulatory source check",
  "reports:create": "Create a report draft",
  "reports:edit": "Edit a report draft",
  "reports:submitForReview": "Send a draft for internal review",
  "reports:export": "Export a report as PDF or CSV",
  "reports:approve": "Approve a report for onward submission",
  "reports:recordSubmission": "Record an out-of-band submission reference",
  "reports:recordResponse": "Record an authority's response",
  "reports:recordOutcome": "Record a confirmed official outcome",
  "reports:close": "Close a report",
  "regulatorySources:manage": "Add, edit, enable or disable a regulatory source",
  "settings:write": "Change non-secret application settings",
  "demo:reset": "Reset the demo dataset (development only)",
};
