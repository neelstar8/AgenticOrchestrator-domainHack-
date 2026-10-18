import type { NextResponse } from "next/server";

import { jsonError, jsonOk, withAuth } from "@/lib/services/api-helpers";
import { getRegulatorySourceDetail } from "@/lib/services/regulatory-service";

/** GET /api/regulatory-sources/[id]/history — check history and matches. */
export const GET = withAuth(
  "regulatorySources:read",
  async (
    { auth, requestId },
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const detail = await getRegulatorySourceDetail(auth, id);

    if (!detail) {
      return jsonError("NOT_FOUND", `No regulatory source was found for "${id}".`, 404, requestId);
    }

    return jsonOk(
      {
        sourceId: detail.id,
        isFixtureSource: detail.isFixtureSource,
        checks: detail.checks,
        matches: detail.matches,
        isStale: detail.isStale,
      },
      requestId,
    );
  },
);
