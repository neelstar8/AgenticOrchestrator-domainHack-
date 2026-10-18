import { fileResponse, parseQuery, withAuth } from "@/lib/services/api-helpers";
import { exportDomainsCsv } from "@/lib/services/domain-service";
import { domainQuerySchema } from "@/lib/validation/schemas";

/**
 * GET /api/domains/export — CSV of the current filter selection.
 *
 * The file carries a header preamble stating how many rows are simulated and
 * that "Not checked" is not a negative result, so the meaning survives being
 * opened in a spreadsheet.
 */
export const GET = withAuth("domains:export", async ({ auth, requestId }, request: Request) => {
  const query = parseQuery(request, domainQuerySchema, requestId);
  if (!query.ok) return query.response;

  const result = await exportDomainsCsv(auth, { ...query.data, pageSize: 5000 }, requestId);
  return fileResponse(result.csv, {
    filename: result.filename,
    contentType: "text/csv; charset=utf-8",
    requestId,
  });
});
