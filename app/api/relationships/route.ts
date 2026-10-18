import { jsonOk, parseQuery, withAuth } from "@/lib/services/api-helpers";
import { getRelationshipGraph } from "@/lib/services/domain-service";
import { relationshipQuerySchema } from "@/lib/validation/schemas";

/** GET /api/relationships — nodes and edges for the relationship graph. */
export const GET = withAuth(
  "relationships:read",
  async ({ auth, requestId }, request: Request) => {
    const query = parseQuery(request, relationshipQuerySchema, requestId);
    if (!query.ok) return query.response;

    const graph = await getRelationshipGraph(auth, query.data);
    return jsonOk(graph, requestId);
  },
);
