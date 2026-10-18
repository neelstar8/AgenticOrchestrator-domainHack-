"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Radar, RotateCcw, Search, X } from "lucide-react";

import { DataOriginBadge, ScanStatusBadge } from "@/components/shared/badges";
import { Pagination } from "@/components/shared/pagination";
import { RelativeTime } from "@/components/shared/relative-time";
import { useDebouncedSearch, useTableState } from "@/components/shared/use-table-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  MonoCell,
  SortableHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import { SCAN_STATUSES } from "@/lib/types/enums";
import type { Paginated, ScanListItem } from "@/lib/types/views";
import { SCAN_PROFILE_LABELS, SCAN_STATUS_LABELS } from "@/lib/utils/labels";
import { formatDuration, formatNumber } from "@/lib/utils/format";

/**
 * Scan history.
 *
 * Shows every status including the ones that only exist transiently. While any
 * scan is running the table refreshes periodically so a reader watching it sees
 * the state change rather than a stale snapshot.
 */
export function ScanHistoryTable({ newScanAction }: { newScanAction?: React.ReactNode }) {
  const table = useTableState();
  const [page, setPage] = React.useState<Paginated<ScanListItem> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  const [searchValue, setSearchValue] = useDebouncedSearch(table.get("search") ?? "", (value) =>
    table.set({ search: value || undefined }),
  );

  const queryString = React.useMemo(() => {
    const params = new URLSearchParams(table.values);
    if (!params.has("pageSize")) params.set("pageSize", "25");
    return params.toString();
  }, [table.values]);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    (async () => {
      try {
        const response = await fetch(`/api/scans?${queryString}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          setError(
            (payload as { error?: { message?: string } }).error?.message ??
              "Scan history could not be loaded.",
          );
          setPage(null);
          return;
        }
        setPage((payload as { data: Paginated<ScanListItem> }).data);
        setError(null);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setError("Could not reach the server. Check that it is running and try again.");
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [queryString, reloadToken]);

  const rows = page?.items ?? [];
  const hasActive = rows.some((scan) => scan.status === "RUNNING" || scan.status === "QUEUED");

  // Keep the table honest while something is actually running.
  React.useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(() => setReloadToken((token) => token + 1), 2500);
    return () => clearInterval(interval);
  }, [hasActive]);

  const statusFilter = table.getAll("status");

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground-subtle"
              aria-hidden="true"
            />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search by scan reference, platform or seed domain…"
              className="pl-8"
              aria-label="Search scans"
            />
            {searchValue ? (
              <button
                type="button"
                onClick={() => setSearchValue("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-foreground-subtle hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant={statusFilter.length > 0 ? "outline" : "secondary"} size="sm">
                  Status
                  {statusFilter.length > 0 ? (
                    <Badge tone="info" size="sm">
                      {statusFilter.length}
                    </Badge>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Scan status</DropdownMenuLabel>
                {SCAN_STATUSES.map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={statusFilter.includes(status)}
                    onCheckedChange={(checked) =>
                      table.set({
                        status: checked
                          ? [...statusFilter, status]
                          : statusFilter.filter((value) => value !== status),
                      })
                    }
                    onSelect={(event) => event.preventDefault()}
                  >
                    {SCAN_STATUS_LABELS[status]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {table.activeFilterCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  table.clearFilters();
                  setSearchValue("");
                }}
              >
                <RotateCcw aria-hidden="true" />
                Clear filters
              </Button>
            ) : null}

            {loading || table.isPending ? (
              <Loader2 className="size-3.5 animate-spin text-foreground-subtle" aria-hidden="true" />
            ) : null}

            <div className="ml-auto">{newScanAction}</div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <EmptyState
          icon={<Radar />}
          tone="critical"
          title="Scan history could not be loaded"
          description={error}
          action={
            <Button variant="primary" size="sm" onClick={() => setReloadToken((t) => t + 1)}>
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
          }
        />
      ) : rows.length === 0 && !loading ? (
        <EmptyState
          icon={<Radar />}
          title={table.activeFilterCount > 0 ? "No scans match these filters" : "No scans yet"}
          description={
            table.activeFilterCount > 0
              ? "Nothing in the history matches every filter applied."
              : "Start a discovery scan to populate the registry. Queued and Running statuses are only visible while a scan is actually in flight."
          }
          action={
            table.activeFilterCount > 0 ? (
              <Button variant="primary" size="sm" onClick={() => table.clearFilters()}>
                Clear filters
              </Button>
            ) : (
              newScanAction
            )
          }
        />
      ) : (
        <TableWrapper className={cn(loading && "opacity-60 transition-opacity")}>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="Scan ID"
                  columnKey="reference"
                  activeKey={table.sortBy}
                  direction={table.sortDirection}
                  onSort={table.toggleSort}
                />
                <TableHead>Platform / seed domain</TableHead>
                <SortableHead
                  label="Created"
                  columnKey="queuedAt"
                  activeKey={table.sortBy}
                  direction={table.sortDirection}
                  onSort={table.toggleSort}
                />
                <TableHead>Initiated by</TableHead>
                <TableHead>Profile</TableHead>
                <SortableHead
                  label="Candidates"
                  columnKey="candidatesFound"
                  activeKey={table.sortBy}
                  direction={table.sortDirection}
                  onSort={table.toggleSort}
                  align="right"
                />
                <TableHead align="right">Need review</TableHead>
                <SortableHead
                  label="Duration"
                  columnKey="durationMs"
                  activeKey={table.sortBy}
                  direction={table.sortDirection}
                  onSort={table.toggleSort}
                  align="right"
                />
                <TableHead>Tasks</TableHead>
                <SortableHead
                  label="Status"
                  columnKey="status"
                  activeKey={table.sortBy}
                  direction={table.sortDirection}
                  onSort={table.toggleSort}
                />
                <TableHead align="right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((scan) => (
                <TableRow key={scan.id}>
                  <MonoCell>
                    <span className="flex items-center gap-1.5">
                      <Link
                        href={`/scans/${scan.id}`}
                        className="transition-colors hover:text-accent hover:underline"
                      >
                        {scan.reference}
                      </Link>
                      {scan.origin === "SIMULATED_DEMO" ? (
                        <DataOriginBadge origin={scan.origin} compact />
                      ) : null}
                    </span>
                  </MonoCell>

                  <TableCell className="max-w-48">
                    <span className="block truncate text-foreground">
                      {scan.platformNameInput}
                    </span>
                    {scan.seedDomain ? (
                      <span className="block truncate font-mono text-[10px] text-foreground-subtle">
                        {scan.seedDomain}
                      </span>
                    ) : null}
                  </TableCell>

                  <TableCell>
                    <RelativeTime value={scan.queuedAt} />
                  </TableCell>

                  <TableCell className="max-w-32 truncate">
                    {scan.initiatedBy?.name ?? "—"}
                  </TableCell>

                  <TableCell>
                    <Badge tone="muted" size="sm">
                      {SCAN_PROFILE_LABELS[scan.profile]}
                    </Badge>
                  </TableCell>

                  <TableCell align="right" className="font-mono text-foreground">
                    {formatNumber(scan.candidatesFound)}
                  </TableCell>

                  <TableCell align="right">
                    {scan.candidatesRequiringReview > 0 ? (
                      <Badge tone="review" size="sm">
                        {formatNumber(scan.candidatesRequiringReview)}
                      </Badge>
                    ) : (
                      <span className="text-foreground-subtle">0</span>
                    )}
                  </TableCell>

                  <TableCell align="right" className="font-mono">
                    {formatDuration(scan.durationMs)}
                  </TableCell>

                  <TableCell>
                    <Tooltip
                      content={`${scan.taskCounts.completed} completed, ${scan.taskCounts.failed} failed, ${scan.taskCounts.running} running, ${scan.taskCounts.pending} pending`}
                    >
                      <span className="cursor-help font-mono text-[11px]">
                        {scan.taskCounts.completed}/{scan.taskCounts.total}
                        {scan.taskCounts.failed > 0 ? (
                          <span className="text-critical"> ({scan.taskCounts.failed}✕)</span>
                        ) : null}
                      </span>
                    </Tooltip>
                  </TableCell>

                  <TableCell>
                    <ScanStatusBadge status={scan.status} />
                  </TableCell>

                  <TableCell align="right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/scans/${scan.id}`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      )}

      {page && page.total > 0 ? (
        <Pagination
          page={page.page}
          pageSize={page.pageSize}
          total={page.total}
          pageCount={page.pageCount}
          onPageChange={table.setPage}
          onPageSizeChange={(size) => table.set({ pageSize: String(size) })}
          itemNoun="scan"
        />
      ) : null}
    </div>
  );
}
