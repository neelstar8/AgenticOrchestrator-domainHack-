import type { NextResponse } from "next/server";

import { jsonOk, parseJsonBody, withAuth } from "@/lib/services/api-helpers";
import { applyReportTransition } from "@/lib/services/report-service";
import { reportTransitionSchema } from "@/lib/validation/schemas";

/**
 * POST /api/reports/[id]/status — applies a workflow transition.
 *
 * Each action checks its own permission in the service layer: holding
 * "reports:edit" does not let a caller approve a report or record an official
 * outcome. Illegal transitions answer 409 with the permitted next steps.
 */
export const POST = withAuth(
  // The specific permission is enforced per action inside the service, so the
  // wrapper only requires that the caller can read reports at all.
  "reports:read",
  async (
    { auth, requestId },
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const body = await parseJsonBody(request, reportTransitionSchema, requestId);
    if (!body.ok) return body.response;

    const report = await applyReportTransition(auth, id, body.data, requestId);
    return jsonOk(report, requestId);
  },
);
