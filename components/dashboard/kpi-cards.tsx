import Link from "next/link";
import { ArrowUpRight, CheckCircle2, FileText, Globe, Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import { formatNumber } from "@/lib/utils/format";
import type { OverviewMetrics } from "@/lib/types/views";

/**
 * KPI cards.
 *
 * Every number comes from a repository query over the seeded data — there are
 * no hardcoded dashboard figures anywhere. Each card links to the filtered
 * view that produces exactly that number, so a reader can always check it.
 *
 * The tooltips matter: "Confirmed official actions" counts recorded workflow
 * state, not real-world enforcement, and saying so is the difference between
 * a useful metric and a misleading one.
 */
export function KpiCards({ metrics }: { metrics: OverviewMetrics }) {
  const cards = [
    {
      key: "discovered",
      label: "Domains discovered",
      value: metrics.totalDomainsDiscovered,
      icon: Globe,
      href: "/domains",
      tone: "info" as const,
      caption:
        metrics.simulatedDomainCount === metrics.totalDomainsDiscovered
          ? "All simulated demo data"
          : `${formatNumber(metrics.simulatedDomainCount)} simulated · ${formatNumber(metrics.liveCollectedDomainCount)} live`,
      tooltip:
        "Every candidate domain in the registry, including ones a reviewer has marked not related. " +
        "Discovering a domain is not a finding about it.",
    },
    {
      key: "awaiting",
      label: "Awaiting review",
      value: metrics.domainsAwaitingReview,
      icon: Inbox,
      href: "/domains?reviewStatus=AWAITING_REVIEW,UNDER_REVIEW,NEEDS_MORE_EVIDENCE",
      tone: "review" as const,
      caption: "Awaiting, under review or needing more evidence",
      tooltip:
        "Candidates that still need a human judgement. A high number means work is queued, " +
        "not that anything is wrong.",
    },
    {
      key: "reports",
      label: "Reports prepared",
      value: metrics.reportsPrepared,
      icon: FileText,
      href: "/reports",
      tone: "neutral" as const,
      caption: `${formatNumber(metrics.reportsSubmitted)} with a recorded submission`,
      tooltip:
        "Every report in any workflow state. 'Submitted' means a person recorded an out-of-band " +
        "submission; Sentinel never transmits a report.",
    },
    {
      key: "confirmed",
      label: "Confirmed official actions",
      value: metrics.confirmedOfficialActions,
      icon: CheckCircle2,
      href: "/reports?status=ACTION_CONFIRMED",
      tone: "verified" as const,
      caption: "Recorded by a reviewer against a submitted report",
      tooltip:
        "Counts reports where a reviewer recorded a confirmed outcome with a reference, after an " +
        "approval, a submission and a response. It measures recorded workflow state — NOT " +
        "real-world enforcement, and nothing Sentinel did. Sentinel cannot block a domain.",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Link
            key={card.key}
            href={card.href}
            className={cn(
              "group relative flex flex-col gap-2 rounded-lg border border-border bg-surface p-4",
              "shadow-sm transition-all hover:border-border-strong hover:shadow-md",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <Tooltip content={card.tooltip}>
                <span className="flex cursor-help items-center gap-1.5 text-[11px] font-medium text-foreground-muted">
                  <Icon className="size-3.5 text-foreground-subtle" aria-hidden="true" />
                  {card.label}
                </span>
              </Tooltip>
              <ArrowUpRight
                className="size-3.5 shrink-0 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              />
            </div>

            <p className="text-2xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
              {formatNumber(card.value)}
            </p>

            <div className="flex items-center gap-1.5">
              <Badge tone={card.tone} size="sm">
                {card.caption}
              </Badge>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
