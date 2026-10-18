import type { NextResponse } from "next/server";

import { jsonOk, parseJsonBody, withAuth } from "@/lib/services/api-helpers";
import { checkRegulatorySource } from "@/lib/services/regulatory-service";
import { regulatoryCheckSchema } from "@/lib/validation/schemas";

/**
 * POST /api/regulatory-sources/[id]/check — runs a check now.
 *
 * For a real authority with no live provider configured, this records a FAILED
 * check explaining that nothing was retrieved. It never manufactures a
 * plausible-looking result.
 */
export const POST = withAuth(
  "regulatorySources:check",
  async (
    { auth, requestId },
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const body = await parseJsonBody(request, regulatoryCheckSchema, requestId);
    if (!body.ok) return body.response;

    const result = await checkRegulatorySource(auth, id, requestId, body.data.note);
    return jsonOk(result, requestId);
  },
);
