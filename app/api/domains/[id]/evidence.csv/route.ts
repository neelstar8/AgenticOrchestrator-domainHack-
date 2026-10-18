import type { NextResponse } from "next/server";

import { fileResponse, jsonError, withAuth } from "@/lib/services/api-helpers";
import { exportDomainEvidenceCsv } from "@/lib/services/domain-service";

/** GET /api/domains/[id]/evidence.csv — one domain's evidence as CSV. */
export const GET = withAuth(
  "domains:export",
  async (
    { auth, requestId },
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const result = await exportDomainEvidenceCsv(auth, decodeURIComponent(id));

    if (!result) {
      return jsonError("NOT_FOUND", `No domain was found for "${id}".`, 404, requestId);
    }
    return fileResponse(result.csv, {
      filename: result.filename,
      contentType: "text/csv; charset=utf-8",
      requestId,
    });
  },
);
