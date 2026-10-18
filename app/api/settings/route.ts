import { getProviderStatuses } from "@/lib/config/env";
import { getPublicConfig } from "@/lib/config/public-config";
import { jsonOk, parseJsonBody, withAuth } from "@/lib/services/api-helpers";
import { listSettings, updateSettings } from "@/lib/services/regulatory-service";
import { updateSettingsSchema } from "@/lib/validation/schemas";

/**
 * GET /api/settings — non-secret settings plus honest provider status.
 *
 * A secret's VALUE is never returned; only whether it is configured.
 */
export const GET = withAuth("settings:read", async ({ auth, requestId }) => {
  const [settings] = await Promise.all([listSettings(auth)]);

  return jsonOk(
    {
      settings,
      providers: getProviderStatuses(),
      config: getPublicConfig(),
    },
    requestId,
  );
});

/**
 * PATCH /api/settings — changes non-secret, editable settings.
 *
 * Secrets and environment-derived values are rejected with the reason, rather
 * than appearing to save and silently doing nothing.
 */
export const PATCH = withAuth("settings:write", async ({ auth, requestId }, request: Request) => {
  const body = await parseJsonBody(request, updateSettingsSchema, requestId);
  if (!body.ok) return body.response;

  const result = await updateSettings(auth, body.data, requestId);
  return jsonOk(result, requestId);
});
