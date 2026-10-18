import { z } from "zod";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  DISCOVERY_SCOPES,
  MATCH_TYPES,
  PRIORITIES,
  RECEIVING_AUTHORITIES,
  REGULATORY_SOURCE_TYPES,
  RELATIONSHIP_TYPES,
  REPORT_STATUSES,
  REVIEW_STATUSES,
  SCAN_PROFILES,
  SCAN_STATUSES,
} from "@/lib/types/enums";
import { MAX_PAGE_SIZE } from "@/lib/config/constants";
import { tryNormalizeDomain } from "@/lib/utils/domain-name";

/**
 * Request and form validation.
 *
 * These schemas are shared between the client forms and the server handlers,
 * so a field's rules are written once. The server ALWAYS re-validates: a
 * client-side parse is a convenience for the user, never a trust boundary.
 */

// --- primitives ------------------------------------------------------------

export const idSchema = z.string().trim().min(1).max(64);

/** A hostname or http(s) URL, normalised to a canonical FQDN. */
export const domainInputSchema = z
  .string()
  .trim()
  .min(3, "Enter a domain name.")
  .max(2048)
  .transform((value, ctx) => {
    const parsed = tryNormalizeDomain(value);
    if (!parsed) {
      ctx.addIssue({
        code: "custom",
        message:
          "Enter a valid domain such as example.com. IP addresses and non-http(s) URLs are not accepted.",
      });
      return z.NEVER;
    }
    return parsed.fqdn;
  });

export const optionalDomainInputSchema = z
  .union([z.literal(""), domainInputSchema])
  .transform((value) => (value === "" ? null : value));

/** Comma-separated query value parsed into a validated enum array. */
function csvEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .union([z.string(), z.array(z.enum(values))])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const list = Array.isArray(value) ? value : value.split(",");
      const cleaned = list
        .map((item) => item.trim())
        .filter((item): item is T[number] => (values as readonly string[]).includes(item));
      return cleaned.length > 0 ? cleaned : undefined;
    });
}

const positiveIntFromQuery = (fallback: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") return fallback;
      const parsed = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.min(max, Math.max(1, Math.trunc(parsed)));
    });

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value));

const isoDateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .optional()
  .transform((value) => (value === "" ? undefined : value));

// --- authentication --------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
  password: z.string().min(1, "Enter your password.").max(512),
  /** Relative path to return to after signing in. */
  next: z
    .string()
    .trim()
    .max(512)
    .optional()
    // Only same-origin relative paths: an absolute URL here would be an open
    // redirect.
    .transform((value) =>
      value && value.startsWith("/") && !value.startsWith("//") ? value : undefined,
    ),
});
export type LoginInput = z.infer<typeof loginSchema>;

// --- scans -----------------------------------------------------------------

export const createScanSchema = z
  .object({
    platformName: z
      .string()
      .trim()
      .min(2, "Enter the platform or brand name.")
      .max(200),
    seedDomain: optionalDomainInputSchema.optional().default(""),
    notes: z.string().trim().max(2000).optional().default(""),
    scopes: z
      .array(z.enum(DISCOVERY_SCOPES))
      .min(1, "Select at least one discovery scope."),
    maxCandidates: z.coerce
      .number()
      .int("Enter a whole number.")
      .min(1, "Allow at least one candidate.")
      .max(2000, "The maximum is 2000."),
    profile: z.enum(SCAN_PROFILES),
  })
  .refine(
    (value) =>
      // A scope that works from a seed domain needs one. Search-index
      // discovery can work from a brand name alone.
      value.seedDomain !== null ||
      value.scopes.some((scope) => scope === "SEARCH_INDEX" || scope === "REGULATORY_MATCHING"),
    {
      message:
        "Provide a seed domain, or include search-index or regulatory-source discovery so the scan has somewhere to start.",
      path: ["seedDomain"],
    },
  );
export type CreateScanInputDto = z.infer<typeof createScanSchema>;

export const scanQuerySchema = z.object({
  search: optionalTrimmed(200),
  status: csvEnum(SCAN_STATUSES),
  profile: z.enum(SCAN_PROFILES).optional(),
  initiatedById: idSchema.optional(),
  createdFrom: isoDateOnly,
  createdTo: isoDateOnly,
  sortBy: z
    .enum(["queuedAt", "status", "candidatesFound", "durationMs", "reference"])
    .optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  page: positiveIntFromQuery(1, 10_000),
  pageSize: positiveIntFromQuery(25, MAX_PAGE_SIZE),
});

// --- domains ---------------------------------------------------------------

export const domainQuerySchema = z.object({
  search: optionalTrimmed(200),
  platformId: idSchema.optional(),
  suffix: optionalTrimmed(40),
  discoverySourceKey: optionalTrimmed(60),
  reviewStatus: csvEnum(REVIEW_STATUSES),
  priority: csvEnum(PRIORITIES),
  origin: z.enum(["SIMULATED_DEMO", "LIVE_COLLECTED"]).optional(),
  minEvidenceCompleteness: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : undefined;
    }),
  maxEvidenceCompleteness: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : undefined;
    }),
  firstSeenFrom: isoDateOnly,
  firstSeenTo: isoDateOnly,
  scanId: idSchema.optional(),
  assignedReviewerId: idSchema.optional(),
  sortBy: z
    .enum([
      "fqdn",
      "firstSeenAt",
      "lastSeenAt",
      "evidenceCompleteness",
      "priority",
      "reviewStatus",
    ])
    .optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  page: positiveIntFromQuery(1, 10_000),
  pageSize: positiveIntFromQuery(25, MAX_PAGE_SIZE),
});

export const updateDomainReviewSchema = z
  .object({
    reviewStatus: z.enum(REVIEW_STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assignedReviewerId: z.union([idSchema, z.literal(""), z.null()]).optional(),
    reviewerNotes: z.string().trim().max(5000).optional(),
    /** Why the change is being made. Recorded in the audit trail. */
    reason: z.string().trim().max(1000).optional(),
  })
  .refine(
    (value) =>
      value.reviewStatus !== undefined ||
      value.priority !== undefined ||
      value.assignedReviewerId !== undefined ||
      value.reviewerNotes !== undefined,
    { message: "Provide at least one field to change." },
  )
  .refine(
    (value) =>
      // Marking a domain as included in a report, escalated or dismissed is a
      // judgement, so it has to come with a reason a later reader can see.
      !(
        value.reviewStatus === "ESCALATED" ||
        value.reviewStatus === "DISMISSED" ||
        value.reviewStatus === "NOT_RELATED"
      ) ||
      Boolean(value.reason?.trim()) ||
      Boolean(value.reviewerNotes?.trim()),
    {
      message:
        "Escalating, dismissing or marking a domain as not related requires a reason or reviewer note.",
      path: ["reason"],
    },
  );
export type UpdateDomainReviewDto = z.infer<typeof updateDomainReviewSchema>;

export const bulkDomainReviewSchema = z.object({
  domainIds: z
    .array(idSchema)
    .min(1, "Select at least one domain.")
    .max(500, "Update at most 500 domains at a time."),
  reviewStatus: z.enum(REVIEW_STATUSES),
  priority: z.enum(PRIORITIES).optional(),
  reason: z
    .string()
    .trim()
    .min(5, "Give a reason: a bulk change should be explainable later.")
    .max(1000),
});
export type BulkDomainReviewDto = z.infer<typeof bulkDomainReviewSchema>;

// --- relationships ---------------------------------------------------------

export const relationshipQuerySchema = z.object({
  types: csvEnum(RELATIONSHIP_TYPES),
  focusDomainId: idSchema.optional(),
  depth: positiveIntFromQuery(1, 4),
  minConfidence: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : undefined;
    }),
  reviewerConfirmedOnly: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true" || value === "1"),
  limit: positiveIntFromQuery(300, 1000),
});

export const confirmRelationshipSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Explain what evidence supports confirming this relationship.")
    .max(2000),
});

// --- regulatory sources ----------------------------------------------------

export const createRegulatorySourceSchema = z.object({
  authorityName: z.string().trim().min(2, "Enter the authority's name.").max(200),
  authorityShortName: z.string().trim().min(2, "Enter a short name.").max(40),
  title: z.string().trim().min(3, "Enter the source title.").max(300),
  sourceUrl: z
    .string()
    .trim()
    .url("Enter the full official URL, including https://")
    .max(2048)
    .refine(
      (value) => {
        try {
          const protocol = new URL(value).protocol;
          return protocol === "http:" || protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Only http and https URLs are supported." },
    ),
  sourceType: z.enum(REGULATORY_SOURCE_TYPES),
  description: z.string().trim().max(2000).optional().default(""),
  isEnabled: z.boolean().default(true),
  checkIntervalHours: z.coerce.number().int().min(1).max(8760).default(24),
  verificationNotes: z.string().trim().max(4000).optional().default(""),
});
export type CreateRegulatorySourceDto = z.infer<typeof createRegulatorySourceSchema>;

export const updateRegulatorySourceSchema = createRegulatorySourceSchema.partial();

export const regulatoryCheckSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

// --- reports ---------------------------------------------------------------

export const reportContentSchema = z.object({
  title: z.string().trim().min(5, "Give the report a title.").max(300),
  receivingAuthority: z.enum(RECEIVING_AUTHORITIES),
  authorityOther: z.string().trim().max(200).optional().default(""),
  executiveSummary: z
    .string()
    .trim()
    .min(50, "Write an executive summary of at least 50 characters.")
    .max(20_000),
  findings: z.string().trim().min(50, "Describe the findings.").max(50_000),
  recommendations: z.string().trim().min(20, "State your recommendations.").max(20_000),
  // Required by design: a report that does not say what its evidence fails to
  // establish is not an acceptable report.
  limitations: z
    .string()
    .trim()
    .min(
      50,
      "State the limitations. A report must say what its evidence does not establish — this cannot be left blank.",
    )
    .max(20_000),
  methodology: z.string().trim().min(20, "Describe the methodology.").max(20_000),
});

export const createReportSchema = reportContentSchema.extend({
  domainIds: z
    .array(idSchema)
    .min(1, "Select at least one domain to include.")
    .max(200, "Include at most 200 domains in one report."),
  evidenceIds: z.array(idSchema).max(2000).default([]),
  domainRationales: z.record(idSchema, z.string().trim().max(1000)).optional(),
});
export type CreateReportDto = z.infer<typeof createReportSchema>;

export const updateReportSchema = createReportSchema.partial();

export const reportQuerySchema = z.object({
  search: optionalTrimmed(200),
  status: csvEnum(REPORT_STATUSES),
  receivingAuthority: csvEnum(RECEIVING_AUTHORITIES),
  preparedById: idSchema.optional(),
  page: positiveIntFromQuery(1, 10_000),
  pageSize: positiveIntFromQuery(25, MAX_PAGE_SIZE),
});

/** Workflow transitions, each with the fields its step actually requires. */
export const reportTransitionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("submitForReview"),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("approve"),
    note: z
      .string()
      .trim()
      .min(10, "Record why this report is being approved for onward submission.")
      .max(2000),
  }),
  z.object({
    action: z.literal("recordSubmission"),
    submissionReference: z
      .string()
      .trim()
      .min(3, "Enter the reference the authority gave you.")
      .max(200),
    submissionChannel: z
      .string()
      .trim()
      .min(3, "Record how this was submitted (portal, email, post).")
      .max(200),
    submittedAt: z.string().datetime().optional(),
  }),
  z.object({
    action: z.literal("recordResponse"),
    responseSummary: z
      .string()
      .trim()
      .min(10, "Summarise the authority's response.")
      .max(10_000),
    responseReceivedAt: z.string().datetime().optional(),
  }),
  z.object({
    action: z.literal("recordOutcome"),
    outcomeSummary: z
      .string()
      .trim()
      .min(10, "Describe the confirmed official action and its reference.")
      .max(10_000),
    outcomeConfirmedAt: z.string().datetime().optional(),
  }),
  z.object({
    action: z.literal("close"),
    closingNote: z.string().trim().min(5, "Record why this report is being closed.").max(2000),
  }),
  z.object({
    action: z.literal("reopenToDraft"),
    note: z.string().trim().min(5, "Record why this report is returning to draft.").max(2000),
  }),
]);
export type ReportTransitionDto = z.infer<typeof reportTransitionSchema>;

// --- audit -----------------------------------------------------------------

export const auditQuerySchema = z.object({
  search: optionalTrimmed(200),
  actorId: idSchema.optional(),
  action: csvEnum(AUDIT_ACTIONS),
  entityType: csvEnum(AUDIT_ENTITY_TYPES),
  entityId: idSchema.optional(),
  occurredFrom: isoDateOnly,
  occurredTo: isoDateOnly,
  page: positiveIntFromQuery(1, 10_000),
  pageSize: positiveIntFromQuery(25, MAX_PAGE_SIZE),
});

// --- settings --------------------------------------------------------------

export const updateSettingsSchema = z.object({
  changes: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(120),
        value: z.union([z.string().max(2000), z.number(), z.boolean()]),
      }),
    )
    .min(1, "Provide at least one setting to change.")
    .max(50),
});
export type UpdateSettingsDto = z.infer<typeof updateSettingsSchema>;

// --- regulatory match confirmation ----------------------------------------

export const confirmMatchSchema = z.object({
  matchId: idSchema,
  matchType: z.enum(MATCH_TYPES).optional(),
  notes: z
    .string()
    .trim()
    .min(10, "Record what you verified against the published source.")
    .max(4000),
});

// --- helpers ---------------------------------------------------------------

export interface ValidationFailure {
  path: string;
  message: string;
}

/** Flattens Zod issues into a shape both the API and the forms can render. */
export function toValidationFailures(error: z.ZodError): ValidationFailure[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "_root",
    message: issue.message,
  }));
}

/** Parses URLSearchParams through a schema, tolerating repeated keys. */
export function parseSearchParams<TSchema extends z.ZodType>(
  schema: TSchema,
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): z.ZodSafeParseResult<z.infer<TSchema>> {
  const raw: Record<string, string | string[]> = {};

  if (params instanceof URLSearchParams) {
    for (const key of new Set(params.keys())) {
      const values = params.getAll(key);
      raw[key] = values.length > 1 ? values : (values[0] ?? "");
    }
  } else {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) raw[key] = value;
    }
  }

  return schema.safeParse(raw) as z.ZodSafeParseResult<z.infer<TSchema>>;
}
