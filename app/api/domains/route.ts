import { jsonOk, parseQuery, withAuth } from "@/lib/services/api-helpers";
import { listDomains } from "@/lib/services/domain-service";
import { domainQuerySchema } from "@/lib/validation/schemas";

/** GET /api/domains — the filterable, sortable, paginated registry. */
export const GET = withAuth("domains:read", async ({ auth, requestId }, request: Request) => {
  const query = parseQuery(request, domainQuerySchema, requestId);
  if (!query.ok) return query.response;

  const page = await listDomains(auth, query.data);
  return jsonOk(page, requestId);
});
