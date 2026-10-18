"use client";

import * as React from "react";
import {
  CircleDashed,
  CircleSlash,
  Loader2,
  OctagonAlert,
  RotateCcw,
  SquareCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { DataOriginBadge, TaskStatusBadge } from "@/components/shared/badges";
import { cn } from "@/lib/utils/cn";
import { SCAN_PROGRESS_POLL_INTERVAL_MS } from "@/lib/config/constants";
import type { ScanProgress } from "@/lib/types/views";
import type { TaskStatus } from "@/lib/types/enums";
import { AGENT_LABELS, SCAN_STATUS_LABELS } from "@/lib/utils/labels";
import { formatDuration, formatNumber } from "@/lib/utils/format";

/**
 * Live scan progress.
 *
 * Polls /api/scans/[id]/progress while the scan is active and stops as soon as
 * it reaches a terminal state. Everything shown — percentage, current agent,
 * per-task status, counts — comes from real orchestrator state, so a stalled
 * or failed scan looks stalled or failed rather than continuing to animate.
 */

const TERMINAL: ReadonlySet<string> = new Set([
  "COMPLETED",
  "COMPLETED_WITH_WARNINGS",
  "FAILED",
  "CANCELLED",
]);

const TASK_ICONS: Record<TaskStatus, React.ComponentType<{ className?: string }>> = {
  PENDING: CircleDashed,
  RUNNING: Loader2,
  COMPLETED: SquareCheck,
  COMPLETED_WITH_WARNINGS: TriangleAlert,
  FAILED: XCircle,
  SKIPPED: CircleSlash,
  CANCELLED: CircleSlash,
};

export function ScanProgressPanel({
  scanId,
  reference,
  onComplete,
  showCancel = true,
  showRetry = true,
  compact = false,
}: {
  scanId: string;
  reference: string;
  onComplete?: (progress: ScanProgress) => void;
  showCancel?: boolean;
  showRetry?: boolean;
  compact?: boolean;
}) {
  const { push } = useToast();
  const [progress, setProgress] = React.useState<ScanProgress | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const completedRef = React.useRef(false);
  const onCompleteRef = React.useRef(onComplete);

  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const response = await fetch(`/api/scans/${scanId}/progress`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });

        if (!response.ok) {
          if (!cancelled) {
            setError(
              response.status === 404
                ? "This scan could not be found."
                : "Could not read scan progress.",
            );
          }
          return;
        }

        const payload = (await response.json()) as { data: ScanProgress };
        if (cancelled) return;

        setProgress(payload.data);
        setError(null);

        if (TERMINAL.has(payload.data.status)) {
          if (!completedRef.current) {
            completedRef.current = true;
            onCompleteRef.current?.(payload.data);

            const tone =
              payload.data.status === "COMPLETED"
                ? "verified"
                : payload.data.status === "FAILED"
                  ? "critical"
                  : "review";
            push({
              tone,
              title: `${reference} ${SCAN_STATUS_LABELS[payload.data.status].toLowerCase()}`,
              description:
                payload.data.errorMessage ??
                `${formatNumber(payload.data.candidatesFound)} candidate(s) found in ${formatDuration(payload.data.elapsedMs)}.`,
            });
          }
          // Terminal: stop polling rather than spinning forever.
          return;
        }

        timer = setTimeout(() => void poll(), SCAN_PROGRESS_POLL_INTERVAL_MS);
      } catch (caught) {
        if (!cancelled && (caught as Error).name !== "AbortError") {
          setError("Lost contact with the server while reading progress.");
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [scanId, reference, push]);

  const cancel = async () => {
    setCancelling(true);
    try {
      const response = await fetch(`/api/scans/${scanId}/cancel`, { method: "POST" });
      const payload = (await response.json()) as {
        data?: { message?: string };
        error?: { message?: string };
      };
      push({
        tone: response.ok ? "review" : "critical",
        title: response.ok ? "Cancellation requested" : "Could not cancel",
        description: payload.data?.message ?? payload.error?.message,
      });
    } catch {
      push({ tone: "critical", title: "Could not cancel", description: "The request failed." });
    } finally {
      setCancelling(false);
    }
  };

  const retry = async () => {
    setRetrying(true);
    try {
      const response = await fetch(`/api/scans/${scanId}/retry`, { method: "POST" });
      const payload = (await response.json()) as {
        data?: { message?: string; scan?: { id: string } };
        error?: { message?: string };
      };
      push({
        tone: response.ok ? "info" : "critical",
        title: response.ok ? "Retry started" : "Could not retry",
        description: payload.data?.message ?? payload.error?.message,
      });
      if (response.ok && payload.data?.scan?.id) {
        window.location.href = `/scans/${payload.data.scan.id}`;
      }
    } catch {
      push({ tone: "critical", title: "Could not retry", description: "The request failed." });
    } finally {
      setRetrying(false);
    }
  };

  if (error && !progress) {
    return (
      <Alert tone="critical" title="Progress unavailable" role="alert">
        {error}
      </Alert>
    );
  }

  if (!progress) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-foreground-muted">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Reading scan state…
      </div>
    );
  }

  const isActive = !TERMINAL.has(progress.status);
  const tone =
    progress.status === "FAILED"
      ? "critical"
      : progress.status === "COMPLETED"
        ? "verified"
        : progress.status === "COMPLETED_WITH_WARNINGS" || progress.status === "CANCELLED"
          ? "review"
          : "accent";

  return (
    <div className="flex flex-col gap-4">
      {/* Headline state */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge
              tone={
                tone === "accent" ? "info" : (tone as "verified" | "review" | "critical")
              }
            >
              {isActive ? (
                <Loader2 className="size-2.5 animate-spin" aria-hidden="true" />
              ) : null}
              {SCAN_STATUS_LABELS[progress.status]}
            </Badge>
            {progress.isSimulated ? <DataOriginBadge origin="SIMULATED_DEMO" compact /> : null}
            <span className="font-mono text-[11px] text-foreground-subtle">
              {formatDuration(progress.elapsedMs)}
            </span>
          </div>
          <span className="font-mono text-xs font-medium tabular-nums text-foreground">
            {progress.percentComplete}%
          </span>
        </div>

        <Progress
          value={progress.percentComplete}
          tone={tone === "accent" ? "accent" : (tone as "verified" | "review" | "critical")}
          label={`Scan ${progress.percentComplete}% complete`}
        />

        <p className="min-h-4 text-[11px] text-foreground-muted" aria-live="polite">
          {progress.currentAgent
            ? `${AGENT_LABELS[progress.currentAgent]}: ${progress.currentMessage ?? "working"}`
            : (progress.currentMessage ?? "")}
        </p>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-2">
        <Counter label="Candidates found" value={progress.candidatesFound} />
        <Counter label="Need review" value={progress.candidatesRequiringReview} tone="review" />
        <Counter
          label="Warnings"
          value={progress.warningCount}
          tone={progress.warningCount > 0 ? "review" : "neutral"}
        />
      </div>

      {/* Error, when there is one */}
      {progress.errorMessage ? (
        <Alert
          tone={progress.status === "FAILED" ? "critical" : "review"}
          title={progress.status === "FAILED" ? "This scan failed" : "Completed with warnings"}
          icon={<OctagonAlert />}
        >
          {progress.errorMessage}
        </Alert>
      ) : null}

      {/* Agent task timeline */}
      <div>
        <h3 className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
          Agent tasks
        </h3>
        <ol className="flex flex-col gap-1.5">
          {progress.tasks.map((task) => {
            const Icon = TASK_ICONS[task.status];
            const isRunning = task.status === "RUNNING";

            return (
              <li
                key={task.id}
                className={cn(
                  "flex gap-2.5 rounded-md border px-2.5 py-2 transition-colors",
                  isRunning
                    ? "border-accent/45 bg-accent-subtle/25"
                    : task.status === "FAILED"
                      ? "border-critical/35 bg-critical-subtle/20"
                      : "border-border bg-surface-sunken/40",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0",
                    isRunning && "animate-spin text-accent",
                    task.status === "COMPLETED" && "text-verified",
                    task.status === "COMPLETED_WITH_WARNINGS" && "text-review",
                    task.status === "FAILED" && "text-critical",
                    (task.status === "PENDING" ||
                      task.status === "SKIPPED" ||
                      task.status === "CANCELLED") &&
                      "text-foreground-subtle",
                  )}
                  aria-hidden="true"
                />

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[11px] font-medium text-foreground">
                      {AGENT_LABELS[task.agentKey]}
                    </span>
                    <TaskStatusBadge status={task.status} />
                    {task.attempt > 1 ? (
                      <Tooltip content="This task failed and was retried automatically.">
                        <Badge tone="review" size="sm" className="cursor-help">
                          Attempt {task.attempt}/{task.maxAttempts}
                        </Badge>
                      </Tooltip>
                    ) : null}
                    {task.durationMs !== null ? (
                      <span className="font-mono text-[10px] text-foreground-subtle">
                        {formatDuration(task.durationMs)}
                      </span>
                    ) : null}
                  </div>

                  {!compact ? (
                    <p className="text-[10px] leading-relaxed text-foreground-subtle">
                      {task.title}
                    </p>
                  ) : null}

                  {task.outputSummary ? (
                    <p className="text-[11px] leading-relaxed text-foreground-muted">
                      {task.outputSummary}
                    </p>
                  ) : null}

                  {task.errorMessage ? (
                    <p className="text-[11px] leading-relaxed text-critical-foreground">
                      {task.errorMessage}
                    </p>
                  ) : null}

                  {task.metrics && Object.keys(task.metrics).length > 0 && !compact ? (
                    <ul className="flex flex-wrap gap-1 pt-0.5">
                      {Object.entries(task.metrics)
                        .filter(([key]) => key !== "durationMs")
                        .map(([key, value]) => (
                          <li key={key}>
                            <Badge tone="muted" size="sm">
                              {humanise(key)}: {formatNumber(value)}
                            </Badge>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {isActive && showCancel ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void cancel()}
            loading={cancelling}
            loadingLabel="Cancelling…"
          >
            <CircleSlash aria-hidden="true" />
            Cancel scan
          </Button>
        ) : null}

        {!isActive &&
        showRetry &&
        (progress.status === "FAILED" || progress.status === "CANCELLED") ? (
          <Tooltip content="Starts a NEW scan with the same inputs. This scan's record is left unchanged.">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void retry()}
              loading={retrying}
              loadingLabel="Starting…"
            >
              <RotateCcw aria-hidden="true" />
              Retry as a new scan
            </Button>
          </Tooltip>
        ) : null}

        {error ? (
          <span role="alert" className="text-[11px] text-critical">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "review";
}) {
  return (
    <div className="rounded-md border border-border bg-surface-sunken/50 px-2.5 py-2">
      <p className="text-[10px] text-foreground-subtle">{label}</p>
      <p
        className={cn(
          "pt-0.5 font-mono text-base font-semibold tabular-nums leading-none",
          tone === "review" && value > 0 ? "text-review-foreground" : "text-foreground",
        )}
      >
        {formatNumber(value)}
      </p>
    </div>
  );
}

function humanise(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase())
    .trim()
    .toLowerCase();
}
