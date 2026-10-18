import "server-only";

import { getRepository } from "@/lib/repositories";
import type { Report } from "@/lib/types/models";
import type { ReportDetail, ReportListItem, ReportQuery, Paginated } from "@/lib/types/views";
import type { ReportStatus } from "@/lib/types/enums";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/auth/guards";
import { isReportable } from "@/lib/utils/evidence";
import type { CreateReportDto, ReportTransitionDto } from "@/lib/validation/schemas";
import { REPORT_STATUS_LABELS } from "@/lib/utils/labels";

/**
 * Report workflow service.
 *
 * The report lifecycle is where investigative material becomes something that
 * leaves the building, so this service — not the UI, not a route handler, not
 * an agent — owns the rules:
 *
 *  1. Transitions follow the declared graph. There is no path from DRAFT
 *     straight to SUBMITTED.
 *  2. Approval requires the reviewer permission AND a recorded reason, and the
 *     approver is stored by id so "approved by" always names a person.
 *  3. "Submitted" means a human recorded an out-of-band submission with a
 *     reference. Sentinel never transmits a report, so it can never set this
 *     itself.
 *  4. An official outcome can only be recorded on a report that was actually
 *     submitted and had a response recorded. That is what makes the Overview's
 *     "Confirmed official actions" figure mean something.
 *  5. Content is frozen once approved. Editing an approved report would make
 *     the approval meaningless.
 *  6. Every report must state its limitations (enforced by the schema) and
 *     must rest on at least one domain carrying an observed fact and a
 *     reviewer assessment.
 */

export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_TRANSITION"
      | "NOT_REPORTABLE"
      | "CONTENT_FROZEN"
      | "MISSING_PREREQUISITE",
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

/** The permitted transition graph. Anything not listed here is refused. */
const TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  DRAFT: ["AWAITING_REVIEW"],
  AWAITING_REVIEW: ["APPROVED", "DRAFT"],
  APPROVED: ["SUBMITTED", "DRAFT"],
  SUBMITTED: ["RESPONSE_RECEIVED", "CLOSED"],
  RESPONSE_RECEIVED: ["ACTION_CONFIRMED", "CLOSED"],
  ACTION_CONFIRMED: ["CLOSED"],
  CLOSED: [],
};

function assertTransition(from: ReportStatus, to: ReportStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    const allowed = TRANSITIONS[from];
    throw new WorkflowError(
      `A report that is "${REPORT_STATUS_LABELS[from]}" cannot move to ` +
        `"${REPORT_STATUS_LABELS[to]}". ` +
        (allowed.length === 0
          ? "This report is closed and no further transition is possible."
          : `Permitted next steps: ${allowed.map((s) => REPORT_STATUS_LABELS[s]).join(", ")}.`),
      "INVALID_TRANSITION",
    );
  }
}

/** Content is editable only before approval. */
function assertEditable(report: Report): void {
  if (report.status !== "DRAFT" && report.status !== "AWAITING_REVIEW") {
    throw new WorkflowError(
      `This report is "${REPORT_STATUS_LABELS[report.status]}" and its contents are frozen. ` +
        "Return it to draft first if it genuinely needs to change — the audit trail will record that.",
      "CONTENT_FROZEN",
    );
  }
}

export async function listReports(
  auth: AuthenticatedUser,
  query: ReportQuery,
): Promise<Paginated<ReportListItem>> {
  if (!auth.can("reports:read")) throw new ForbiddenError("reports:read", auth.user.role);
  const repository = await getRepository();
  return repository.listReports(query);
}

export async function getReportDetail(
  auth: AuthenticatedUser,
  id: string,
): Promise<ReportDetail | null> {
  if (!auth.can("reports:read")) throw new ForbiddenError("reports:read", auth.user.role);
  const repository = await getRepository();
  return repository.getReportDetail(id);
}

async function nextReportReference(): Promise<string> {
  const repository = await getRepository();
  const existing = await repository.listReports({ pageSize: 200 });
  const year = new Date().getUTCFullYear();
  const prefix = `SNT-RPT-${year}-`;

  const highest = existing.items
    .map((report) => report.reference)
    .filter((reference) => reference.startsWith(prefix))
    .map((reference) => Number.parseInt(reference.slice(prefix.length), 10))
    .filter((value) => Number.isFinite(value))
    .reduce((max, value) => Math.max(max, value), 0);

  return `${prefix}${String(highest + 1).padStart(4, "0")}`;
}

export async function createReport(
  auth: AuthenticatedUser,
  input: CreateReportDto,
  requestId: string,
): Promise<Report> {
  if (!auth.can("reports:create")) throw new ForbiddenError("reports:create", auth.user.role);
  const repository = await getRepository();

  // A report has to rest on at least one domain that carries both an observed
  // fact and a human assessment. Inference alone is never enough.
  const reportableDomains: string[] = [];
  const unreportable: Array<{ fqdn: string; reason: string }> = [];

  for (const domainId of input.domainIds) {
    const detail = await repository.getDomainDetail(domainId);
    if (!detail) {
      throw new WorkflowError(
        `Domain "${domainId}" was not found, so it cannot be included.`,
        "MISSING_PREREQUISITE",
      );
    }
    const assessment = isReportable(detail.evidence);
    if (assessment.reportable) reportableDomains.push(detail.fqdn);
    else unreportable.push({ fqdn: detail.fqdn, reason: assessment.reason });
  }

  if (reportableDomains.length === 0) {
    throw new WorkflowError(
      "No selected domain has both an observed fact and a reviewer assessment, so this report " +
        "would have nothing verified to stand on. " +
        unreportable.map((item) => `${item.fqdn}: ${item.reason}`).join(" "),
      "NOT_REPORTABLE",
    );
  }

  const reference = await nextReportReference();
  const report = await repository.createReport({
    reference,
    title: input.title,
    receivingAuthority: input.receivingAuthority,
    authorityOther: input.authorityOther || null,
    executiveSummary: input.executiveSummary,
    findings: input.findings,
    recommendations: input.recommendations,
    limitations: input.limitations,
    methodology: input.methodology,
    preparedById: auth.user.id,
    // A report drafted from simulated findings is itself a simulated artefact.
    origin: "SIMULATED_DEMO",
    domainIds: input.domainIds,
    evidenceIds: input.evidenceIds,
    domainRationales: input.domainRationales,
  });

  await repository.appendAuditEvent({
    actorId: auth.user.id,
    actorLabel: auth.user.name,
    action: "REPORT_CREATED",
    entityType: "REPORT",
    entityId: report.id,
    entityLabel: report.reference,
    newState: {
      status: "DRAFT",
      domainCount: input.domainIds.length,
      evidenceCount: input.evidenceIds.length,
      receivingAuthority: input.receivingAuthority,
    },
    reason:
      unreportable.length > 0
        ? `Created. ${unreportable.length} selected domain(s) do not yet meet the evidence bar and are included for context only.`
        : "Created.",
    requestId,
  });

  return report;
}

export async function updateReportContent(
  auth: AuthenticatedUser,
  id: string,
  input: Partial<CreateReportDto>,
  requestId: string,
): Promise<Report> {
  if (!auth.can("reports:edit")) throw new ForbiddenError("reports:edit", auth.user.role);
  const repository = await getRepository();

  const existing = await repository.getReportById(id);
  if (!existing) throw new WorkflowError(`Report "${id}" was not found.`, "MISSING_PREREQUISITE");
  assertEditable(existing);

  const updated = await repository.updateReportContent(id, {
    title: input.title,
    receivingAuthority: input.receivingAuthority,
    authorityOther: input.authorityOther,
    executiveSummary: input.executiveSummary,
    findings: input.findings,
    recommendations: input.recommendations,
    limitations: input.limitations,
    methodology: input.methodology,
    domainIds: input.domainIds,
    evidenceIds: input.evidenceIds,
    domainRationales: input.domainRationales,
  });

  await repository.appendAuditEvent({
    actorId: auth.user.id,
    actorLabel: auth.user.name,
    action: "REPORT_UPDATED",
    entityType: "REPORT",
    entityId: id,
    entityLabel: existing.reference,
    previousState: { title: existing.title, status: existing.status },
    newState: { title: updated.title, status: updated.status },
    requestId,
  });

  return updated;
}

/**
 * Applies a workflow transition.
 *
 * Each branch checks its own permission and its own prerequisites, so no
 * single "can edit reports" grant unlocks approval or outcome recording.
 */
export async function applyReportTransition(
  auth: AuthenticatedUser,
  id: string,
  input: ReportTransitionDto,
  requestId: string,
): Promise<Report> {
  const repository = await getRepository();
  const report = await repository.getReportById(id);
  if (!report) throw new WorkflowError(`Report "${id}" was not found.`, "MISSING_PREREQUISITE");

  const now = new Date().toISOString();
  const previousState = { status: report.status };

  switch (input.action) {
    case "submitForReview": {
      if (!auth.can("reports:submitForReview")) {
        throw new ForbiddenError("reports:submitForReview", auth.user.role);
      }
      assertTransition(report.status, "AWAITING_REVIEW");
      const updated = await repository.applyReportTransition(id, { status: "AWAITING_REVIEW" });
      await audit("REPORT_SUBMITTED_FOR_REVIEW", { status: "AWAITING_REVIEW" }, input.note ?? null);
      return updated;
    }

    case "approve": {
      if (!auth.can("reports:approve")) {
        throw new ForbiddenError("reports:approve", auth.user.role);
      }
      assertTransition(report.status, "APPROVED");
      // Self-approval defeats the point of a review step.
      if (report.preparedById === auth.user.id) {
        throw new WorkflowError(
          "A report cannot be approved by the person who prepared it. Approval is a separate " +
            "pair of eyes, and the audit trail has to be able to show that.",
          "MISSING_PREREQUISITE",
        );
      }
      const updated = await repository.applyReportTransition(id, {
        status: "APPROVED",
        approvedById: auth.user.id,
        approvedAt: now,
      });
      await audit(
        "REPORT_APPROVED",
        { status: "APPROVED", approvedBy: auth.user.name },
        input.note,
      );
      return updated;
    }

    case "recordSubmission": {
      if (!auth.can("reports:recordSubmission")) {
        throw new ForbiddenError("reports:recordSubmission", auth.user.role);
      }
      assertTransition(report.status, "SUBMITTED");
      if (report.receivingAuthority === "INTERNAL_RECORD_ONLY") {
        throw new WorkflowError(
          "This report is marked internal-record-only, so there is no authority to have submitted " +
            "it to. Change the receiving authority first.",
          "MISSING_PREREQUISITE",
        );
      }
      const updated = await repository.applyReportTransition(id, {
        status: "SUBMITTED",
        submittedAt: input.submittedAt ?? now,
        submissionReference: input.submissionReference,
        submissionChannel: input.submissionChannel,
      });
      await audit(
        "SUBMISSION_REFERENCE_RECORDED",
        { status: "SUBMITTED", submissionReference: input.submissionReference },
        `Recorded by a person after submitting out of band via ${input.submissionChannel}. ` +
          "Sentinel did not transmit this report.",
      );
      return updated;
    }

    case "recordResponse": {
      if (!auth.can("reports:recordResponse")) {
        throw new ForbiddenError("reports:recordResponse", auth.user.role);
      }
      assertTransition(report.status, "RESPONSE_RECEIVED");
      if (!report.submissionReference) {
        throw new WorkflowError(
          "A response cannot be recorded before a submission reference is. Record the submission " +
            "first so the response has something to attach to.",
          "MISSING_PREREQUISITE",
        );
      }
      const updated = await repository.applyReportTransition(id, {
        status: "RESPONSE_RECEIVED",
        responseReceivedAt: input.responseReceivedAt ?? now,
        responseSummary: input.responseSummary,
      });
      await audit(
        "AUTHORITY_RESPONSE_RECORDED",
        { status: "RESPONSE_RECEIVED" },
        input.responseSummary,
      );
      return updated;
    }

    case "recordOutcome": {
      if (!auth.can("reports:recordOutcome")) {
        throw new ForbiddenError("reports:recordOutcome", auth.user.role);
      }
      assertTransition(report.status, "ACTION_CONFIRMED");
      // This is the gate behind the "Confirmed official actions" metric. It is
      // reachable only from a report that was approved, submitted with a
      // reference, and had a response recorded — by a reviewer, each time.
      if (!report.responseReceivedAt) {
        throw new WorkflowError(
          "An official outcome cannot be confirmed before a response has been recorded. " +
            "Sentinel will not report an action it has no record of.",
          "MISSING_PREREQUISITE",
        );
      }
      const updated = await repository.applyReportTransition(id, {
        status: "ACTION_CONFIRMED",
        outcomeConfirmedAt: input.outcomeConfirmedAt ?? now,
        outcomeSummary: input.outcomeSummary,
      });
      await audit(
        "OFFICIAL_OUTCOME_RECORDED",
        { status: "ACTION_CONFIRMED" },
        input.outcomeSummary,
      );
      return updated;
    }

    case "close": {
      if (!auth.can("reports:close")) {
        throw new ForbiddenError("reports:close", auth.user.role);
      }
      assertTransition(report.status, "CLOSED");
      const updated = await repository.applyReportTransition(id, {
        status: "CLOSED",
        closedAt: now,
        closingNote: input.closingNote,
      });
      await audit("REPORT_CLOSED", { status: "CLOSED" }, input.closingNote);
      return updated;
    }

    case "reopenToDraft": {
      if (!auth.can("reports:approve")) {
        // Returning an approved report to draft invalidates an approval, so it
        // needs the same authority that granted it.
        throw new ForbiddenError("reports:approve", auth.user.role);
      }
      assertTransition(report.status, "DRAFT");
      const updated = await repository.applyReportTransition(id, {
        status: "DRAFT",
        approvedById: null,
        approvedAt: null,
      });
      await audit(
        "REPORT_UPDATED",
        { status: "DRAFT", approvalCleared: true },
        `Returned to draft; the previous approval has been cleared. ${input.note}`,
      );
      return updated;
    }

    default: {
      const exhaustive: never = input;
      throw new Error(`Unhandled transition: ${JSON.stringify(exhaustive)}`);
    }
  }

  async function audit(
    action: Parameters<Awaited<ReturnType<typeof getRepository>>["appendAuditEvent"]>[0]["action"],
    newState: Record<string, unknown>,
    reason: string | null,
  ): Promise<void> {
    await repository.appendAuditEvent({
      actorId: auth.user.id,
      actorLabel: auth.user.name,
      action,
      entityType: "REPORT",
      entityId: id,
      entityLabel: report!.reference,
      previousState: previousState as never,
      newState: newState as never,
      reason,
      requestId,
    });
  }
}

/** Records that a report was exported, so the audit trail shows distribution. */
export async function recordReportExport(
  auth: AuthenticatedUser,
  id: string,
  format: "pdf" | "csv",
  requestId: string,
): Promise<void> {
  const repository = await getRepository();
  const report = await repository.getReportById(id);
  if (!report) return;

  await repository.appendAuditEvent({
    actorId: auth.user.id,
    actorLabel: auth.user.name,
    action: "REPORT_EXPORTED",
    entityType: "REPORT",
    entityId: id,
    entityLabel: report.reference,
    newState: { format, status: report.status },
    reason: `Exported as ${format.toUpperCase()}.`,
    requestId,
  });
}

/** The transitions available from a report's current state, for the UI. */
export function availableTransitions(
  report: Report,
  auth: AuthenticatedUser,
): Array<{ action: ReportTransitionDto["action"]; label: string; enabled: boolean; reason: string | null }> {
  const options: Array<{
    action: ReportTransitionDto["action"];
    label: string;
    to: ReportStatus;
    permission: Parameters<AuthenticatedUser["can"]>[0];
    prerequisite?: () => string | null;
  }> = [
    {
      action: "submitForReview",
      label: "Send for internal review",
      to: "AWAITING_REVIEW",
      permission: "reports:submitForReview",
    },
    {
      action: "approve",
      label: "Approve",
      to: "APPROVED",
      permission: "reports:approve",
      prerequisite: () =>
        report.preparedById === auth.user.id
          ? "A report cannot be approved by the person who prepared it."
          : null,
    },
    {
      action: "recordSubmission",
      label: "Record submission reference",
      to: "SUBMITTED",
      permission: "reports:recordSubmission",
      prerequisite: () =>
        report.receivingAuthority === "INTERNAL_RECORD_ONLY"
          ? "This report is internal-record-only; set a receiving authority first."
          : null,
    },
    {
      action: "recordResponse",
      label: "Record authority response",
      to: "RESPONSE_RECEIVED",
      permission: "reports:recordResponse",
      prerequisite: () =>
        report.submissionReference ? null : "Record the submission reference first.",
    },
    {
      action: "recordOutcome",
      label: "Record confirmed outcome",
      to: "ACTION_CONFIRMED",
      permission: "reports:recordOutcome",
      prerequisite: () =>
        report.responseReceivedAt ? null : "Record the authority's response first.",
    },
    { action: "close", label: "Close report", to: "CLOSED", permission: "reports:close" },
    {
      action: "reopenToDraft",
      label: "Return to draft",
      to: "DRAFT",
      permission: "reports:approve",
    },
  ];

  return options
    .filter((option) => TRANSITIONS[report.status].includes(option.to))
    .map((option) => {
      if (!auth.can(option.permission)) {
        return {
          action: option.action,
          label: option.label,
          enabled: false,
          reason: `Requires the ${option.permission} permission.`,
        };
      }
      const blocked = option.prerequisite?.() ?? null;
      return {
        action: option.action,
        label: option.label,
        enabled: blocked === null,
        reason: blocked,
      };
    });
}
