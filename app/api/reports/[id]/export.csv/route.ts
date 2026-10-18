import type { NextResponse } from "next/server";

import { fileResponse, jsonError, withAuth } from "@/lib/services/api-helpers";
import { generateReportCsv } from "@/lib/services/report-document";
import { getReportDetail, recordReportExport } from "@/lib/services/report-service";

/** GET /api/reports/[id]/export.csv — the report's domains and evidence as CSV. */
export const GET = withAuth(
  "reports:export",
  async (
    { auth, requestId },
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const report = await getReportDetail(auth, id);

    if (!report) {
      return jsonError("NOT_FOUND", `No report was found for "${id}".`, 404, requestId);
    }

    const result = generateReportCsv(report);
    await recordReportExport(auth, id, "csv", requestId);

    return fileResponse(result.csv, {
      filename: result.filename,
      contentType: "text/csv; charset=utf-8",
      requestId,
    });
  },
);
