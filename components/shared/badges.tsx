import { CircleHelp, FlaskConical, Radio } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import type {
  DataOrigin,
  DnsStatus,
  EvidenceKind,
  MatchType,
  Priority,
  RegulatorySourceType,
  RelationshipType,
  ReportStatus,
  RetrievalStatus,
  ReviewStatus,
  Role,
  ScanStatus,
  TaskStatus,
} from "@/lib/types/enums";
import {
  DATA_ORIGIN_LABELS,
  DATA_ORIGIN_TONES,
  DNS_STATUS_LABELS,
  DNS_STATUS_TONES,
  EVIDENCE_KIND_DESCRIPTIONS,
  EVIDENCE_KIND_LABELS,
  EVIDENCE_KIND_TONES,
  MATCH_TYPE_LABELS,
  NOT_CHECKED_HINT,
  NOT_CHECKED_LABEL,
  PRIORITY_LABELS,
  PRIORITY_TONES,
  REGULATORY_SOURCE_TYPE_LABELS,
  RELATIONSHIP_TYPE_SHORT_LABELS,
  RELATIONSHIP_TYPE_TONES,
  REPORT_STATUS_DESCRIPTIONS,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_TONES,
  RETRIEVAL_STATUS_LABELS,
  RETRIEVAL_STATUS_TONES,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_TONES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  SCAN_STATUS_LABELS,
  SCAN_STATUS_TONES,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
} from "@/lib/utils/labels";

/**
 * Status badges.
 *
 * Every enum gets exactly one badge component, so the same status always looks
 * the same everywhere. Several carry a tooltip explaining what the status
 * actually means — that explanation is part of the product, not a nicety.
 */

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return <Badge tone={REVIEW_STATUS_TONES[status]}>{REVIEW_STATUS_LABELS[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Tooltip
      content={
        priority === "UNTRIAGED"
          ? "No one has triaged this yet. Priority orders work; it is not a measure of wrongdoing."
          : "Investigative priority, set by a reviewer. It orders work and is not a finding."
      }
    >
      <Badge tone={PRIORITY_TONES[priority]}>{PRIORITY_LABELS[priority]}</Badge>
    </Tooltip>
  );
}

export function ScanStatusBadge({ status }: { status: ScanStatus }) {
  return (
    <Badge tone={SCAN_STATUS_TONES[status]}>
      {status === "RUNNING" ? (
        <Radio className="size-2.5 animate-pulse-soft" aria-hidden="true" />
      ) : null}
      {SCAN_STATUS_LABELS[status]}
    </Badge>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={TASK_STATUS_TONES[status]}>{TASK_STATUS_LABELS[status]}</Badge>;
}

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return (
    <Tooltip content={REPORT_STATUS_DESCRIPTIONS[status]}>
      <Badge tone={REPORT_STATUS_TONES[status]}>{REPORT_STATUS_LABELS[status]}</Badge>
    </Tooltip>
  );
}

export function RetrievalStatusBadge({ status }: { status: RetrievalStatus }) {
  return <Badge tone={RETRIEVAL_STATUS_TONES[status]}>{RETRIEVAL_STATUS_LABELS[status]}</Badge>;
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <Tooltip content={ROLE_DESCRIPTIONS[role]}>
      <Badge tone={role === "ADMINISTRATOR" ? "info" : "neutral"}>{ROLE_LABELS[role]}</Badge>
    </Tooltip>
  );
}

export function RelationshipTypeBadge({ type }: { type: RelationshipType }) {
  return (
    <Badge tone={RELATIONSHIP_TYPE_TONES[type]}>{RELATIONSHIP_TYPE_SHORT_LABELS[type]}</Badge>
  );
}

export function MatchTypeBadge({ type }: { type: MatchType }) {
  return (
    <Tooltip
      content={
        type === "BRAND_TOKEN" || type === "CONTEXTUAL_MENTION"
          ? "A weak match type. A brand token or passing mention is frequently a false positive."
          : "A specific match on a full domain or entity name. Still requires verification against the published source."
      }
    >
      <Badge tone={type === "EXACT_DOMAIN" ? "review" : "muted"}>{MATCH_TYPE_LABELS[type]}</Badge>
    </Tooltip>
  );
}

export function RegulatorySourceTypeBadge({ type }: { type: RegulatorySourceType }) {
  return (
    <Badge tone={type === "AUTHORISED_ENTITY_REGISTER" ? "verified" : "neutral"}>
      {REGULATORY_SOURCE_TYPE_LABELS[type]}
    </Badge>
  );
}

/**
 * The evidence label — the single most important badge in the product.
 *
 * Always carries its definition as a tooltip, because the difference between
 * an observed fact and an inferred relationship is the difference between
 * evidence and a hypothesis.
 */
export function EvidenceKindBadge({ kind }: { kind: EvidenceKind }) {
  return (
    <Tooltip content={EVIDENCE_KIND_DESCRIPTIONS[kind]}>
      <Badge tone={EVIDENCE_KIND_TONES[kind]} className="cursor-help">
        {EVIDENCE_KIND_LABELS[kind]}
      </Badge>
    </Tooltip>
  );
}

/** Marks a record's provenance. Shown wherever simulated data is displayed. */
export function DataOriginBadge({
  origin,
  compact = false,
}: {
  origin: DataOrigin;
  compact?: boolean;
}) {
  const isSimulated = origin === "SIMULATED_DEMO";

  return (
    <Tooltip
      content={
        isSimulated
          ? "Generated locally from synthetic fixtures. Not the result of a real search, DNS or HTTP check, model call, or regulatory retrieval."
          : "Collected from a live external source at the time shown."
      }
    >
      <Badge tone={DATA_ORIGIN_TONES[origin]} className="cursor-help">
        {isSimulated ? <FlaskConical className="size-2.5" aria-hidden="true" /> : null}
        {compact ? (isSimulated ? "Simulated" : "Live") : DATA_ORIGIN_LABELS[origin]}
      </Badge>
    </Tooltip>
  );
}

/**
 * Renders a DNS status, or "Not checked" when no check was attempted.
 *
 * This component exists so the distinction can never be lost: a null status is
 * the absence of a check, not a negative result.
 */
export function DnsStatusValue({ status }: { status: DnsStatus | null }) {
  if (status === null) return <NotCheckedValue />;
  return <Badge tone={DNS_STATUS_TONES[status]}>{DNS_STATUS_LABELS[status]}</Badge>;
}

/** The canonical "no check was attempted" rendering. */
export function NotCheckedValue({ className }: { className?: string }) {
  return (
    <Tooltip content={NOT_CHECKED_HINT}>
      <span
        className={cn(
          "inline-flex cursor-help items-center gap-1 text-[11px] italic text-foreground-subtle",
          className,
        )}
      >
        <CircleHelp className="size-3" aria-hidden="true" />
        {NOT_CHECKED_LABEL}
      </span>
    </Tooltip>
  );
}

/**
 * A 0-100 investigative confidence score.
 *
 * Always labelled as a signal. The tooltip says so explicitly, because a bare
 * number invites being read as a probability of wrongdoing.
 */
export function ConfidenceIndicator({
  value,
  label = "Confidence",
  className,
}: {
  value: number | null;
  label?: string;
  className?: string;
}) {
  if (value === null) return <NotCheckedValue className={className} />;

  const tone =
    value >= 80 ? "bg-verified" : value >= 55 ? "bg-accent" : value >= 30 ? "bg-review" : "bg-muted";

  return (
    <Tooltip
      content={`${label}: ${value}/100. An investigative signal used to order work — not a probability of wrongdoing and not a legal determination.`}
    >
      <span className={cn("inline-flex cursor-help items-center gap-1.5", className)}>
        <span className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-hover">
          <span
            className={cn("block h-full rounded-full", tone)}
            style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          />
        </span>
        <span className="font-mono text-[11px] text-foreground-muted">{value}</span>
      </span>
    </Tooltip>
  );
}

/**
 * Evidence completeness meter.
 *
 * Measures how much of the evidence picture is filled in — explicitly NOT how
 * suspicious a domain is. The tooltip makes that separation explicit, because
 * a progress bar next to a domain name invites exactly the wrong reading.
 */
export function EvidenceCompletenessMeter({
  percent,
  className,
  showLabel = true,
}: {
  percent: number;
  className?: string;
  showLabel?: boolean;
}) {
  const tone =
    percent >= 85
      ? "bg-verified"
      : percent >= 50
        ? "bg-accent"
        : percent >= 25
          ? "bg-review"
          : "bg-muted";

  return (
    <Tooltip
      content={
        <span>
          <strong>{percent}% complete.</strong> How much of the evidence picture has been filled
          in — DNS, HTTP, page content, certificate, an observed fact with a source, an
          official-source check and a reviewer assessment. It is <em>not</em> a measure of how
          suspicious this domain is: an unrelated domain can be 100% complete.
        </span>
      }
    >
      <span className={cn("inline-flex cursor-help items-center gap-2", className)}>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-hover">
          <span
            className={cn("block h-full rounded-full transition-[width] duration-300", tone)}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </span>
        {showLabel ? (
          <span className="font-mono text-[11px] text-foreground-muted">{percent}%</span>
        ) : null}
      </span>
    </Tooltip>
  );
}
