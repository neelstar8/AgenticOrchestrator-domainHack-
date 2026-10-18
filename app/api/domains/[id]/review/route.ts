import type { NextResponse } from "next/server";

import { jsonOk, parseJsonBody, withAuth } from "@/lib/services/api-helpers";
import { updateDomainReview } from "@/lib/services/domain-service";
import { updateDomainReviewSchema } from "@/lib/validation/schemas";

/**
 * PATCH /api/domains/[id]/review — records a human review decision.
 *
 * Escalating, dismissing or marking a domain not related requires a stated
 * reason (enforced by the schema), and a reviewer note is additionally stored
 * as REVIEWER_ASSESSMENT evidence.
 */
export const PATCH = withAuth(
  "domains:review",
  async (
    { auth, requestId },
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const body = await parseJsonBody(request, updateDomainReviewSchema, requestId);
    if (!body.ok) return body.response;

    const domain = await updateDomainReview(auth, id, body.data, requestId);
    return jsonOk(domain, requestId);
  },
);
