import { NextResponse } from "next/server";

import { jsonOk, withAuth } from "@/lib/services/api-helpers";
import { cancelScan } from "@/lib/services/scan-service";

/** POST /api/scans/[id]/cancel — requests cancellation of a running scan. */
export const POST = withAuth(
  "scans:cancel",
  async (
    { auth, requestId },
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const result = await cancelScan(auth, id, requestId);
    return jsonOk(result, requestId, result.cancelled ? 200 : 409);
  },
);
