import { NextResponse } from "next/server";

import { jsonOk, newRequestId } from "@/lib/services/api-helpers";
import { logout } from "@/lib/services/auth-service";

/** POST /api/auth/logout — destroys the session. Idempotent. */
export async function POST(): Promise<NextResponse> {
  const requestId = newRequestId();
  await logout(requestId);
  return jsonOk({ signedOut: true }, requestId);
}
