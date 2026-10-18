import type { NextResponse } from "next/server";

import { jsonError, jsonOk, parseJsonBody, withAuth } from "@/lib/services/api-helpers";
import { getReportDetail, updateReportContent } from "@/lib/services/report-service";
import { updateReportSchema } from "@/lib/validation/schemas";

/** GET /api/reports/[id] — full report detail with domains, evidence and audit. */
export const GET = withAuth(
  "reports:read",
  async (
    { auth, requestId },
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const detail = await getReportDetail(auth, id);

    if (!detail) {
      return jsonError("NOT_FOUND", `No report was found for "${id}".`, 404, requestId);
    }
    return jsonOk(detail, requestId);
  },
);

/**
 * PATCH /api/reports/[id] — edits content.
 *
 * Refused with 409 once a report is approved: editing an approved report would
 * make the approval meaningless. Return it to draft first.
 */
export const PATCH = withAuth(
  "reports:edit",
  async (
    { auth, requestId },
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const body = await parseJsonBody(request, updateReportSchema, requestId);
    if (!body.ok) return body.response;

    const report = await updateReportContent(auth, id, body.data, requestId);
    return jsonOk(report, requestId);
  },
);
