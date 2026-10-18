"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  ExternalLink,
  FlaskConical,
  History,
  Landmark,
  Link2,
  Save,
  ShieldQuestion,
} from "lucide-react";

import {
  ConfidenceIndicator,
  DataOriginBadge,
  DnsStatusValue,
  EvidenceCompletenessMeter,
  EvidenceKindBadge,
  MatchTypeBadge,
  NotCheckedValue,
  PriorityBadge,
  RelationshipTypeBadge,
  ReviewStatusBadge,
} from "@/components/shared/badges";
import { CopyButton } from "@/components/shared/copy-button";
import { DetailList, DetailRow } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import {
  AbsenceNotAuthorisationNotice,
  SharedInfrastructureNotice,
  SignalNotDeterminationNotice,
} from "@/components/shared/notices";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { PRIORITIES, REVIEW_STATUSES } from "@/lib/types/enums";
import type { Priority, ReviewStatus } from "@/lib/types/enums";
import type { DomainDetail } from "@/lib/types/views";
import {
  AUDIT_ACTION_LABELS,
  EVIDENCE_COLLECTION_METHOD_LABELS,
  PRIORITY_LABELS,
  REGULATORY_SOURCE_TYPE_LABELS,
  RELATIONSHIP_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/utils/labels";
import { formatDateTime, formatHttpStatus, formatNumber } from "@/lib/utils/format";

/**
 * Domain detail.
 *
 * Five tabs: Overview, Evidence, Technical details, Relationships and History.
 *
 * The tab split is deliberate. Observed technical facts, labelled evidence,
 * inferred relationships and the audit history are different kinds of claim,
 * and keeping them on separate tabs stops a reader from absorbing an inference
 * as though it were an observation.
 */
export function DomainDetailView({
  detail,
  reviewers,
  canReview,
  canExport,
}: {
  detail: DomainDetail;
  reviewers: Array<{ id: string; name: string; role: string }>;
  canReview: boolean;
  canExport: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();

  const [reviewStatus, setReviewStatus] = React.useState<ReviewStatus>(detail.reviewStatus);
  const [priority, setPriority] = React.useState<Priority>(detail.priority);
  const [reviewerId, setReviewerId] = React.useState(detail.assignedReviewerId ?? "");
  const [notes, setNotes] = React.useState(detail.reviewerNotes ?? "");
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const dirty =
    reviewStatus !== detail.reviewStatus ||
    priority !== detail.priority ||
    reviewerId !== (detail.assignedReviewerId ?? "") ||
    notes !== (detail.reviewerNotes ?? "");

  const requiresReason =
    reviewStatus !== detail.reviewStatus &&
    ["ESCALATED", "DISMISSED", "NOT_RELATED"].includes(reviewStatus);

  const save = async () => {
    setError(null);

    if (requiresReason && reason.trim().length === 0 && notes.trim().length === 0) {
      setError(
        `Setting the status to "${REVIEW_STATUS_LABELS[reviewStatus]}" is a judgement, so it needs a reason or a reviewer note.`,
      );
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/domains/${detail.id}/review`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewStatus,
          priority,
          assignedReviewerId: reviewerId || null,
          reviewerNotes: notes.trim() || undefined,
          reason: reason.trim() || undefined,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const failures = (payload as { error?: { failures?: Array<{ message: string }> } }).error
          ?.failures;
        setError(
          failures?.map((failure) => failure.message).join(" ") ??
            (payload as { error?: { message?: string } }).error?.message ??
            "The review could not be saved.",
        );
        setSaving(false);
        return;
      }

      push({
        tone: "verified",
        title: "Review saved",
        description: `${detail.fqdn} is now ${REVIEW_STATUS_LABELS[reviewStatus].toLowerCase()}.`,
      });
      setReason("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check that it is running and try again.");
    } finally {
      setSaving(false);
    }
  };

  const simulatedMatches = detail.regulatoryMatches.filter(
    (match) => match.origin === "SIMULATED_DEMO",
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Identity header */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-all font-mono text-lg font-semibold text-foreground">
                  {detail.fqdn}
                </h2>
                <CopyButton value={detail.fqdn} label="Copy domain" />
                <DataOriginBadge origin={detail.origin} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ReviewStatusBadge status={detail.reviewStatus} />
                <PriorityBadge priority={detail.priority} />
                <EvidenceCompletenessMeter percent={detail.evidenceCompleteness} />
                {detail.seedPlatform ? (
                  <Badge tone="neutral">{detail.seedPlatform.name}</Badge>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {canExport ? (
                <Button asChild variant="secondary" size="sm">
                  <a href={`/api/domains/${detail.id}/evidence.csv`}>
                    <Download aria-hidden="true" />
                    Evidence CSV
                  </a>
                </Button>
              ) : null}
              <Button asChild variant="secondary" size="sm">
                <Link href={`/relationships?focusDomainId=${detail.id}`}>
                  <Link2 aria-hidden="true" />
                  View in graph
                </Link>
              </Button>
            </div>
          </div>

          {detail.origin === "SIMULATED_DEMO" ? (
            <Alert tone="info" icon={<FlaskConical />} role="note">
              Every observation on this page is simulated demonstration data. Nothing here was
              collected from this domain, and nothing here establishes anything about it or
              whoever operates it.
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="evidence">Evidence ({detail.evidence.length})</TabsTrigger>
          <TabsTrigger value="technical">Technical details</TabsTrigger>
          <TabsTrigger value="relationships">
            Relationships ({detail.relationships.length})
          </TabsTrigger>
          <TabsTrigger value="history">History ({detail.auditEvents.length})</TabsTrigger>
        </TabsList>

        {/* ---------------- Overview ---------------- */}
        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
            <Card>
              <CardHeader>
                <CardTitle>Discovery record</CardTitle>
                <CardDescription>
                  How and when this candidate entered the registry.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DetailList>
                  <DetailRow label="Fully qualified domain name">
                    <span className="font-mono">{detail.fqdn}</span>
                  </DetailRow>
                  <DetailRow
                    label="Normalised domain"
                    hint="Used for deduplication across sources"
                  >
                    <span className="font-mono">{detail.normalizedDomain}</span>
                  </DetailRow>
                  <DetailRow label="Registrable domain">
                    <span className="font-mono">{detail.registrableDomain}</span>
                  </DetailRow>
                  <DetailRow label="Public suffix">
                    <span className="font-mono">.{detail.suffix}</span>
                  </DetailRow>
                  <DetailRow label="Seed platform">
                    {detail.seedPlatform ? (
                      <Link
                        href={`/domains?platformId=${detail.seedPlatform.id}`}
                        className="text-accent hover:underline"
                      >
                        {detail.seedPlatform.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </DetailRow>
                  <DetailRow label="Associated names or brands">
                    {detail.associatedNames.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {detail.associatedNames.map((name) => (
                          <Badge key={name} tone="muted">
                            {name}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      "None recorded"
                    )}
                  </DetailRow>
                  <DetailRow label="Discovery sources">
                    {detail.discoverySources.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {detail.discoverySources.map((source) => (
                          <Tooltip
                            key={source.id}
                            content="A source finding this domain is a discovery record. It says nothing about the domain itself."
                          >
                            <Badge tone="muted" className="cursor-help">
                              {source.name}
                            </Badge>
                          </Tooltip>
                        ))}
                      </span>
                    ) : (
                      "None recorded"
                    )}
                  </DetailRow>
                  <DetailRow label="First seen">{formatDateTime(detail.firstSeenAt)}</DetailRow>
                  <DetailRow label="Last seen">{formatDateTime(detail.lastSeenAt)}</DetailRow>
                  <DetailRow
                    label="Last checked"
                    hint="When a technical check last ran against this host"
                  >
                    {detail.lastCheckedAt ? (
                      formatDateTime(detail.lastCheckedAt)
                    ) : (
                      <NotCheckedValue />
                    )}
                  </DetailRow>
                  <DetailRow label="Discovered by scan">
                    {detail.discoveredByScanId ? (
                      <Link
                        href={`/scans/${detail.discoveredByScanId}`}
                        className="font-mono text-accent hover:underline"
                      >
                        {detail.discoveredByScanReference ?? detail.discoveredByScanId}
                      </Link>
                    ) : (
                      "Not attributed to a scan"
                    )}
                  </DetailRow>
                </DetailList>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              {/* Similarity signals */}
              <Card>
                <CardHeader>
                  <CardTitle>Similarity signals</CardTitle>
                  <CardDescription>
                    Measurements used to order triage work. Not findings.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <DetailList>
                    <DetailRow label="Brand similarity">
                      <ConfidenceIndicator
                        value={detail.brandSimilarityScore}
                        label="Brand similarity"
                      />
                    </DetailRow>
                    <DetailRow label="Content similarity">
                      <ConfidenceIndicator
                        value={detail.contentSimilarityScore}
                        label="Content similarity"
                      />
                    </DetailRow>
                  </DetailList>
                  {detail.similarityRationale ? (
                    <p className="text-[11px] leading-relaxed text-foreground-muted">
                      {detail.similarityRationale}
                    </p>
                  ) : null}
                  <SignalNotDeterminationNotice />
                </CardContent>
              </Card>

              {/* Human review */}
              <Card>
                <CardHeader>
                  <CardTitle>Human review</CardTitle>
                  <CardDescription>
                    {canReview
                      ? "Your decision is recorded against your name in the audit log."
                      : "Read-only: your role cannot change a review status."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Field label="Review status" htmlFor="review-status">
                    <Select
                      value={reviewStatus}
                      onValueChange={(value) => setReviewStatus(value as ReviewStatus)}
                      disabled={!canReview}
                    >
                      <SelectTrigger id="review-status" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REVIEW_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {REVIEW_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Priority" htmlFor="review-priority">
                    <Select
                      value={priority}
                      onValueChange={(value) => setPriority(value as Priority)}
                      disabled={!canReview}
                    >
                      <SelectTrigger id="review-priority" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((option) => (
                          <SelectItem key={option} value={option}>
                            {PRIORITY_LABELS[option]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Assigned reviewer" htmlFor="review-reviewer">
                    <Select
                      value={reviewerId || "__none__"}
                      onValueChange={(value) => setReviewerId(value === "__none__" ? "" : value)}
                      disabled={!canReview}
                    >
                      <SelectTrigger id="review-reviewer" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {reviewers.map((reviewer) => (
                          <SelectItem key={reviewer.id} value={reviewer.id}>
                            {reviewer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field
                    label="Reviewer notes"
                    htmlFor="review-notes"
                    hint="Saved as REVIEWER_ASSESSMENT evidence against this domain."
                  >
                    <Textarea
                      id="review-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={4}
                      disabled={!canReview}
                      placeholder="What you examined and what you concluded."
                    />
                  </Field>

                  {requiresReason ? (
                    <Field
                      label="Reason for this status change"
                      htmlFor="review-reason"
                      required
                      hint="Escalating, dismissing or marking not related requires a stated reason."
                    >
                      <Textarea
                        id="review-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={2}
                        disabled={!canReview}
                      />
                    </Field>
                  ) : null}

                  {detail.reviewedAt ? (
                    <p className="text-[10px] text-foreground-subtle">
                      Last reviewed {formatDateTime(detail.reviewedAt)}
                      {detail.assignedReviewer ? ` by ${detail.assignedReviewer.name}` : ""}.
                    </p>
                  ) : null}

                  {error ? (
                    <Alert tone="critical" role="alert">
                      {error}
                    </Alert>
                  ) : null}

                  {canReview ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void save()}
                      disabled={!dirty}
                      loading={saving}
                      loadingLabel="Saving…"
                    >
                      <Save aria-hidden="true" />
                      Save review
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- Evidence ---------------- */}
        <TabsContent value="evidence">
          <div className="flex flex-col gap-4">
            <Alert tone="info" title="How to read this list" role="note">
              Every item carries an explicit label. <strong>Observed fact</strong> was directly
              recorded; <strong>Inferred relationship</strong> was derived;{" "}
              <strong>Official-source match</strong> means a document contains a term;{" "}
              <strong>Reviewer assessment</strong> is a human judgement; and{" "}
              <strong>Unverified claim</strong> has not been checked at all. Hover any label for
              its full definition.
            </Alert>

            {detail.evidence.length === 0 ? (
              <EmptyState
                icon={<ShieldQuestion />}
                title="No evidence recorded"
                description="Nothing has been collected or recorded for this domain yet. Its evidence completeness is 0%, and nothing can be concluded about it."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.evidence.map((item) => (
                  <li key={item.id}>
                    <Card>
                      <CardContent className="flex flex-col gap-2 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <EvidenceKindBadge kind={item.kind} />
                          <span className="text-xs font-medium text-foreground">{item.title}</span>
                          <DataOriginBadge origin={item.origin} compact />
                          {item.confidence !== null ? (
                            <ConfidenceIndicator value={item.confidence} />
                          ) : null}
                        </div>

                        <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground-muted">
                          {item.description}
                        </p>

                        {item.limitations ? (
                          <p className="rounded border border-review/30 bg-review-subtle/40 px-2 py-1.5 text-[10px] leading-relaxed text-review-foreground">
                            <strong>Limitations:</strong> {item.limitations}
                          </p>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-foreground-subtle">
                          <span>
                            Collected {formatDateTime(item.collectedAt)} via{" "}
                            {EVIDENCE_COLLECTION_METHOD_LABELS[item.collectionMethod]}
                          </span>
                          {item.sourceUrl ? (
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="inline-flex items-center gap-1 text-accent hover:underline"
                            >
                              {item.sourceLabel ?? "Source"}
                              <ExternalLink className="size-2.5" aria-hidden="true" />
                            </a>
                          ) : item.sourceLabel ? (
                            <span>{item.sourceLabel}</span>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        {/* ---------------- Technical details ---------------- */}
        <TabsContent value="technical">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>DNS and HTTP</CardTitle>
                <CardDescription>
                  Only what was actually observed. A field reading &ldquo;Not checked&rdquo; means
                  no check was attempted.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DetailList>
                  <DetailRow label="DNS status">
                    <DnsStatusValue status={detail.dnsStatus} />
                  </DetailRow>
                  <DetailRow label="DNS checked at">
                    {detail.dnsCheckedAt ? (
                      formatDateTime(detail.dnsCheckedAt)
                    ) : (
                      <NotCheckedValue />
                    )}
                  </DetailRow>
                  <DetailRow label="Address records">
                    {detail.resolvedIpCount === null ? (
                      <NotCheckedValue />
                    ) : (
                      formatNumber(detail.resolvedIpCount)
                    )}
                  </DetailRow>
                  <DetailRow label="HTTP status">
                    {detail.httpStatusCode === null ? (
                      <NotCheckedValue />
                    ) : (
                      <Tooltip content="What the server replied at the time shown. A status code is not an assessment of the site.">
                        <span className="cursor-help font-mono">
                          {formatHttpStatus(detail.httpStatusCode)}
                        </span>
                      </Tooltip>
                    )}
                  </DetailRow>
                  <DetailRow label="HTTP checked at">
                    {detail.httpCheckedAt ? (
                      formatDateTime(detail.httpCheckedAt)
                    ) : (
                      <NotCheckedValue />
                    )}
                  </DetailRow>
                  <DetailRow
                    label="Redirect destination"
                    hint="Only set when a redirect was actually observed"
                  >
                    {detail.redirectsToUrl ? (
                      <span className="break-all font-mono">{detail.redirectsToUrl}</span>
                    ) : (
                      <NotCheckedValue />
                    )}
                  </DetailRow>
                  <DetailRow label="Redirect observed at">
                    {detail.redirectObservedAt ? (
                      formatDateTime(detail.redirectObservedAt)
                    ) : (
                      <NotCheckedValue />
                    )}
                  </DetailRow>
                </DetailList>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>TLS certificate</CardTitle>
                <CardDescription>
                  Characteristics of the certificate observed at the time shown.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <DetailList>
                  <DetailRow label="Issuer">
                    {detail.certIssuer ?? <NotCheckedValue />}
                  </DetailRow>
                  <DetailRow label="Subject common name">
                    {detail.certSubjectCommonName ? (
                      <span className="font-mono">{detail.certSubjectCommonName}</span>
                    ) : (
                      <NotCheckedValue />
                    )}
                  </DetailRow>
                  <DetailRow label="Valid from">
                    {detail.certNotBefore ? (
                      formatDateTime(detail.certNotBefore)
                    ) : (
                      <NotCheckedValue />
                    )}
                  </DetailRow>
                  <DetailRow label="Valid to">
                    {detail.certNotAfter ? (
                      formatDateTime(detail.certNotAfter)
                    ) : (
                      <NotCheckedValue />
                    )}
                  </DetailRow>
                  <DetailRow label="SHA-256 fingerprint">
                    {detail.certFingerprintSha256 ? (
                      <span className="flex items-start gap-1">
                        <span className="break-all font-mono text-[10px]">
                          {detail.certFingerprintSha256}
                        </span>
                        <CopyButton value={detail.certFingerprintSha256} />
                      </span>
                    ) : (
                      <NotCheckedValue />
                    )}
                  </DetailRow>
                </DetailList>
                {detail.certFingerprintSha256 ? <SharedInfrastructureNotice /> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Public page metadata</CardTitle>
                <CardDescription>
                  Publicly served content only. No authentication or probing of any kind was
                  attempted.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DetailList>
                  <DetailRow label="Page title">
                    {detail.siteTitle ?? <NotCheckedValue />}
                  </DetailRow>
                  <DetailRow label="Description">
                    {detail.siteDescription ?? <NotCheckedValue />}
                  </DetailRow>
                  <DetailRow label="Language">
                    {detail.siteLanguage ?? <NotCheckedValue />}
                  </DetailRow>
                  <DetailRow label="Detected technologies">
                    {detail.detectedTechnologies.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {detail.detectedTechnologies.map((tech) => (
                          <Badge key={tech} tone="muted">
                            {tech}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      <NotCheckedValue />
                    )}
                  </DetailRow>
                  <DetailRow label="Observed at">
                    {detail.observedAt ? formatDateTime(detail.observedAt) : <NotCheckedValue />}
                  </DetailRow>
                </DetailList>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Official-source matches</CardTitle>
                <CardDescription>
                  Where a configured source names this domain.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {detail.regulatoryMatches.length === 0 ? (
                  <>
                    <EmptyState
                      icon={<Landmark />}
                      title="No match recorded"
                      description="No configured official source has been recorded as naming this domain."
                      className="border-0 bg-transparent py-6"
                    />
                    <AbsenceNotAuthorisationNotice />
                  </>
                ) : (
                  <>
                    {simulatedMatches.length > 0 ? (
                      <Alert tone="review" title="These matches are simulated" icon={<FlaskConical />}>
                        {simulatedMatches.length} of {detail.regulatoryMatches.length} match
                        {detail.regulatoryMatches.length === 1 ? "" : "es"} come from a fictional
                        demonstration fixture at a reserved <code>.invalid</code> hostname — not a
                        real regulator. They carry no official weight.
                      </Alert>
                    ) : null}

                    <ul className="flex flex-col gap-2">
                      {detail.regulatoryMatches.map((match) => (
                        <li
                          key={match.id}
                          className="rounded-md border border-border bg-surface-sunken/50 p-2.5"
                        >
                          <div className="flex flex-wrap items-center gap-2 pb-1.5">
                            <Badge tone="neutral">{match.source.authorityShortName}</Badge>
                            <MatchTypeBadge type={match.matchType} />
                            <ConfidenceIndicator value={match.confidence} />
                            <DataOriginBadge origin={match.origin} compact />
                          </div>
                          <p className="text-[11px] font-medium text-foreground">
                            {match.source.title}
                          </p>
                          <p className="pt-0.5 text-[10px] text-foreground-subtle">
                            {REGULATORY_SOURCE_TYPE_LABELS[match.source.sourceType]} · retrieved{" "}
                            {formatDateTime(match.sourceRetrievedAt)}
                          </p>
                          <p className="mt-1.5 whitespace-pre-wrap rounded border border-border bg-surface px-2 py-1.5 text-[10px] leading-relaxed text-foreground-muted">
                            {match.matchedContext}
                          </p>
                          {match.notes ? (
                            <p className="pt-1.5 text-[10px] leading-relaxed text-review-foreground">
                              {match.notes}
                            </p>
                          ) : null}
                          <a
                            href={match.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-accent hover:underline"
                          >
                            {match.sourceUrl}
                            <ExternalLink className="size-2.5" aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                    </ul>
                    <AbsenceNotAuthorisationNotice />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- Relationships ---------------- */}
        <TabsContent value="relationships">
          <div className="flex flex-col gap-4">
            <Alert tone="review" title="What a relationship does and does not mean" role="note">
              Each edge states what it establishes and, just as importantly, what it does not.
              Shared hosting, a shared IP address or a similar certificate never establishes shared
              ownership or control.
            </Alert>

            {detail.relationships.length === 0 ? (
              <EmptyState
                icon={<Link2 />}
                title="No relationships recorded"
                description="No relationship has been proposed or confirmed between this domain and any other candidate."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.relationships.map((relationship) => {
                  const isOutgoing = relationship.sourceDomainId === detail.id;
                  const other = isOutgoing
                    ? relationship.targetDomain
                    : relationship.sourceDomain;

                  return (
                    <li key={relationship.id}>
                      <Card>
                        <CardContent className="flex flex-col gap-2 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <RelationshipTypeBadge type={relationship.type} />
                            <span className="text-[11px] text-foreground-muted">
                              {isOutgoing ? "This domain" : other.fqdn}{" "}
                              {RELATIONSHIP_TYPE_LABELS[relationship.type].toLowerCase()}{" "}
                            </span>
                            <Link
                              href={`/domains/${other.id}`}
                              className="font-mono text-[11px] text-accent hover:underline"
                            >
                              {isOutgoing ? other.fqdn : "this domain"}
                            </Link>
                            <ConfidenceIndicator value={relationship.confidence} />
                            {relationship.reviewerConfirmed ? (
                              <Badge tone="verified">Reviewer-confirmed</Badge>
                            ) : (
                              <Badge tone="muted">Proposed</Badge>
                            )}
                            <DataOriginBadge origin={relationship.origin} compact />
                          </div>

                          <p className="text-[11px] leading-relaxed text-foreground-muted">
                            {relationship.rationale}
                          </p>

                          <p className="rounded border border-review/30 bg-review-subtle/40 px-2 py-1.5 text-[10px] leading-relaxed text-review-foreground">
                            <strong>Does not establish:</strong> {relationship.limitations}
                          </p>

                          <p className="text-[10px] text-foreground-subtle">
                            {relationship.relationSource} · first observed{" "}
                            {formatDateTime(relationship.firstObservedAt)} · last observed{" "}
                            {formatDateTime(relationship.lastObservedAt)}
                          </p>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>

        {/* ---------------- History ---------------- */}
        <TabsContent value="history">
          {detail.auditEvents.length === 0 ? (
            <EmptyState
              icon={<History />}
              title="No audit history"
              description="No recorded action has touched this domain yet."
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Audit history</CardTitle>
                <CardDescription>
                  Every recorded action on this domain, newest first. Append-only by design.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {detail.auditEvents.map((event) => (
                    <li key={event.id} className="flex flex-col gap-1 px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral" size="sm">
                          {AUDIT_ACTION_LABELS[event.action]}
                        </Badge>
                        <span className="text-[11px] font-medium text-foreground">
                          {event.actorLabel}
                        </span>
                        <RelativeTime
                          value={event.occurredAt}
                          className="text-[10px] text-foreground-subtle"
                        />
                      </div>
                      {event.reason ? (
                        <p className="text-[11px] leading-relaxed text-foreground-muted">
                          {event.reason}
                        </p>
                      ) : null}
                      {event.previousState || event.newState ? (
                        <div className="flex flex-wrap gap-2 pt-0.5 font-mono text-[10px]">
                          {event.previousState ? (
                            <span className="rounded border border-border bg-surface-sunken px-1.5 py-0.5 text-foreground-subtle">
                              from {JSON.stringify(event.previousState)}
                            </span>
                          ) : null}
                          {event.newState ? (
                            <span className="rounded border border-accent/30 bg-accent-subtle/40 px-1.5 py-0.5 text-accent-subtle-foreground">
                              to {JSON.stringify(event.newState)}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
