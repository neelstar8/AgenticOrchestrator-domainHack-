import { jsonOk, parseJsonBody, withAuth } from "@/lib/services/api-helpers";
import {
  createRegulatorySource,
  listRegulatorySources,
} from "@/lib/services/regulatory-service";
import { createRegulatorySourceSchema } from "@/lib/validation/schemas";

/**
 * GET /api/regulatory-sources — configured sources.
 *
 * Returns real authorities and simulated fixtures as SEPARATE lists so the UI
 * cannot render a fictional fixture as though it were an official record.
 */
export const GET = withAuth("regulatorySources:read", async ({ auth, requestId }) => {
  return jsonOk(await listRegulatorySources(auth), requestId);
});

/** POST /api/regulatory-sources — adds a source. */
export const POST = withAuth(
  "regulatorySources:manage",
  async ({ auth, requestId }, request: Request) => {
    const body = await parseJsonBody(request, createRegulatorySourceSchema, requestId);
    if (!body.ok) return body.response;

    const source = await createRegulatorySource(auth, body.data, requestId);
    return jsonOk(source, requestId, 201);
  },
);
