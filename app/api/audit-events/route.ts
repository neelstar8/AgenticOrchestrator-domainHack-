import { getRepository } from "@/lib/repositories";
import { jsonOk, parseQuery, withAuth } from "@/lib/services/api-helpers";
import { auditQuerySchema } from "@/lib/validation/schemas";

/**
 * GET /api/audit-events — the append-only event stream.
 *
 * There is deliberately no POST, PATCH or DELETE here: audit events are
 * written only as a side effect of the action they describe.
 */
export const GET = withAuth("audit:read", async ({ auth: _auth, requestId }, request: Request) => {
  const query = parseQuery(request, auditQuerySchema, requestId);
  if (!query.ok) return query.response;

  const repository = await getRepository();
  const [page, actors] = await Promise.all([
    repository.listAuditEvents(query.data),
    repository.listAuditActors(),
  ]);

  return jsonOk({ ...page, actors }, requestId);
});
