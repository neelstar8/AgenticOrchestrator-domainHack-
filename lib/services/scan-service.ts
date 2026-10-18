import "server-only";

import {
  ScanOrchestrator,
  buildProgress,
  countActiveRuns,
  getRunState,
  reconcileOrphanedScans,
  requestCancellation,
} from "@/agents/orchestrator/scan-orchestrator";
import { createProviderRegistryAsync } from "@/agents/providers/registry";
import { getEnv } from "@/lib/config/env";
import { getRepository } from "@/lib/repositories";
import type { Scan } from "@/lib/types/models";
import type {
  Paginated,
  ScanDetail,
  ScanListItem,
  ScanProgress,
  ScanQuery,
} from "@/lib/types/views";
import type { DiscoveryScope } from "@/lib/types/enums";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/auth/guards";
import type { CreateScanInputDto } from "@/lib/validation/schemas";

/**
 * Scan service.
 *
 * Owns scan creation and the concurrency limit, and is the only place that
 * launches the orchestrator. The scan runs in the background: the request that
 * creates it returns as soon as the task plan is persisted, and the UI polls
 * for progress. A request must never block for the length of a scan.
 */

export class ScanLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanLimitError";
  }
}

/** Quick runs a reduced scope set; Comprehensive runs everything selected. */
const QUICK_PROFILE_SCOPES: DiscoveryScope[] = [
  "SEARCH_INDEX",
  "DOMAIN_VARIATIONS",
  "TECHNICAL_INSPECTION",
  "REGULATORY_MATCHING",
];

async function nextScanReference(): Promise<string> {
  const repository = await getRepository();
  const existing = await repository.listScans({ pageSize: 200 });
  const year = new Date().getUTCFullYear();
  const prefix = `SNT-SCN-${year}-`;

  const highest = existing.items
    .map((scan) => scan.reference)
    .filter((reference) => reference.startsWith(prefix))
    .map((reference) => Number.parseInt(reference.slice(prefix.length), 10))
    .filter((value) => Number.isFinite(value))
    .reduce((max, value) => Math.max(max, value), 100);

  return `${prefix}${String(highest + 1).padStart(4, "0")}`;
}

export async function listScans(
  auth: AuthenticatedUser,
  query: ScanQuery,
): Promise<Paginated<ScanListItem>> {
  if (!auth.can("scans:read")) throw new ForbiddenError("scans:read", auth.user.role);
  const repository = await getRepository();
  // A page load is a good moment to notice a scan orphaned by a restart.
  await reconcileOrphanedScans(repository);
  return repository.listScans(query);
}

export async function getScanDetail(
  auth: AuthenticatedUser,
  id: string,
): Promise<ScanDetail | null> {
  if (!auth.can("scans:read")) throw new ForbiddenError("scans:read", auth.user.role);
  const repository = await getRepository();
  return repository.getScanDetail(id);
}

export async function getScanProgress(
  auth: AuthenticatedUser,
  id: string,
): Promise<ScanProgress | null> {
  if (!auth.can("scans:read")) throw new ForbiddenError("scans:read", auth.user.role);
  const repository = await getRepository();

  const scan = await repository.getScanById(id);
  if (!scan) return null;

  const tasks = await repository.listAgentTasksForScan(id);
  return buildProgress(scan, tasks, getRunState(id));
}

export interface CreateScanResult {
  scan: Scan;
  taskCount: number;
  /** True when the findings will be simulated, which the UI must say plainly. */
  isSimulated: boolean;
}

export async function createScan(
  auth: AuthenticatedUser,
  input: CreateScanInputDto,
  requestId: string,
): Promise<CreateScanResult> {
  if (!auth.can("scans:create")) throw new ForbiddenError("scans:create", auth.user.role);

  const env = getEnv();
  const repository = await getRepository();

  await reconcileOrphanedScans(repository);

  const active = Math.max(await repository.countActiveScans(), countActiveRuns());
  if (active >= env.SENTINEL_MAX_CONCURRENT_SCANS) {
    throw new ScanLimitError(
      `${active} scan(s) are already running and the limit is ` +
        `${env.SENTINEL_MAX_CONCURRENT_SCANS}. Wait for one to finish or cancel it, then try again.`,
    );
  }

  const maxCandidates = Math.min(input.maxCandidates, env.SENTINEL_MAX_CANDIDATES_PER_SCAN);

  // Quick narrows the selection rather than overriding it: an operator who
  // did not select a scope never gets it run.
  const scopes =
    input.profile === "QUICK"
      ? input.scopes.filter((scope) => QUICK_PROFILE_SCOPES.includes(scope))
      : input.scopes;

  const effectiveScopes = scopes.length > 0 ? scopes : input.scopes;

  const platform = await repository.findPlatformByName(input.platformName);
  const platformRecord =
    platform ??
    (await repository.upsertPlatform({
      name: input.platformName,
      origin: "SIMULATED_DEMO",
      description:
        "Created from a scan request. Associations recorded under this platform are discovery " +
        "records, not findings.",
    }));

  const reference = await nextScanReference();
  const scan = await repository.createScan({
    reference,
    platformId: platformRecord.id,
    platformNameInput: input.platformName,
    seedDomain: input.seedDomain ?? null,
    notes: input.notes || null,
    profile: input.profile,
    scopes: effectiveScopes,
    maxCandidates,
    initiatedById: auth.user.id,
    // Demo mode produces simulated findings, and the record says so.
    origin: env.SENTINEL_MODE === "demo" ? "SIMULATED_DEMO" : "LIVE_COLLECTED",
  });

  await repository.appendAuditEvent({
    actorId: auth.user.id,
    actorLabel: auth.user.name,
    action: "SCAN_CREATED",
    entityType: "SCAN",
    entityId: scan.id,
    entityLabel: scan.reference,
    newState: {
      status: "QUEUED",
      profile: scan.profile,
      scopes: effectiveScopes,
      seedDomain: scan.seedDomain,
      maxCandidates,
    },
    reason: input.notes || null,
    requestId,
  });

  const providers = await createProviderRegistryAsync(env);
  const orchestrator = new ScanOrchestrator({
    scan,
    actor: { id: auth.user.id, name: auth.user.name },
    repository,
    providers,
    requestId,
  });

  const tasks = await orchestrator.prepare();

  // Deliberately not awaited: the request returns immediately and the UI polls
  // for progress. A rejection here is recorded by the orchestrator's own
  // finalise step, so the scan can never be left silently half-done.
  void orchestrator.run_().catch((error: unknown) => {
    console.error(
      `[sentinel] scan ${scan.reference} ended unexpectedly:`,
      error instanceof Error ? error.message : String(error),
    );
  });

  return {
    scan,
    taskCount: tasks.length,
    isSimulated: scan.origin === "SIMULATED_DEMO",
  };
}

export interface CancelScanResult {
  cancelled: boolean;
  message: string;
}

export async function cancelScan(
  auth: AuthenticatedUser,
  id: string,
  requestId: string,
): Promise<CancelScanResult> {
  if (!auth.can("scans:cancel")) throw new ForbiddenError("scans:cancel", auth.user.role);

  const repository = await getRepository();
  const scan = await repository.getScanById(id);
  if (!scan) return { cancelled: false, message: "That scan was not found." };

  if (scan.status !== "RUNNING" && scan.status !== "QUEUED") {
    return {
      cancelled: false,
      message: `This scan is already ${scan.status.toLowerCase().replace(/_/g, " ")}, so there is nothing to cancel.`,
    };
  }

  const signalled = requestCancellation(id);

  if (!signalled) {
    // No live run owns it, so it was orphaned rather than running.
    await repository.updateScan(id, {
      status: "CANCELLED",
      cancelledAt: new Date().toISOString(),
      errorMessage:
        "Cancelled. No running process owned this scan, so it was almost certainly interrupted " +
        "by a restart before cancellation.",
    });
    await repository.appendAuditEvent({
      actorId: auth.user.id,
      actorLabel: auth.user.name,
      action: "SCAN_CANCELLED",
      entityType: "SCAN",
      entityId: id,
      entityLabel: scan.reference,
      previousState: { status: scan.status },
      newState: { status: "CANCELLED" },
      reason: "Cancelled a scan with no running process.",
      requestId,
    });
    return {
      cancelled: true,
      message: "Marked as cancelled. No running process owned this scan.",
    };
  }

  return {
    cancelled: true,
    message:
      "Cancellation requested. The current step will stop shortly and anything already " +
      "collected is kept.",
  };
}

/**
 * Retries a scan by creating a fresh one with the same inputs.
 *
 * A completed scan's record is never rewritten: history stays intact and the
 * retry is a new, separately auditable run.
 */
export async function retryScan(
  auth: AuthenticatedUser,
  id: string,
  requestId: string,
): Promise<CreateScanResult> {
  if (!auth.can("scans:create")) throw new ForbiddenError("scans:create", auth.user.role);

  const repository = await getRepository();
  const original = await repository.getScanById(id);
  if (!original) throw new Error(`Scan "${id}" was not found.`);

  return createScan(
    auth,
    {
      platformName: original.platformNameInput,
      seedDomain: original.seedDomain,
      notes: `Retry of ${original.reference}.${original.notes ? ` ${original.notes}` : ""}`,
      scopes: original.scopes,
      maxCandidates: original.maxCandidates,
      profile: original.profile,
    },
    requestId,
  );
}
