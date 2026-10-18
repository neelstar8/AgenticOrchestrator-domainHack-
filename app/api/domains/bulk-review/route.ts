import { jsonOk, parseJsonBody, withAuth } from "@/lib/services/api-helpers";
import { bulkUpdateDomainReview } from "@/lib/services/domain-service";
import { bulkDomainReviewSchema } from "@/lib/validation/schemas";

/**
 * POST /api/domains/bulk-review — applies one review status to many domains.
 *
 * A reason is mandatory, and domains already included in a report are skipped
 * rather than silently overwritten.
 */
export const POST = withAuth(
  "domains:bulkReview",
  async ({ auth, requestId }, request: Request) => {
    const body = await parseJsonBody(request, bulkDomainReviewSchema, requestId);
    if (!body.ok) return body.response;

    const result = await bulkUpdateDomainReview(auth, body.data, requestId);
    return jsonOk(result, requestId);
  },
);
