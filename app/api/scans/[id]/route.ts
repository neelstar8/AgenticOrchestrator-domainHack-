import { NextResponse } from "next/server";

import { jsonError, jsonOk, withAuth } from "@/lib/services/api-helpers";
import { getScanDetail } from "@/lib/services/scan-service";

/** GET /api/scans/[id] — full scan detail, including the agent timeline. */
export const GET = withAuth(
  "scans:read",
  async (
    { auth, requestId },
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const detail = await getScanDetail(auth, id);

    if (!detail) {
      return jsonError("NOT_FOUND", `No scan was found for "${id}".`, 404, requestId);
    }
    return jsonOk(detail, requestId);
  },
);
