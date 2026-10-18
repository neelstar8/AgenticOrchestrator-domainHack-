import { NextResponse } from "next/server";

import { getRepository } from "@/lib/repositories";
import { jsonOk, withAuth } from "@/lib/services/api-helpers";

/** GET /api/metrics/overview — every figure on the Overview dashboard. */
export const GET = withAuth("domains:read", async ({ requestId }): Promise<NextResponse> => {
  const repository = await getRepository();
  const metrics = await repository.getOverviewMetrics();
  return jsonOk(metrics, requestId);
});
