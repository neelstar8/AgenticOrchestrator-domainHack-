"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { OverviewMetrics } from "@/lib/types/views";
import { PRIORITY_LABELS, REVIEW_STATUS_LABELS } from "@/lib/utils/labels";
import { formatNumber } from "@/lib/utils/format";

/**
 * Overview visualisations.
 *
 * Four charts, all driven by repository-computed metrics. Clicking a slice or
 * bar navigates to the filtered view behind it, so a chart is a way into the
 * data rather than a decoration.
 *
 * Colour follows the product's semantics: the categorical palette is used for
 * sources, and status charts reuse the verified/review/critical roles so a
 * reader does not have to learn a second colour language.
 */

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
];

const REVIEW_STATUS_COLORS: Record<string, string> = {
  AWAITING_REVIEW: "var(--color-review)",
  UNDER_REVIEW: "var(--color-chart-1)",
  NEEDS_MORE_EVIDENCE: "var(--color-chart-4)",
  ESCALATED: "var(--color-critical)",
  INCLUDED_IN_REPORT: "var(--color-verified)",
  NOT_RELATED: "var(--color-muted)",
  DISMISSED: "var(--color-chart-grid)",
};

function ChartTooltip({
  active,
  payload,
  label,
  valueSuffix = "",
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: unknown }>;
  label?: string | number;
  valueSuffix?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border-strong bg-surface-raised px-2.5 py-1.5 shadow-lg">
      {label !== undefined ? (
        <p className="pb-1 text-[11px] font-medium text-foreground">{label}</p>
      ) : null}
      <ul className="space-y-0.5">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
            <span
              className="size-2 shrink-0 rounded-sm"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            <span>{entry.name}</span>
            <span className="ml-auto font-mono font-medium text-foreground">
              {entry.value}
              {valueSuffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const AXIS_PROPS = {
  stroke: "var(--color-chart-grid)",
  tick: { fill: "var(--color-foreground-subtle)", fontSize: 10 },
  tickLine: false,
} as const;

function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function OverviewCharts({ metrics }: { metrics: OverviewMetrics }) {
  const router = useRouter();

  const discoveries = React.useMemo(
    () =>
      metrics.discoveriesOverTime.map((point) => ({
        ...point,
        label: shortDate(point.date),
      })),
    [metrics.discoveriesOverTime],
  );

  const scanActivity = React.useMemo(
    () =>
      metrics.scanActivity
        .filter((point) => point.total > 0)
        .map((point) => ({ ...point, label: shortDate(point.date) })),
    [metrics.scanActivity],
  );

  const reviewDistribution = React.useMemo(
    () =>
      metrics.reviewStatusDistribution.map((entry) => ({
        name: REVIEW_STATUS_LABELS[entry.status],
        status: entry.status,
        value: entry.count,
      })),
    [metrics.reviewStatusDistribution],
  );

  const sources = React.useMemo(
    () =>
      metrics.discoverySourceContribution.map((entry) => ({
        name: entry.sourceName,
        key: entry.sourceKey,
        value: entry.count,
      })),
    [metrics.discoverySourceContribution],
  );

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {/* Discoveries over time */}
      <Card>
        <CardHeader>
          <CardTitle>Domain discoveries over time</CardTitle>
          <CardDescription>
            New candidate domains per day over the last 30 days, with the running total. A
            discovery is a candidate to verify, not a finding.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64 px-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={discoveries} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="discoveryFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-chart-grid)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="label" interval={5} {...AXIS_PROPS} />
              <YAxis allowDecimals={false} width={38} {...AXIS_PROPS} />
              <RechartsTooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="cumulative"
                name="Cumulative"
                stroke="var(--color-chart-2)"
                strokeWidth={1.25}
                strokeDasharray="3 3"
                fill="none"
              />
              <Area
                type="monotone"
                dataKey="discovered"
                name="Discovered"
                stroke="var(--color-chart-1)"
                strokeWidth={1.75}
                fill="url(#discoveryFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Investigation status distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Investigation status</CardTitle>
          <CardDescription>
            Where every candidate currently sits. Click a segment to open that filtered view.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          {reviewDistribution.length === 0 ? (
            <EmptyState
              title="No domains yet"
              description="Run a scan to populate the registry."
              className="h-full border-0 bg-transparent"
            />
          ) : (
            <div className="flex h-full flex-col gap-3 sm:flex-row sm:items-center">
              <div className="h-36 w-full sm:h-full sm:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={reviewDistribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={2}
                      strokeWidth={1}
                      stroke="var(--color-surface)"
                      onClick={(entry: unknown) => {
                        const status = (entry as { status?: string } | undefined)?.status;
                        if (status) router.push(`/domains?reviewStatus=${status}`);
                      }}
                      className="cursor-pointer outline-none"
                    >
                      {reviewDistribution.map((entry) => (
                        <Cell
                          key={entry.status}
                          fill={REVIEW_STATUS_COLORS[entry.status] ?? "var(--color-muted)"}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ul className="flex w-full flex-col gap-1 sm:w-1/2">
                {reviewDistribution.map((entry) => (
                  <li key={entry.status}>
                    <button
                      type="button"
                      onClick={() => router.push(`/domains?reviewStatus=${entry.status}`)}
                      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                    >
                      <span
                        className="size-2 shrink-0 rounded-sm"
                        style={{
                          backgroundColor:
                            REVIEW_STATUS_COLORS[entry.status] ?? "var(--color-muted)",
                        }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-foreground-muted">
                        {entry.name}
                      </span>
                      <span className="font-mono text-[11px] font-medium text-foreground">
                        {entry.value}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discovery source contribution */}
      <Card>
        <CardHeader>
          <CardTitle>Sources contributing to discovery</CardTitle>
          <CardDescription>
            How many domains each discovery source surfaced. A source finding a domain says nothing
            about that domain.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64 px-2">
          {sources.length === 0 ? (
            <EmptyState
              title="No discovery sources yet"
              description="Sources appear once a scan has run."
              className="h-full border-0 bg-transparent"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sources}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
              >
                <CartesianGrid
                  stroke="var(--color-chart-grid)"
                  strokeDasharray="2 4"
                  horizontal={false}
                />
                <XAxis type="number" allowDecimals={false} {...AXIS_PROPS} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={128}
                  {...AXIS_PROPS}
                  tick={{ fill: "var(--color-foreground-muted)", fontSize: 10 }}
                />
                <RechartsTooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="value"
                  name="Domains"
                  radius={[0, 3, 3, 0]}
                  barSize={14}
                  className="cursor-pointer"
                  onClick={((entry: unknown) => {
                    const key = (entry as { key?: string } | undefined)?.key;
                    if (key) router.push(`/domains?discoverySourceKey=${key}`);
                  }) as never}
                >
                  {sources.map((entry, index) => (
                    <Cell key={entry.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Scan activity and success rate */}
      <Card>
        <CardHeader>
          <CardTitle>Scan activity and success rate</CardTitle>
          <CardDescription>
            Scans started per day, and the share of resolved scans that completed rather than
            failed.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64 px-2">
          {scanActivity.length === 0 ? (
            <EmptyState
              title="No scans in the last 30 days"
              description="Start a scan to see activity here."
              className="h-full border-0 bg-transparent"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scanActivity} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
                <CartesianGrid
                  stroke="var(--color-chart-grid)"
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis dataKey="label" {...AXIS_PROPS} />
                <YAxis allowDecimals={false} width={38} {...AXIS_PROPS} />
                <RechartsTooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke="var(--color-verified)"
                  strokeWidth={1.75}
                  dot={{ r: 2.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="failed"
                  name="Failed"
                  stroke="var(--color-critical)"
                  strokeWidth={1.75}
                  dot={{ r: 2.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="successRate"
                  name="Success rate %"
                  stroke="var(--color-chart-1)"
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Evidence completeness distribution */}
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Evidence completeness across the registry</CardTitle>
          <CardDescription>
            How much of the evidence picture is filled in per domain — DNS, HTTP, page content,
            certificate, a sourced observed fact, an official-source check and a reviewer
            assessment. Average {metrics.evidenceCompleteness.averagePercent}%. This measures
            thoroughness of investigation, not suspicion: an unrelated domain can reach 100%.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-48 px-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={metrics.evidenceCompleteness.buckets}
              margin={{ top: 4, right: 10, bottom: 0, left: -18 }}
            >
              <CartesianGrid
                stroke="var(--color-chart-grid)"
                strokeDasharray="2 4"
                vertical={false}
              />
              <XAxis dataKey="label" {...AXIS_PROPS} />
              <YAxis allowDecimals={false} width={38} {...AXIS_PROPS} />
              <RechartsTooltip content={<ChartTooltip />} />
              <Bar
                dataKey="count"
                name="Domains"
                radius={[3, 3, 0, 0]}
                className="cursor-pointer"
                onClick={((entry: unknown) => {
                  const bucket = entry as { min?: number; max?: number } | undefined;
                  if (bucket?.min !== undefined && bucket.max !== undefined) {
                    router.push(
                      `/domains?minEvidenceCompleteness=${bucket.min}&maxEvidenceCompleteness=${bucket.max}`,
                    );
                  }
                }) as never}
              >
                {metrics.evidenceCompleteness.buckets.map((bucket, index) => (
                  <Cell
                    key={bucket.label}
                    fill={
                      index === 0
                        ? "var(--color-muted)"
                        : index === 1
                          ? "var(--color-chart-4)"
                          : index === 2
                            ? "var(--color-chart-1)"
                            : "var(--color-verified)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Priority distribution, as a compact bar list rather than a 6th chart */}
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Triage priority</CardTitle>
          <CardDescription>
            Priority orders investigator work. It is set by a reviewer — an agent can suggest no
            higher than Medium — and it is not a measure of wrongdoing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {metrics.priorityDistribution.map((entry) => {
              const share =
                metrics.totalDomainsDiscovered === 0
                  ? 0
                  : (entry.count / metrics.totalDomainsDiscovered) * 100;
              const tone =
                entry.priority === "CRITICAL"
                  ? "bg-critical"
                  : entry.priority === "HIGH"
                    ? "bg-review"
                    : entry.priority === "MEDIUM"
                      ? "bg-chart-1"
                      : "bg-muted";

              return (
                <li key={entry.priority}>
                  <button
                    type="button"
                    onClick={() => router.push(`/domains?priority=${entry.priority}`)}
                    className="flex w-full items-center gap-3 rounded px-1 py-0.5 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                  >
                    <span className="w-20 shrink-0 text-[11px] text-foreground-muted">
                      {PRIORITY_LABELS[entry.priority]}
                    </span>
                    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-hover">
                      <span
                        className={`block h-full rounded-full ${tone}`}
                        style={{ width: `${Math.max(2, share)}%` }}
                      />
                    </span>
                    <span className="w-16 shrink-0 text-right font-mono text-[11px] text-foreground">
                      {formatNumber(entry.count)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
