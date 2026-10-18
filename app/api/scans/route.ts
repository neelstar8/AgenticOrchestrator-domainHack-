import { NextResponse } from "next/server";

import { jsonOk, parseJsonBody, parseQuery, withAuth } from "@/lib/services/api-helpers";
import { createScan, listScans } from "@/lib/services/scan-service";
import { createScanSchema, scanQuerySchema } from "@/lib/validation/schemas";

/** GET /api/scans — filterable, sortable, paginated scan history. */
export const GET = withAuth("scans:read", async ({ auth, requestId }, request: Request) => {
  const query = parseQuery(request, scanQuerySchema, requestId);
  if (!query.ok) return query.response;

  const page = await listScans(auth, query.data);
  return jsonOk(page, requestId);
});

/**
 * POST /api/scans — creates a scan and starts it in the background.
 *
 * Returns as soon as the task plan is persisted; the client polls
 * /api/scans/[id]/progress for live state.
 */
export const POST = withAuth("scans:create", async ({ auth, requestId }, request: Request) => {
  const body = await parseJsonBody(request, createScanSchema, requestId);
  if (!body.ok) return body.response;

  const result = await createScan(auth, body.data, requestId);

  return jsonOk(
    {
      scan: result.scan,
      taskCount: result.taskCount,
      isSimulated: result.isSimulated,
      message: result.isSimulated
        ? "Demo simulation started. Findings are generated locally from synthetic fixtures."
        : "Scan started.",
    },
    requestId,
    201,
  );
});
