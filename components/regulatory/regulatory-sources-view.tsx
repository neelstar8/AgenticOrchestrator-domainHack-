"use client";

import * as React from "react";
import {
  CircleOff,
  ExternalLink,
  FlaskConical,
  Landmark,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  ConfidenceIndicator,
  DataOriginBadge,
  MatchTypeBadge,
  RegulatorySourceTypeBadge,
  RetrievalStatusBadge,
} from "@/components/shared/badges";
import { AbsenceNotAuthorisationNotice } from "@/components/shared/notices";
import { RelativeTime } from "@/components/shared/relative-time";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { REGULATORY_SOURCE_TYPES } from "@/lib/types/enums";
import type { RegulatorySourceType } from "@/lib/types/enums";
import type { RegulatorySourceListItem } from "@/lib/types/views";
import { REGULATORY_SOURCE_TYPE_LABELS } from "@/lib/utils/labels";
import { formatBytes, formatDateTime, formatNumber } from "@/lib/utils/format";

/**
 * Regulatory sources.
 *
 * The page is split into two structurally separate sections, and that split is
 * the most important thing about it:
 *
 *   - Configured official sources: real authorities with their real published
 *     URLs. Sentinel has never retrieved any of them, holds no content from
 *     them, and records zero matches against them.
 *   - Simulated fixture sources: a fictional authority at a reserved .invalid
 *     hostname, carrying all the demo check history and matches.
 *
 * Rendering them in one list would invite reading a fixture match as an
 * official warning, so they are never merged.
 */
export function RegulatorySourcesView({
  realSources,
  fixtureSources,
  canManage,
  canCheck,
  liveFetchEnabled,
}: {
  realSources: RegulatorySourceListItem[];
  fixtureSources: RegulatorySourceListItem[];
  canManage: boolean;
  canCheck: boolean;
  liveFetchEnabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <AbsenceNotAuthorisationNotice />

      {/* --- Real configured sources --- */}
      <section className="flex flex-col gap-3">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldCheck className="size-4 text-verified" aria-hidden="true" />
              Configured official sources
              <Badge tone="verified" size="sm">
                {realSources.length}
              </Badge>
            </h2>
            <p className="pt-1 text-xs leading-relaxed text-foreground-muted">
              Real authorities and their published URLs, present as configuration.{" "}
              {liveFetchEnabled
                ? "Live retrieval is enabled, so a check will perform a real request through the safe-fetch layer."
                : "Live retrieval is disabled, so Sentinel has never requested any of these pages and holds no content from them."}
            </p>
          </div>
          {canManage ? <AddSourceDialog /> : null}
        </header>

        {!liveFetchEnabled ? (
          <Alert tone="info" title="No official publication has been retrieved" role="note">
            With <code className="font-mono text-[11px]">SENTINEL_ALLOW_LIVE_FETCH=false</code>,
            Sentinel will not request these URLs — and it will not invent what they contain.
            Triggering a check against one of them records an explicit refusal rather than a
            plausible-looking result. Verify these sources manually.
          </Alert>
        ) : null}

        {realSources.length === 0 ? (
          <EmptyState
            icon={<Landmark />}
            title="No official sources configured"
            description="Add the authority publications this deployment should check against."
            action={canManage ? <AddSourceDialog /> : null}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {realSources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                isFixture={false}
                canManage={canManage}
                canCheck={canCheck}
              />
            ))}
          </ul>
        )}
      </section>

      {/* --- Simulated fixture sources --- */}
      <section className="flex flex-col gap-3">
        <header>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FlaskConical className="size-4 text-accent" aria-hidden="true" />
            Simulated fixture sources
            <Badge tone="info" size="sm">
              {fixtureSources.length}
            </Badge>
          </h2>
          <p className="pt-1 text-xs leading-relaxed text-foreground-muted">
            A fictional authority at a reserved <code className="font-mono">.invalid</code>{" "}
            hostname, used to demonstrate the matching, staleness and failure workflows. Every
            match in the demo dataset belongs to one of these.
          </p>
        </header>

        <Alert tone="review" title="These are not real regulatory records" role="note">
          The authority below does not exist and its documents are synthetic text written for this
          demonstration. Matches against it carry <strong>no official weight whatsoever</strong>{" "}
          and must never be cited as a regulatory finding.
        </Alert>

        {fixtureSources.length === 0 ? (
          <EmptyState
            icon={<FlaskConical />}
            title="No fixture sources"
            description="The demo dataset normally includes simulated sources. Reset the demo data to restore them."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {fixtureSources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                isFixture
                canManage={canManage}
                canCheck={canCheck}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface SourceHistory {
  sourceId: string;
  isFixtureSource: boolean;
  isStale: boolean;
  checks: Array<{
    id: string;
    startedAt: string;
    completedAt: string | null;
    status: RegulatorySourceListItem["retrievalStatus"];
    httpStatusCode: number | null;
    bytesRetrieved: number | null;
    matchedEntityCount: number;
    errorMessage: string | null;
    note: string | null;
    origin: RegulatorySourceListItem["origin"];
  }>;
  matches: Array<{
    id: string;
    domainFqdn: string | null;
    matchedTerm: string;
    matchedContext: string;
    matchType: RegulatorySourceListItem["sourceType"] extends never ? never : never;
  }>;
}

function SourceCard({
  source,
  isFixture,
  canManage,
  canCheck,
}: {
  source: RegulatorySourceListItem;
  isFixture: boolean;
  canManage: boolean;
  canCheck: boolean;
}) {
  const { push } = useToast();
  const [checking, setChecking] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);
  const [enabled, setEnabled] = React.useState(source.isEnabled);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [history, setHistory] = React.useState<SourceHistory | null>(null);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const runCheck = async () => {
    setChecking(true);
    try {
      const response = await fetch(`/api/regulatory-sources/${source.id}/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        push({
          tone: "critical",
          title: "Check failed",
          description:
            (payload as { error?: { message?: string } }).error?.message ??
            "The check could not be run.",
        });
        return;
      }

      const data = (payload as {
        data: {
          performed: boolean;
          status: string;
          matchesRecorded: number;
          nonMatchesRecorded: number;
          message: string;
        };
      }).data;

      push({
        // A refusal is reported honestly rather than as a success.
        tone: data.performed ? "verified" : "review",
        title: data.performed
          ? `Checked: ${data.matchesRecorded} match${data.matchesRecorded === 1 ? "" : "es"}`
          : "No retrieval was performed",
        description: data.message,
      });

      if (historyOpen) await loadHistory();
      window.location.reload();
    } catch {
      push({ tone: "critical", title: "Check failed", description: "The request failed." });
    } finally {
      setChecking(false);
    }
  };

  const toggleEnabled = async (next: boolean) => {
    setToggling(true);
    const previous = enabled;
    setEnabled(next);
    try {
      const response = await fetch(`/api/regulatory-sources/${source.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isEnabled: next }),
      });
      if (!response.ok) {
        setEnabled(previous);
        push({ tone: "critical", title: "Could not update the source" });
        return;
      }
      push({
        tone: "verified",
        title: next ? "Source enabled" : "Source disabled",
        description: next
          ? "This source will be included in future checks."
          : "Disabled sources are never contacted and contribute nothing to any finding.",
      });
    } catch {
      setEnabled(previous);
      push({ tone: "critical", title: "Could not update the source" });
    } finally {
      setToggling(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/regulatory-sources/${source.id}/history`);
      if (response.ok) {
        const payload = (await response.json()) as { data: SourceHistory };
        setHistory(payload.data);
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <li>
      <Card className={isFixture ? "border-accent/30" : undefined}>
        <CardContent className="flex flex-col gap-3 py-3.5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={isFixture ? "info" : "neutral"}>{source.authorityShortName}</Badge>
                <span className="text-xs font-semibold text-foreground">{source.title}</span>
                {isFixture ? (
                  <Badge tone="info">
                    <FlaskConical className="size-2.5" aria-hidden="true" />
                    Fictional fixture
                  </Badge>
                ) : null}
                {source.isStale ? (
                  <Tooltip content={`Last successful check is older than the ${source.checkIntervalHours}h interval, so its data may be out of date.`}>
                    <Badge tone="review" className="cursor-help">
                      Stale
                    </Badge>
                  </Tooltip>
                ) : null}
              </div>

              <p className="text-[11px] text-foreground-muted">{source.authorityName}</p>

              <a
                href={source.sourceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex max-w-full items-center gap-1 break-all text-[10px] text-accent hover:underline"
              >
                {source.sourceUrl}
                <ExternalLink className="size-2.5 shrink-0" aria-hidden="true" />
              </a>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {canManage ? (
                <label className="flex items-center gap-1.5 text-[10px] text-foreground-muted">
                  <Switch
                    checked={enabled}
                    onCheckedChange={(next) => void toggleEnabled(next)}
                    disabled={toggling}
                    aria-label={`${enabled ? "Disable" : "Enable"} ${source.title}`}
                  />
                  {enabled ? "Enabled" : "Disabled"}
                </label>
              ) : (
                <Badge tone={enabled ? "verified" : "muted"} size="sm">
                  {enabled ? "Enabled" : "Disabled"}
                </Badge>
              )}

              {canCheck ? (
                <Tooltip
                  content={
                    isFixture
                      ? "Runs a simulated check against this fictional fixture source."
                      : "Attempts a check. With live fetching disabled this records an explicit refusal — Sentinel will not invent what an official publication says."
                  }
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void runCheck()}
                    loading={checking}
                    loadingLabel="Checking…"
                    disabled={!enabled}
                  >
                    <RefreshCw aria-hidden="true" />
                    Check now
                  </Button>
                </Tooltip>
              ) : null}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-4">
            <Stat label="Source type">
              <RegulatorySourceTypeBadge type={source.sourceType} />
            </Stat>
            <Stat label="Retrieval status">
              <RetrievalStatusBadge status={source.retrievalStatus} />
            </Stat>
            <Stat label="Last successful check">
              {source.lastSuccessfulCheckAt ? (
                <RelativeTime value={source.lastSuccessfulCheckAt} />
              ) : (
                <span className="text-[11px] italic text-foreground-subtle">Never</span>
              )}
            </Stat>
            <Stat label="Matched entities">
              <Tooltip
                content={
                  source.matchedEntityCount === 0
                    ? "No match recorded. This is NOT evidence that any entity is authorised."
                    : "Matches require human verification against the published document."
                }
              >
                <span className="cursor-help font-mono text-[11px] text-foreground">
                  {formatNumber(source.matchedEntityCount)}
                </span>
              </Tooltip>
            </Stat>
            <Stat label="Last modified (reported)">
              {source.lastModifiedReported ? (
                <RelativeTime value={source.lastModifiedReported} />
              ) : (
                <span className="text-[11px] italic text-foreground-subtle">Not reported</span>
              )}
            </Stat>
            <Stat label="Check interval">
              <span className="text-[11px]">{source.checkIntervalHours}h</span>
            </Stat>
            <Stat label="Checks on record">
              <span className="font-mono text-[11px]">{source.checkCount}</span>
            </Stat>
            <Stat label="Match provenance">
              {source.simulatedMatchCount > 0 || source.liveMatchCount > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {source.simulatedMatchCount > 0 ? (
                    <Badge tone="info" size="sm">
                      {source.simulatedMatchCount} simulated
                    </Badge>
                  ) : null}
                  {source.liveMatchCount > 0 ? (
                    <Badge tone="verified" size="sm">
                      {source.liveMatchCount} live
                    </Badge>
                  ) : null}
                </span>
              ) : (
                <span className="text-[11px] italic text-foreground-subtle">None</span>
              )}
            </Stat>
          </dl>

          {source.retrievalError ? (
            <Alert tone="critical" title="Last check failed">
              {source.retrievalError}
            </Alert>
          ) : null}

          {source.verificationNotes ? (
            <p className="rounded border border-border bg-surface-sunken/60 px-2.5 py-2 text-[10px] leading-relaxed text-foreground-muted">
              <strong className="text-foreground">Verification notes:</strong>{" "}
              {source.verificationNotes}
            </p>
          ) : null}

          <Collapsible
            open={historyOpen}
            onOpenChange={(open) => {
              setHistoryOpen(open);
              if (open && !history) void loadHistory();
            }}
          >
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {historyOpen ? "Hide" : "View"} check history and matches
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 flex flex-col gap-3 rounded-md border border-border bg-surface-sunken/40 p-3">
                {historyLoading ? (
                  <p className="text-[11px] text-foreground-subtle">Loading history…</p>
                ) : !history ? (
                  <p className="text-[11px] text-foreground-subtle">No history available.</p>
                ) : (
                  <>
                    <div>
                      <h4 className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
                        Check history ({history.checks.length})
                      </h4>
                      {history.checks.length === 0 ? (
                        <p className="text-[11px] italic text-foreground-subtle">
                          This source has never been checked. Nothing has been retrieved from it,
                          and nothing is implied by that.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {history.checks.map((check) => (
                            <li
                              key={check.id}
                              className="rounded border border-border bg-surface px-2 py-1.5"
                            >
                              <div className="flex flex-wrap items-center gap-1.5">
                                <RetrievalStatusBadge status={check.status} />
                                <span className="text-[10px] text-foreground-subtle">
                                  {formatDateTime(check.startedAt)}
                                </span>
                                {check.httpStatusCode ? (
                                  <span className="font-mono text-[10px] text-foreground-muted">
                                    HTTP {check.httpStatusCode}
                                  </span>
                                ) : null}
                                {check.bytesRetrieved ? (
                                  <span className="text-[10px] text-foreground-subtle">
                                    {formatBytes(check.bytesRetrieved)}
                                  </span>
                                ) : null}
                                <Badge tone="muted" size="sm">
                                  {check.matchedEntityCount} match
                                  {check.matchedEntityCount === 1 ? "" : "es"}
                                </Badge>
                                <DataOriginBadge origin={check.origin} compact />
                              </div>
                              {check.errorMessage ? (
                                <p className="pt-1 text-[10px] leading-relaxed text-critical-foreground">
                                  {check.errorMessage}
                                </p>
                              ) : null}
                              {check.note ? (
                                <p className="pt-1 text-[10px] leading-relaxed text-foreground-muted">
                                  {check.note}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <MatchList sourceId={source.id} isFixture={isFixture} />
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </li>
  );
}

interface MatchRow {
  id: string;
  domainFqdn: string | null;
  matchedTerm: string;
  matchedContext: string;
  matchType: Parameters<typeof MatchTypeBadge>[0]["type"];
  confidence: number;
  sourceRetrievedAt: string;
  notes: string | null;
  origin: "SIMULATED_DEMO" | "LIVE_COLLECTED";
}

function MatchList({ sourceId, isFixture }: { sourceId: string; isFixture: boolean }) {
  const [matches, setMatches] = React.useState<MatchRow[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/regulatory-sources/${sourceId}/history`);
      if (!response.ok) return;
      const payload = (await response.json()) as { data: { matches: MatchRow[] } };
      if (!cancelled) setMatches(payload.data.matches);
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  if (!matches) return null;

  return (
    <div>
      <h4 className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
        Matches and supporting references ({matches.length})
      </h4>

      {matches.length === 0 ? (
        <p className="text-[11px] italic leading-relaxed text-foreground-subtle">
          No match recorded against this source. A recorded non-match means the term does not
          appear in the document — it is not evidence of authorisation, and it is not evidence of
          wrongdoing.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {matches.map((match) => (
            <li key={match.id} className="rounded border border-border bg-surface px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] font-medium text-foreground">
                  {match.matchedTerm}
                </span>
                <MatchTypeBadge type={match.matchType} />
                <ConfidenceIndicator value={match.confidence} />
                <DataOriginBadge origin={match.origin} compact />
              </div>
              <p className="mt-1 whitespace-pre-wrap rounded border border-border bg-surface-sunken px-1.5 py-1 text-[10px] leading-relaxed text-foreground-muted">
                {match.matchedContext}
              </p>
              {match.notes ? (
                <p className="pt-1 text-[10px] leading-relaxed text-review-foreground">
                  {match.notes}
                </p>
              ) : null}
              {isFixture ? (
                <p className="pt-1 text-[9px] italic text-foreground-subtle">
                  From a fictional fixture source. No official weight.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] uppercase tracking-wide text-foreground-subtle">{label}</dt>
      <dd className="pt-0.5">{children}</dd>
    </div>
  );
}

function AddSourceDialog() {
  const { push } = useToast();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    authorityName: "",
    authorityShortName: "",
    title: "",
    sourceUrl: "",
    sourceType: "INVESTOR_WARNING_LIST" as RegulatorySourceType,
    description: "",
    checkIntervalHours: "24",
    verificationNotes: "",
  });

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/regulatory-sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          checkIntervalHours: Number(form.checkIntervalHours),
          isEnabled: true,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const failures = (payload as { error?: { failures?: Array<{ message: string }> } }).error
          ?.failures;
        setError(
          failures?.map((failure) => failure.message).join(" ") ??
            (payload as { error?: { message?: string } }).error?.message ??
            "The source could not be added.",
        );
        return;
      }

      push({
        tone: "verified",
        title: "Source added",
        description:
          "It will be included in future checks. Sentinel has not retrieved it yet, so it holds no content from it.",
      });
      setOpen(false);
      window.location.reload();
    } catch {
      setError("Could not reach the server. Check that it is running and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const update = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <Plus aria-hidden="true" />
          Add source
        </Button>
      </DialogTrigger>

      <DialogContent size="md">
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Add a regulatory source</DialogTitle>
            <DialogDescription>
              Adding a source is configuration only. Sentinel does not retrieve it until a check
              runs, and will never invent its contents.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Authority name" htmlFor="authorityName" required>
                <Input
                  id="authorityName"
                  value={form.authorityName}
                  onChange={(event) => update("authorityName")(event.target.value)}
                  placeholder="Securities and Exchange Board of India"
                />
              </Field>
              <Field label="Short name" htmlFor="authorityShortName" required>
                <Input
                  id="authorityShortName"
                  value={form.authorityShortName}
                  onChange={(event) => update("authorityShortName")(event.target.value)}
                  placeholder="SEBI"
                />
              </Field>
            </div>

            <Field label="Source title" htmlFor="title" required>
              <Input
                id="title"
                value={form.title}
                onChange={(event) => update("title")(event.target.value)}
                placeholder="Investor cautions and advisories"
              />
            </Field>

            <Field
              label="Official source URL"
              htmlFor="sourceUrl"
              required
              hint="Only http and https are accepted. Use the authority's own published address."
            >
              <Input
                id="sourceUrl"
                type="url"
                value={form.sourceUrl}
                onChange={(event) => update("sourceUrl")(event.target.value)}
                placeholder="https://www.example.gov/advisories"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Source type" htmlFor="sourceType" required>
                <Select
                  value={form.sourceType}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      sourceType: value as RegulatorySourceType,
                    }))
                  }
                >
                  <SelectTrigger id="sourceType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGULATORY_SOURCE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {REGULATORY_SOURCE_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Check interval (hours)" htmlFor="checkIntervalHours" required>
                <Input
                  id="checkIntervalHours"
                  type="number"
                  min={1}
                  max={8760}
                  value={form.checkIntervalHours}
                  onChange={(event) => update("checkIntervalHours")(event.target.value)}
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="description">
              <Textarea
                id="description"
                value={form.description}
                onChange={(event) => update("description")(event.target.value)}
                rows={2}
              />
            </Field>

            <Field
              label="Verification notes"
              htmlFor="verificationNotes"
              hint="What a later reader needs to know about this source's reliability and scope."
            >
              <Textarea
                id="verificationNotes"
                value={form.verificationNotes}
                onChange={(event) => update("verificationNotes")(event.target.value)}
                rows={2}
              />
            </Field>

            <Alert tone="info" icon={<CircleOff />}>
              A URL on a reserved <code className="font-mono">.invalid</code> hostname is treated
              as a <strong>simulated fixture</strong> and shown in the fixture section. Any other
              host is treated as a real authority whose contents Sentinel will never simulate.
            </Alert>

            {error ? (
              <Alert tone="critical" role="alert">
                {error}
              </Alert>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={submitting}
              loadingLabel="Adding…"
            >
              Add source
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
