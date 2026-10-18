import type { NextResponse } from "next/server";

import { jsonError, jsonOk, parseJsonBody, withAuth } from "@/lib/services/api-helpers";
import {
  getRegulatorySourceDetail,
  updateRegulatorySource,
} from "@/lib/services/regulatory-service";
import { updateRegulatorySourceSchema } from "@/lib/validation/schemas";

/** GET /api/regulatory-sources/[id] — a source with its check and match history. */
export const GET = withAuth(
  "regulatorySources:read",
  async (
    { auth, requestId },
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const detail = await getRegulatorySourceDetail(auth, id);

    if (!detail) {
      return jsonError("NOT_FOUND", `No regulatory source was found for "${id}".`, 404, requestId);
    }
    return jsonOk(detail, requestId);
  },
);

/**
 * PATCH /api/regulatory-sources/[id] — edit, enable or disable a source.
 *
 * Changing the URL clears the previous retrieval state: it no longer describes
 * what is at that address.
 */
export const PATCH = withAuth(
  "regulatorySources:manage",
  async (
    { auth, requestId },
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const body = await parseJsonBody(request, updateRegulatorySourceSchema, requestId);
    if (!body.ok) return body.response;

    const source = await updateRegulatorySource(auth, id, body.data, requestId);
    return jsonOk(source, requestId);
  },
);
