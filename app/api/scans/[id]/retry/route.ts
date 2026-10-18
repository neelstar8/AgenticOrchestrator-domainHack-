import { NextResponse } from "next/server";

import { jsonOk, withAuth } from "@/lib/services/api-helpers";
import { retryScan } from "@/lib/services/scan-service";

/**
 * POST /api/scans/[id]/retry — re-runs a scan's inputs as a NEW scan.
 *
 * The original record is never rewritten, so history stays intact and the
 * retry is separately auditable.
 */
export const POST = withAuth(
  "scans:create",
  async (
    { auth, requestId },
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const result = await retryScan(auth, id, requestId);

    return jsonOk(
      {
        scan: result.scan,
        taskCount: result.taskCount,
        isSimulated: result.isSimulated,
        message: `Started ${result.scan.reference} with the same inputs. The original scan record is unchanged.`,
      },
      requestId,
      201,
    );
  },
);
