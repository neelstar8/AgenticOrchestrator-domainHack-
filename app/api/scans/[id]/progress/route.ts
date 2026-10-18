import { NextResponse } from "next/server";

import { jsonError, jsonOk, withAuth } from "@/lib/services/api-helpers";
import { getScanProgress } from "@/lib/services/scan-service";

/**
 * GET /api/scans/[id]/progress — live progress for a running scan.
 *
 * Polled by the UI roughly every 700ms while a scan is active. Reads
 * in-process run state when the scan is running and falls back to the stored
 * record once it is finished, so a poll after a restart returns the real
 * outcome rather than an error.
 */
export const GET = withAuth(
  "scans:read",
  async (
    { auth, requestId },
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const progress = await getScanProgress(auth, id);

    if (!progress) {
      return jsonError("NOT_FOUND", `No scan was found for "${id}".`, 404, requestId);
    }
    return jsonOk(progress, requestId);
  },
);
