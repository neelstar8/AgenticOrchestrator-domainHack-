import type { NextResponse } from "next/server";

import { jsonError, jsonOk, withAuth } from "@/lib/services/api-helpers";
import { getDomainDetail } from "@/lib/services/domain-service";

/** GET /api/domains/[id] — accepts an id or an FQDN. */
export const GET = withAuth(
  "domains:read",
  async (
    { auth, requestId },
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const detail = await getDomainDetail(auth, decodeURIComponent(id));

    if (!detail) {
      return jsonError("NOT_FOUND", `No domain was found for "${id}".`, 404, requestId);
    }
    return jsonOk(detail, requestId);
  },
);
