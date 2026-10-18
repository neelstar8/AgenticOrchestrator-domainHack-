import "server-only";

import { createProviderRegistryAsync } from "@/agents/providers/registry";
import { createProviderContext } from "@/agents/providers/types";
import { isFixtureSourceUrl } from "@/agents/orchestrator/scan-orchestrator";
import { getEnv } from "@/lib/config/env";
import { getRepository } from "@/lib/repositories";
import type { RegulatorySource } from "@/lib/types/models";
import type { RegulatorySourceDetail, RegulatorySourceListItem } from "@/lib/types/views";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/auth/guards";
import type {
  CreateRegulatorySourceDto,
  UpdateSettingsDto,
} from "@/lib/validation/schemas";

/**
 * Regulatory source service.
 *
 * The rule that shapes this file: Sentinel never invents what an official
 * publication says. A manual check against a real authority with no live
 * provider configured does not produce a plausible-looking result — it
 * produces a recorded refusal explaining exactly why nothing was retrieved.
 */

export interface SourceCheckResult {
  sourceId: string;
  performed: boolean;
  status: string;
  matchesRecorded: number;
  nonMatchesRecorded: number;
  message: string;
}

export async function listRegulatorySources(
  auth: AuthenticatedUser,
): Promise<{
  configuredRealSources: RegulatorySourceListItem[];
  simulatedFixtureSources: RegulatorySourceListItem[];
}> {
  if (!auth.can("regulatorySources:read")) {
    throw new ForbiddenError("regulatorySources:read", auth.user.role);
  }

  const repository = await getRepository();
  const all = await repository.listRegulatorySources();

  // The two groups are returned separately so the UI cannot accidentally
  // render a fictional fixture alongside a real authority as if they were
  // equivalent records.
  return {
    configuredRealSources: all.filter((source) => !isFixtureSourceUrl(source.sourceUrl)),
    simulatedFixtureSources: all.filter((source) => isFixtureSourceUrl(source.sourceUrl)),
  };
}

export async function getRegulatorySourceDetail(
  auth: AuthenticatedUser,
  id: string,
): Promise<(RegulatorySourceDetail & { isFixtureSource: boolean }) | null> {
  if (!auth.can("regulatorySources:read")) {
    throw new ForbiddenError("regulatorySources:read", auth.user.role);
  }

  const repository = await getRepository();
  const detail = await repository.getRegulatorySourceDetail(id);
  if (!detail) return null;
  return { ...detail, isFixtureSource: isFixtureSourceUrl(detail.sourceUrl) };
}

export async function createRegulatorySource(
  auth: AuthenticatedUser,
  input: CreateRegulatorySourceDto,
  requestId: string,
): Promise<RegulatorySource> {
  if (!auth.can("regulatorySources:manage")) {
    throw new ForbiddenError("regulatorySources:manage", auth.user.role);
  }

  const repository = await getRepository();
  const source = await repository.createRegulatorySource({
    authorityName: input.authorityName,
    authorityShortName: input.authorityShortName,
    title: input.title,
    sourceUrl: input.sourceUrl,
    sourceType: input.sourceType,
    description: input.description || null,
    isEnabled: input.isEnabled,
    checkIntervalHours: input.checkIntervalHours,
    verificationNotes:
      input.verificationNotes ||
      (isFixtureSourceUrl(input.sourceUrl)
        ? "Simulated fixture source at a reserved .invalid hostname."
        : "Configured official source. Sentinel has not retrieved it; live retrieval must be " +
          "enabled and a provider configured before any check can run."),
    origin: "SIMULATED_DEMO",
  });

  await repository.appendAuditEvent({
    actorId: auth.user.id,
    actorLabel: auth.user.name,
    action: "REGULATORY_SOURCE_CREATED",
    entityType: "REGULATORY_SOURCE",
    entityId: source.id,
    entityLabel: `${source.authorityShortName} — ${source.title}`,
    newState: {
      sourceUrl: source.sourceUrl,
      sourceType: source.sourceType,
      isEnabled: source.isEnabled,
      isFixtureSource: isFixtureSourceUrl(source.sourceUrl),
    },
    requestId,
  });

  return source;
}

export async function updateRegulatorySource(
  auth: AuthenticatedUser,
  id: string,
  input: Partial<CreateRegulatorySourceDto>,
  requestId: string,
): Promise<RegulatorySource> {
  if (!auth.can("regulatorySources:manage")) {
    throw new ForbiddenError("regulatorySources:manage", auth.user.role);
  }

  const repository = await getRepository();
  const existing = await repository.getRegulatorySourceById(id);
  if (!existing) throw new Error(`Regulatory source "${id}" was not found.`);

  const updated = await repository.updateRegulatorySource(id, {
    authorityName: input.authorityName,
    authorityShortName: input.authorityShortName,
    title: input.title,
    sourceUrl: input.sourceUrl,
    sourceType: input.sourceType,
    description: input.description,
    isEnabled: input.isEnabled,
    checkIntervalHours: input.checkIntervalHours,
    verificationNotes: input.verificationNotes,
    // Changing the URL invalidates everything previously retrieved from it.
    ...(input.sourceUrl && input.sourceUrl !== existing.sourceUrl
      ? {
          retrievalStatus: "NEVER_CHECKED" as const,
          lastSuccessfulCheckAt: null,
          lastCheckAttemptAt: null,
          retrievalError: null,
        }
      : {}),
  });

  await repository.appendAuditEvent({
    actorId: auth.user.id,
    actorLabel: auth.user.name,
    action: "REGULATORY_SOURCE_UPDATED",
    entityType: "REGULATORY_SOURCE",
    entityId: id,
    entityLabel: `${updated.authorityShortName} — ${updated.title}`,
    previousState: {
      sourceUrl: existing.sourceUrl,
      isEnabled: existing.isEnabled,
      retrievalStatus: existing.retrievalStatus,
    },
    newState: {
      sourceUrl: updated.sourceUrl,
      isEnabled: updated.isEnabled,
      retrievalStatus: updated.retrievalStatus,
    },
    reason:
      input.sourceUrl && input.sourceUrl !== existing.sourceUrl
        ? "The source URL changed, so previous retrieval state was cleared: it no longer describes this source."
        : null,
    requestId,
  });

  return updated;
}

/**
 * Runs a check against one configured source.
 *
 * For a real authority with no live provider configured, this records a failed
 * check with the reason — it does NOT manufacture a result. That refusal is
 * itself useful: the source-check history shows plainly that nothing has ever
 * been retrieved.
 */
export async function checkRegulatorySource(
  auth: AuthenticatedUser,
  id: string,
  requestId: string,
  note?: string,
): Promise<SourceCheckResult> {
  if (!auth.can("regulatorySources:check")) {
    throw new ForbiddenError("regulatorySources:check", auth.user.role);
  }

  const env = getEnv();
  const repository = await getRepository();
  const source = await repository.getRegulatorySourceById(id);
  if (!source) throw new Error(`Regulatory source "${id}" was not found.`);

  const startedAt = new Date().toISOString();

  if (!source.isEnabled) {
    return {
      sourceId: id,
      performed: false,
      status: "DISABLED",
      matchesRecorded: 0,
      nonMatchesRecorded: 0,
      message: "This source is disabled. Disabled sources are never contacted.",
    };
  }

  const providers = await createProviderRegistryAsync(env);
  const { context, dispose } = createProviderContext(requestId, 30_000);

  try {
    // Terms: every domain in the registry plus the platform names.
    const domains = await repository.listAllDomainsForExport({}, 200);
    const platforms = await repository.listPlatforms();

    const terms = [
      ...domains.map((domain) => ({
        term: domain.fqdn,
        domainId: domain.id,
        kind: "domain" as const,
      })),
      ...platforms.map((platform) => ({
        term: platform.name.replace(/\s+Investigation Demo$/i, "").trim(),
        domainId: null,
        kind: "entity" as const,
      })),
    ];

    const result = await providers.regulatorySource.check(
      {
        source: {
          sourceId: source.id,
          authorityShortName: source.authorityShortName,
          title: source.title,
          sourceUrl: source.sourceUrl,
          isFixtureSource: isFixtureSourceUrl(source.sourceUrl),
        },
        terms,
      },
      context,
    );

    if (!result.ok) {
      const status =
        result.error.code === "BLOCKED_BY_POLICY"
          ? ("BLOCKED_BY_SOURCE" as const)
          : result.error.code === "TIMEOUT"
            ? ("UNREACHABLE" as const)
            : result.error.code === "NOT_CONFIGURED"
              ? ("NEVER_CHECKED" as const)
              : ("HTTP_ERROR" as const);

      const check = await repository.createRegulatorySourceCheck({
        regulatorySourceId: id,
        startedAt,
        completedAt: new Date().toISOString(),
        status,
        matchedEntityCount: 0,
        errorMessage: result.error.message,
        note:
          "No content was retrieved, so this check established nothing about any term in either " +
          "direction. It is NOT a record of 'no matches found'.",
        origin: "SIMULATED_DEMO",
        triggeredById: auth.user.id,
      });

      await repository.updateRegulatorySource(id, {
        lastCheckAttemptAt: startedAt,
        // A refusal does not overwrite a genuine previous success.
        retrievalStatus: status,
        retrievalError: result.error.message,
      });

      await repository.appendAuditEvent({
        actorId: auth.user.id,
        actorLabel: auth.user.name,
        action: "REGULATORY_SOURCE_CHECKED",
        entityType: "REGULATORY_SOURCE",
        entityId: id,
        entityLabel: `${source.authorityShortName} — ${source.title}`,
        newState: { status, checkId: check.id, matchedEntityCount: 0 },
        reason: result.error.message,
        requestId,
      });

      return {
        sourceId: id,
        performed: false,
        status,
        matchesRecorded: 0,
        nonMatchesRecorded: 0,
        message: result.error.message,
      };
    }

    const outcome = result.data;
    const completedAt = outcome.completedAt;

    const check = await repository.createRegulatorySourceCheck({
      regulatorySourceId: id,
      startedAt: outcome.startedAt,
      completedAt,
      status: "OK",
      httpStatusCode: outcome.httpStatusCode,
      bytesRetrieved: outcome.bytesRetrieved,
      matchedEntityCount: outcome.matches.length,
      note: note ? `${note} ${outcome.note ?? ""}`.trim() : outcome.note,
      origin: result.metadata.origin,
      triggeredById: auth.user.id,
    });

    for (const match of outcome.matches) {
      const created = await repository.createRegulatoryMatch({
        regulatorySourceId: id,
        regulatorySourceCheckId: check.id,
        domainId: match.domainId,
        matchedTerm: match.term,
        matchedContext: match.context,
        matchType: match.matchType,
        confidence: match.confidence,
        sourceUrl: source.sourceUrl,
        sourceRetrievedAt: completedAt,
        notes: isFixtureSourceUrl(source.sourceUrl)
          ? "Match against a clearly-labelled fictional fixture source. No official weight."
          : "Requires human verification against the published document.",
        origin: result.metadata.origin,
      });
      await repository.appendAuditEvent({
        actorId: auth.user.id,
        actorLabel: auth.user.name,
        action: "REGULATORY_MATCH_RECORDED",
        entityType: "REGULATORY_MATCH",
        entityId: created.id,
        entityLabel: match.term,
        newState: { matchType: match.matchType, confidence: match.confidence },
        requestId,
      });
    }

    await repository.updateRegulatorySource(id, {
      lastCheckAttemptAt: outcome.startedAt,
      lastSuccessfulCheckAt: completedAt,
      lastModifiedReported: outcome.lastModifiedReported,
      retrievalStatus: "OK",
      retrievalError: null,
    });

    await repository.appendAuditEvent({
      actorId: auth.user.id,
      actorLabel: auth.user.name,
      action: "REGULATORY_SOURCE_CHECKED",
      entityType: "REGULATORY_SOURCE",
      entityId: id,
      entityLabel: `${source.authorityShortName} — ${source.title}`,
      newState: {
        status: "OK",
        checkId: check.id,
        matchedEntityCount: outcome.matches.length,
        nonMatchCount: outcome.checkedWithoutMatch.length,
      },
      reason: outcome.note,
      requestId,
    });

    return {
      sourceId: id,
      performed: true,
      status: "OK",
      matchesRecorded: outcome.matches.length,
      nonMatchesRecorded: outcome.checkedWithoutMatch.length,
      message:
        `Checked ${terms.length} term(s): ${outcome.matches.length} match(es) and ` +
        `${outcome.checkedWithoutMatch.length} explicit non-match(es) recorded. ` +
        "A non-match means the term does not appear in this document — it is not evidence of " +
        "authorisation.",
    };
  } finally {
    dispose();
  }
}

// --- settings -------------------------------------------------------------

export async function listSettings(auth: AuthenticatedUser) {
  if (!auth.can("settings:read")) throw new ForbiddenError("settings:read", auth.user.role);
  const repository = await getRepository();
  const settings = await repository.listSettings();

  // A secret's value is never returned to the browser. Only whether it is set.
  return settings.map((setting) =>
    setting.isSecret
      ? { ...setting, value: null, isConfigured: setting.value !== null && setting.value !== "" }
      : { ...setting, isConfigured: true },
  );
}

export async function updateSettings(
  auth: AuthenticatedUser,
  input: UpdateSettingsDto,
  requestId: string,
): Promise<{ updated: number; rejected: Array<{ key: string; reason: string }> }> {
  if (!auth.can("settings:write")) throw new ForbiddenError("settings:write", auth.user.role);

  const repository = await getRepository();
  const rejected: Array<{ key: string; reason: string }> = [];
  let updated = 0;

  for (const change of input.changes) {
    const existing = await repository.getSetting(change.key);
    if (!existing) {
      rejected.push({ key: change.key, reason: "No such setting." });
      continue;
    }
    if (existing.isSecret) {
      rejected.push({
        key: change.key,
        reason:
          "Secrets are configured through server environment variables only and cannot be set " +
          "from the browser.",
      });
      continue;
    }
    if (!existing.isEditable) {
      rejected.push({
        key: change.key,
        reason:
          "This value is derived from the server environment. Changing it here would not " +
          "configure anything, so it is read-only.",
      });
      continue;
    }

    const next = await repository.updateSetting(change.key, change.value, auth.user.id);
    await repository.appendAuditEvent({
      actorId: auth.user.id,
      actorLabel: auth.user.name,
      action: "SETTING_UPDATED",
      entityType: "APPLICATION_SETTING",
      entityId: change.key,
      entityLabel: existing.label,
      previousState: { value: existing.value },
      newState: { value: next.value },
      requestId,
    });
    updated += 1;
  }

  return { updated, rejected };
}
