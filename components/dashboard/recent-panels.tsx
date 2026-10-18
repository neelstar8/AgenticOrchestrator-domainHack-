import Link from "next/link";
import { ArrowRight, Landmark, Radar } from "lucide-react";

import {
  DataOriginBadge,
  EvidenceCompletenessMeter,
  PriorityBadge,
  ReviewStatusBadge,
  RetrievalStatusBadge,
  ScanStatusBadge,
} from "@/components/shared/badges";
import { RelativeTime } from "@/components/shared/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  MonoCell,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import type { OverviewMetrics } from "@/lib/types/views";
import { AGENT_LABELS, SCAN_PROFILE_LABELS } from "@/lib/utils/labels";
import { formatDuration, formatNumber } from "@/lib/utils/format";

/** Recent discoveries table with the nine specified columns. */
export function RecentDiscoveries({ metrics }: { metrics: OverviewMetrics }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <CardTitle>Recent discoveries</CardTitle>
          <CardDescription>
            The newest candidate domains. Every row is a candidate to verify, not a finding.
          </CardDescription>
        </div>
        <Button asChild variant="secondary" size="sm" className="shrink-0">
          <Link href="/domains">
            View all domains
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {metrics.recentDiscoveries.length === 0 ? (
          <EmptyState
            title="No domains discovered yet"
            description="Start a scan to populate the registry."
            className="m-4"
          />
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Discovery source</TableHead>
                  <TableHead>First discovered</TableHead>
                  <TableHead>Last checked</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Review status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead align="right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.recentDiscoveries.map((domain) => (
                  <TableRow key={domain.id}>
                    <MonoCell>
                      <Link
                        href={`/domains/${domain.id}`}
                        className="transition-colors hover:text-accent hover:underline"
                      >
                        {domain.fqdn}
                      </Link>
                    </MonoCell>
                    <TableCell className="max-w-40 truncate">
                      {domain.seedPlatform?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {domain.discoverySources.slice(0, 2).map((source) => (
                          <Badge key={source.id} tone="muted" size="sm">
                            {source.name}
                          </Badge>
                        ))}
                        {domain.discoverySources.length > 2 ? (
                          <Badge tone="muted" size="sm">
                            +{domain.discoverySources.length - 2}
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <RelativeTime value={domain.firstSeenAt} />
                    </TableCell>
                    <TableCell>
                      <RelativeTime value={domain.lastCheckedAt} />
                    </TableCell>
                    <TableCell>
                      <EvidenceCompletenessMeter percent={domain.evidenceCompleteness} />
                    </TableCell>
                    <TableCell>
                      <ReviewStatusBadge status={domain.reviewStatus} />
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={domain.priority} />
                    </TableCell>
                    <TableCell align="right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/domains/${domain.id}`}>Review</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>
        )}
      </CardContent>
    </Card>
  );
}

/** Recent scan activity, the agent execution summary, and latest source checks. */
export function OverviewSidePanels({ metrics }: { metrics: OverviewMetrics }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Recent scan activity</CardTitle>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link href="/scans">All scans</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {metrics.recentScans.length === 0 ? (
            <EmptyState
              icon={<Radar />}
              title="No scans yet"
              description="Start one from the New scan button."
              className="m-4"
            />
          ) : (
            <ul className="divide-y divide-border">
              {metrics.recentScans.map((scan) => (
                <li key={scan.id}>
                  <Link
                    href={`/scans/${scan.id}`}
                    className="flex flex-col gap-1.5 px-4 py-2.5 transition-colors hover:bg-surface-hover"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[11px] text-foreground">
                        {scan.reference}
                      </span>
                      <ScanStatusBadge status={scan.status} />
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-foreground-subtle">
                      <span className="truncate">{scan.platformNameInput}</span>
                      <span aria-hidden="true">·</span>
                      <span>{SCAN_PROFILE_LABELS[scan.profile]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatNumber(scan.candidatesFound)} candidates</span>
                      <span aria-hidden="true">·</span>
                      <RelativeTime value={scan.queuedAt} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent execution summary</CardTitle>
          <CardDescription>Across every scan on record.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {metrics.agentExecutionSummary.length === 0 ? (
            <EmptyState
              title="No agent runs yet"
              description="Agent statistics appear after the first scan."
              className="m-4"
            />
          ) : (
            <ul className="divide-y divide-border">
              {metrics.agentExecutionSummary.map((agent) => (
                <li key={agent.agentKey} className="flex flex-col gap-1 px-4 py-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-foreground">
                      {AGENT_LABELS[agent.agentKey]}
                    </span>
                    {agent.failed > 0 ? (
                      <Badge tone="critical" size="sm">
                        {agent.failed} failed
                      </Badge>
                    ) : (
                      <Badge tone="verified" size="sm">
                        {agent.completed}/{agent.totalTasks}
                      </Badge>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-[10px] text-foreground-subtle">
                    <span>{agent.totalTasks} task{agent.totalTasks === 1 ? "" : "s"}</span>
                    {agent.warnings > 0 ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-review-foreground">
                          {agent.warnings} with warnings
                        </span>
                      </>
                    ) : null}
                    <span aria-hidden="true">·</span>
                    <span>avg {formatDuration(agent.averageDurationMs)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Latest official-source checks</CardTitle>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link href="/regulatory-sources">Sources</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {metrics.latestRegulatoryChecks.length === 0 ? (
            <EmptyState
              icon={<Landmark />}
              title="No source checks recorded"
              description="No configured regulatory source has been checked yet. Nothing has been retrieved and nothing is implied."
              className="m-4"
            />
          ) : (
            <ul className="divide-y divide-border">
              {metrics.latestRegulatoryChecks.map((check) => {
                const isFixture = check.sourceUrl.includes(".invalid");
                return (
                  <li key={check.id} className="flex flex-col gap-1.5 px-4 py-2.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-medium text-foreground">
                        {check.authorityShortName}
                      </span>
                      <RetrievalStatusBadge status={check.status} />
                    </span>
                    <span className="truncate text-[10px] text-foreground-muted">
                      {check.sourceTitle}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-foreground-subtle">
                      <RelativeTime value={check.startedAt} />
                      <span aria-hidden="true">·</span>
                      <Tooltip
                        content={
                          check.matchedEntityCount === 0
                            ? "This check found no match. That is recorded as a checked non-match and is NOT evidence of authorisation."
                            : "Matches require human verification against the published source."
                        }
                      >
                        <span className="cursor-help">
                          {check.matchedEntityCount} match
                          {check.matchedEntityCount === 1 ? "" : "es"}
                        </span>
                      </Tooltip>
                      {isFixture ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <DataOriginBadge origin="SIMULATED_DEMO" compact />
                        </>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
