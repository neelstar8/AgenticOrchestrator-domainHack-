import { jsonOk, withAuth } from "@/lib/services/api-helpers";
import { listDomainFilterOptions } from "@/lib/services/domain-service";

/** GET /api/domains/filters — the option lists the registry filters need. */
export const GET = withAuth("domains:read", async ({ auth, requestId }) => {
  return jsonOk(await listDomainFilterOptions(auth), requestId);
});
