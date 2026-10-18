import { getEnv } from "@/lib/config/env";
import { getRepository } from "@/lib/repositories";
import { clearFileStoreCache } from "@/lib/repositories/file-store";
import { clearRepositoryCache } from "@/lib/repositories";
import { jsonError, jsonOk, withAuth } from "@/lib/services/api-helpers";

/**
 * POST /api/dev/reset — wipes and reseeds the demo dataset.
 *
 * Destructive, so it is gated three ways and ALL THREE must hold:
 *   1. NODE_ENV must not be "production";
 *   2. SENTINEL_ALLOW_DEV_RESET must be true;
 *   3. the caller must hold the administrator-only "demo:reset" permission.
 *
 * Setting the flag in a production environment therefore still does not enable
 * it, and `assertProductionReady()` refuses to boot production with it set.
 */
export const POST = withAuth("demo:reset", async ({ auth, requestId }) => {
  const env = getEnv();

  if (env.NODE_ENV === "production") {
    return jsonError(
      "FORBIDDEN_IN_PRODUCTION",
      "Resetting the demo dataset is not available in production.",
      403,
      requestId,
    );
  }

  if (!env.SENTINEL_ALLOW_DEV_RESET) {
    return jsonError(
      "DISABLED",
      "Demo reset is disabled. Set SENTINEL_ALLOW_DEV_RESET=true in .env.local to enable it " +
        "in development.",
      403,
      requestId,
    );
  }

  const repository = await getRepository();

  if (repository.kind !== "file") {
    return jsonError(
      "UNSUPPORTED",
      "Reset is only supported for the file-backed demo repository. Use the Prisma migrate and " +
        "seed commands deliberately against a database.",
      409,
      requestId,
    );
  }

  await repository.resetToSeed();

  // The reset is recorded in the FRESH dataset, so the audit log shows it.
  await repository.appendAuditEvent({
    actorId: auth.user.id,
    actorLabel: auth.user.name,
    action: "DEMO_DATA_RESET",
    entityType: "SYSTEM",
    entityId: "demo-dataset",
    entityLabel: "Demo dataset",
    reason:
      "The demo dataset was wiped and reseeded. All scans, reviews and reports created since " +
      "the last reset were discarded.",
    requestId,
  });

  clearFileStoreCache();
  clearRepositoryCache();

  return jsonOk(
    {
      reset: true,
      message:
        "The demo dataset has been reseeded. Any scans, reviews or reports you created have been " +
        "discarded.",
    },
    requestId,
  );
});
