import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/guards";
import { jsonOk, newRequestId } from "@/lib/services/api-helpers";

/**
 * GET /api/auth/session — the current session, or null.
 *
 * Returns 200 with `user: null` rather than 401, so a client can poll it to
 * detect an expired session without treating it as an error.
 */
export async function GET(): Promise<NextResponse> {
  const requestId = newRequestId();
  const current = await getCurrentUser();

  if (!current) {
    return jsonOk({ user: null, permissions: [] as string[] }, requestId);
  }

  return jsonOk(
    {
      user: {
        id: current.user.id,
        name: current.user.name,
        email: current.user.email,
        role: current.user.role,
        jobTitle: current.user.jobTitle,
        isDemoUser: current.user.isDemoUser,
      },
      permissions: current.permissions,
      isDevelopmentSession: current.isDevelopmentSession,
    },
    requestId,
  );
}
