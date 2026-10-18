import { NextResponse } from "next/server";

import { jsonError, jsonOk, newRequestId, parseJsonBody } from "@/lib/services/api-helpers";
import { listDemoAccounts, login } from "@/lib/services/auth-service";
import { loginSchema } from "@/lib/validation/schemas";
import { hasConfiguredSessionSecret } from "@/lib/config/env";

/** POST /api/auth/login — establishes a session. */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = newRequestId();

  const body = await parseJsonBody(request, loginSchema, requestId);
  if (!body.ok) return body.response;

  const result = await login(body.data, requestId);

  if (!result.ok) {
    return jsonError(
      result.code,
      result.message,
      result.code === "RATE_LIMITED" ? 429 : 401,
      requestId,
    );
  }

  return jsonOk(
    {
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        jobTitle: result.user.jobTitle,
        isDemoUser: result.user.isDemoUser,
      },
      permissions: result.permissions,
      // The UI uses this to label the session honestly rather than implying
      // production-grade session security when the secret is ephemeral.
      sessionSecretConfigured: hasConfiguredSessionSecret(),
      next: body.data.next ?? "/overview",
    },
    requestId,
  );
}

/** GET /api/auth/login — the demo accounts shown on the sign-in screen. */
export async function GET(): Promise<NextResponse> {
  const requestId = newRequestId();
  return jsonOk(
    {
      demoAccounts: await listDemoAccounts(),
      sessionSecretConfigured: hasConfiguredSessionSecret(),
    },
    requestId,
  );
}
