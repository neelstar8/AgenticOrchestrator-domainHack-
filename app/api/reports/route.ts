import { jsonOk, parseJsonBody, parseQuery, withAuth } from "@/lib/services/api-helpers";
import { createReport, listReports } from "@/lib/services/report-service";
import { createReportSchema, reportQuerySchema } from "@/lib/validation/schemas";

/** GET /api/reports — filterable, paginated report list. */
export const GET = withAuth("reports:read", async ({ auth, requestId }, request: Request) => {
  const query = parseQuery(request, reportQuerySchema, requestId);
  if (!query.ok) return query.response;

  const page = await listReports(auth, query.data);
  return jsonOk(page, requestId);
});

/**
 * POST /api/reports — creates a draft.
 *
 * Rejected unless at least one selected domain carries both an observed fact
 * and a reviewer assessment, and unless the limitations section is filled in.
 */
export const POST = withAuth("reports:create", async ({ auth, requestId }, request: Request) => {
  const body = await parseJsonBody(request, createReportSchema, requestId);
  if (!body.ok) return body.response;

  const report = await createReport(auth, body.data, requestId);
  return jsonOk(report, requestId, 201);
});
