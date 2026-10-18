import type { NextResponse } from "next/server";

import { jsonOk, parseJsonBody, withAuth } from "@/lib/services/api-helpers";
import { confirmRelationship } from "@/lib/services/domain-service";
import { confirmRelationshipSchema } from "@/lib/validation/schemas";

/**
 * POST /api/relationships/[id]/confirm — a reviewer confirms a relationship.
 *
 * Requires a written explanation of what evidence supports it, because
 * "confirmed" is the strongest claim the graph can carry.
 */
export const POST = withAuth(
  "relationships:confirm",
  async (
    { auth, requestId },
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const body = await parseJsonBody(request, confirmRelationshipSchema, requestId);
    if (!body.ok) return body.response;

    const relationship = await confirmRelationship(auth, id, body.data.reason, requestId);
    return jsonOk(relationship, requestId);
  },
);
