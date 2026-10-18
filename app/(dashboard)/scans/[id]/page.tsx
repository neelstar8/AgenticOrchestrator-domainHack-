import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe, ShieldQuestion } from "lucide-react";

import { ScanProgressPanel } from "@/components/scans/scan-progress-panel";
import {
  DataOriginBadge,
  EvidenceCompletenessMeter,
  EvidenceKindBadge,
  PriorityBadge,
  ReviewStatusBadge,
  ScanStatusBadge,
} from "@/components/shared/badges";
import { DetailList, DetailRow, PageHeader } from "@/components/shared/page-header";
import { DemoSimulationNotice } from "@/components/shared/notices";
import { RelativeTime } from "@/components/shared/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requirePermission } from "@/lib/auth/guards";
import { getScanDetail } from "@/lib/services/scan-service";
import {
  DISCOVERY_SCOPE_LABELS,
  EVIDENCE_KIND_LABELS,
  SCAN_PROFILE_LABELS,
} from "@/lib/utils/labels";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/utils/format";
import type { EvidenceKind } from "@/lib/types/enums";

export const metadata = { title: "Scan detail" };

export default async function ScanDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Scan detail"
        description="The agent execution timeline, what each task produced or failed to produce, and every candidate and evidence item this scan created."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/scans">
              <ArrowLeft aria-hidden="true" />
              Back to scan history
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<ScanSkeleton />}>
        <ScanRegion id={decodeURIComponent(id)} />
      </Suspense>
    </div>
  );
}

async function ScanRegion({ id }: { id: string }) {
  const auth = await requirePermission("scans:read", `/scans/${id}`);
  const detail = await getScanDetail(auth, id);
  if (!detail) notFound();

  const evidenceKinds = Object.entries(detail.evidenceSummary.byKind) as Array<
    [EvidenceKind, number]
  >;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-lg font-semibold text-foreground">
              {detail.reference}
            </h2>
            <ScanStatusBadge status={detail.status} />
            <DataOriginBadge origin={detail.origin} />
            <Badge tone="muted">{SCAN_PROFILE_LABELS[detail.profile]}</Badge>
          </div>

          {detail.origin === "SIMULATED_DEMO" ? <DemoSimulationNotice compact /> : null}
        </CardContent>
      </Card>

      {/* Live progress / final outcome */}
      <Card>
        <CardHeader>
          <CardTitle>Agent execution timeline</CardTitle>
          <CardDescription>
            Read from live orchestrator state while the scan is running, and from the stored
            record once it has finished.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScanProgressPanel
            scanId={detail.id}
            reference={detail.reference}
            showCancel={auth.can("scans:cancel")}
            showRetry={auth.can("scans:create")}
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="inputs">
        <TabsList>
          <TabsTrigger value="inputs">Inputs and sources</TabsTrigger>
          <TabsTrigger value="domains">Domains ({detail.domains.length})</TabsTrigger>
          <TabsTrigger value="evidence">Evidence ({detail.evidence.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="inputs">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Scan inputs</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailList>
                  <DetailRow label="Scan reference">
                    <span className="font-mono">{detail.reference}</span>
                  </DetailRow>
                  <DetailRow label="Platform or brand entered">
                    {detail.platformNameInput}
                  </DetailRow>
                  <DetailRow label="Seed domain">
                    {detail.seedDomain ? (
                      <span className="font-mono">{detail.seedDomain}</span>
                    ) : (
                      "None provided"
                    )}
                  </DetailRow>
                  <DetailRow label="Profile">{SCAN_PROFILE_LABELS[detail.profile]}</DetailRow>
                  <DetailRow label="Discovery scopes">
                    <span className="flex flex-wrap gap-1">
                      {detail.scopes.map((scope) => (
                        <Badge key={scope} tone="muted">
                          {DISCOVERY_SCOPE_LABELS[scope]}
                        </Badge>
                      ))}
                    </span>
                  </DetailRow>
                  <DetailRow label="Maximum candidates">
                    {formatNumber(detail.maxCandidates)}
                  </DetailRow>
                  <DetailRow label="Initiated by">
                    {detail.initiatedBy?.name ?? "Unknown"}
                  </DetailRow>
                  <DetailRow label="Queued at">{formatDateTime(detail.queuedAt)}</DetailRow>
                  <DetailRow label="Started at">
                    {detail.startedAt ? formatDateTime(detail.startedAt) : "Not started"}
                  </DetailRow>
                  <DetailRow label="Finished at">
                    {detail.completedAt
                      ? formatDateTime(detail.completedAt)
                      : detail.cancelledAt
                        ? `Cancelled ${formatDateTime(detail.cancelledAt)}`
                        : "Still running"}
                  </DetailRow>
                  <DetailRow label="Duration">{formatDuration(detail.durationMs)}</DetailRow>
                  {detail.notes ? (
                    <DetailRow label="Investigation notes">{detail.notes}</DetailRow>
                  ) : null}
                </DetailList>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Discovery sources that contributed</CardTitle>
                  <CardDescription>
                    How many of this scan&rsquo;s domains each source surfaced.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {detail.discoverySources.length === 0 ? (
                    <EmptyState
                      title="No sources contributed"
                      description="This scan produced no candidates, so no discovery source is attributed to it."
                      className="m-4 border-0 bg-transparent"
                    />
                  ) : (
                    <ul className="divide-y divide-border">
                      {detail.discoverySources.map((entry) => (
                        <li
                          key={entry.source.id}
                          className="flex items-center justify-between gap-2 px-4 py-2.5"
                        >
                          <span className="min-w-0 flex-1 truncate text-[11px] text-foreground-muted">
                            {entry.source.name}
                          </span>
                          <Badge tone="neutral" size="sm">
                            {entry.domainCount}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Evidence summary</CardTitle>
                  <CardDescription>
                    {detail.evidenceSummary.withSourceUrl} of {detail.evidenceSummary.total} items
                    carry a source URL that can be independently re-checked.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {evidenceKinds.length === 0 ? (
                    <EmptyState
                      icon={<ShieldQuestion />}
                      title="No evidence recorded"
                      description="This scan produced no evidence items."
                      className="m-4 border-0 bg-transparent"
                    />
                  ) : (
                    <ul className="divide-y divide-border">
                      {evidenceKinds.map(([kind, count]) => (
                        <li
                          key={kind}
                          className="flex items-center justify-between gap-2 px-4 py-2.5"
                        >
                          <EvidenceKindBadge kind={kind} />
                          <span className="font-mono text-[11px] text-foreground">{count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="domains">
          {detail.domains.length === 0 ? (
            <EmptyState
              icon={<Globe />}
              title="This scan created no new domains"
              description={
                detail.status === "FAILED"
                  ? "The scan failed before producing candidates. Nothing is inferred from that failure."
                  : detail.status === "CANCELLED"
                    ? "The scan was cancelled before producing candidates."
                    : "Every host this scan encountered was already in the registry, so no new record was created."
              }
            />
          ) : (
            <TableWrapper>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Discovery sources</TableHead>
                    <TableHead>First seen</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Review status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead align="right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.domains.map((domain) => (
                    <TableRow key={domain.id}>
                      <MonoCell>
                        <Link
                          href={`/domains/${domain.id}`}
                          className="transition-colors hover:text-accent hover:underline"
                        >
                          {domain.fqdn}
                        </Link>
                      </MonoCell>
                      <TableCell>
                        <span className="flex flex-wrap gap-1">
                          {domain.discoverySources.map((source) => (
                            <Badge key={source.id} tone="muted" size="sm">
                              {source.name}
                            </Badge>
                          ))}
                        </span>
                      </TableCell>
                      <TableCell>
                        <RelativeTime value={domain.firstSeenAt} />
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
                          <Link href={`/domains/${domain.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          )}
        </TabsContent>

        <TabsContent value="evidence">
          {detail.evidence.length === 0 ? (
            <EmptyState
              icon={<ShieldQuestion />}
              title="No evidence recorded"
              description="This scan recorded no evidence items."
            />
          ) : (
            <TableWrapper>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Collected</TableHead>
                    <TableHead>Limitations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.evidence.slice(0, 200).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <EvidenceKindBadge kind={item.kind} />
                      </TableCell>
                      <TableCell className="max-w-72">
                        <span className="block truncate text-foreground">{item.title}</span>
                        <span className="block truncate text-[10px] text-foreground-subtle">
                          {item.description}
                        </span>
                      </TableCell>
                      <TableCell>
                        <RelativeTime value={item.collectedAt} />
                      </TableCell>
                      <TableCell className="max-w-96">
                        <span className="block text-[10px] leading-relaxed text-review-foreground">
                          {item.limitations ?? "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {detail.evidence.length > 200 ? (
                <p className="px-3 py-2 text-[11px] text-foreground-subtle">
                  Showing the first 200 of {formatNumber(detail.evidence.length)} items. Open a
                  domain to see its full evidence trail, or export it as CSV.
                </p>
              ) : null}
            </TableWrapper>
          )}
        </TabsContent>
      </Tabs>

      <p className="text-[10px] text-foreground-subtle">
        Evidence labels seen in this scan:{" "}
        {evidenceKinds.map(([kind]) => EVIDENCE_KIND_LABELS[kind]).join(", ") || "none"}.
      </p>
    </div>
  );
}

function ScanSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-1.5 w-full" />
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <SkeletonText lines={6} />
      </div>
    </div>
  );
}
