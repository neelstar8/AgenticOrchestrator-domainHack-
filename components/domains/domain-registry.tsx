"use client";

import * as React from "react";
import Link from "next/link";
import {
  Columns3,
  Download,
  Filter,
  Globe,
  Loader2,
  RotateCcw,
  Search,
  X,
} from "lucide-react";

import { BulkReviewDialog } from "./bulk-review-dialog";
import {
  DataOriginBadge,
  DnsStatusValue,
  EvidenceCompletenessMeter,
  NotCheckedValue,
  PriorityBadge,
  ReviewStatusBadge,
} from "@/components/shared/badges";
import { RelativeTime } from "@/components/shared/relative-time";
import { Pagination } from "@/components/shared/pagination";
import { useDebouncedSearch, useTableState } from "@/components/shared/use-table-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { PRIORITIES, REVIEW_STATUSES } from "@/lib/types/enums";
import type { DomainListItem, Paginated } from "@/lib/types/views";
import {
  PRIORITY_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/utils/labels";
import { formatHttpStatus } from "@/lib/utils/format";

/**
 * Domain registry table.
 *
 * All filter, sort and page state lives in the URL, so a view is shareable and
 * survives a refresh. Fetching is client-side against /api/domains so filtering
 * feels immediate without a full page navigation.
 *
 * The columns deliberately render "Not checked" rather than a blank cell for
 * unchecked observations: an empty cell in a table of suspicious domains reads
 * as a negative finding, which would be wrong.
 */

export interface FilterOptions {
  platforms: Array<{ id: string; name: string; investigationId: string | null }>;
  discoverySources: Array<{ key: string; name: string; kind: string }>;
  suffixes: Array<{ suffix: string; count: number }>;
  reviewers: Array<{ id: string; name: string; role: string }>;
}

const ALL_COLUMNS = [
  { key: "platform", label: "Platform", defaultOn: true },
  { key: "sources", label: "Discovery sources", defaultOn: true },
  { key: "firstSeen", label: "First discovered", defaultOn: true },
  { key: "lastChecked", label: "Last checked", defaultOn: true },
  { key: "dns", label: "DNS", defaultOn: true },
  { key: "http", label: "HTTP", defaultOn: true },
  { key: "similarity", label: "Brand similarity", defaultOn: false },
  { key: "evidence", label: "Evidence", defaultOn: true },
  { key: "matches", label: "Source matches", defaultOn: false },
  { key: "reviewer", label: "Reviewer", defaultOn: false },
  { key: "status", label: "Review status", defaultOn: true },
  { key: "priority", label: "Priority", defaultOn: true },
] as const;

type ColumnKey = (typeof ALL_COLUMNS)[number]["key"];

export function DomainRegistry({
  options,
  canReview,
  canExport,
}: {
  options: FilterOptions;
  canReview: boolean;
  canExport: boolean;
}) {
  const table = useTableState();
  const [page, setPage] = React.useState<Paginated<DomainListItem> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [reloadToken, setReloadToken] = React.useState(0);

  const [visibleColumns, setVisibleColumns] = React.useState<Set<ColumnKey>>(
    () => new Set(ALL_COLUMNS.filter((column) => column.defaultOn).map((column) => column.key)),
  );

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
        const response = await fetch(`/api/domains?${queryString}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          setError(
            (payload as { error?: { message?: string } }).error?.message ??
              "The registry could not be loaded.",
          );
          setPage(null);
          return;
        }

        setPage((payload as { data: Paginated<DomainListItem> }).data);
        setError(null);
        // Drop selections for rows no longer on screen.
        setSelected(new Set());
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
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const someSelected = rows.some((row) => selected.has(row.id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  };

  const toggleRow = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const show = (column: ColumnKey) => visibleColumns.has(column);

  const reviewStatusFilter = table.getAll("reviewStatus");
  const priorityFilter = table.getAll("priority");

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground-subtle"
                aria-hidden="true"
              />
              <Input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search by domain, brand or page title…"
                className="pl-8"
                aria-label="Search domains"
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
              <MultiSelectFilter
                label="Review status"
                options={REVIEW_STATUSES.map((status) => ({
                  value: status,
                  label: REVIEW_STATUS_LABELS[status],
                }))}
                selected={reviewStatusFilter}
                onChange={(values) => table.set({ reviewStatus: values })}
              />
              <MultiSelectFilter
                label="Priority"
                options={PRIORITIES.map((priority) => ({
                  value: priority,
                  label: PRIORITY_LABELS[priority],
                }))}
                selected={priorityFilter}
                onChange={(values) => table.set({ priority: values })}
              />

              <SingleSelectFilter
                label="Platform"
                value={table.get("platformId")}
                options={options.platforms.map((platform) => ({
                  value: platform.id,
                  label: platform.name,
                }))}
                onChange={(value) => table.set({ platformId: value })}
              />
              <SingleSelectFilter
                label="Suffix"
                value={table.get("suffix")}
                options={options.suffixes.map((entry) => ({
                  value: entry.suffix,
                  label: `.${entry.suffix} (${entry.count})`,
                }))}
                onChange={(value) => table.set({ suffix: value })}
              />
              <SingleSelectFilter
                label="Source"
                value={table.get("discoverySourceKey")}
                options={options.discoverySources.map((source) => ({
                  value: source.key,
                  label: source.name,
                }))}
                onChange={(value) => table.set({ discoverySourceKey: value })}
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm">
                    <Columns3 aria-hidden="true" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                  {ALL_COLUMNS.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.key}
                      checked={visibleColumns.has(column.key)}
                      onCheckedChange={(checked) => {
                        setVisibleColumns((current) => {
                          const next = new Set(current);
                          if (checked) next.add(column.key);
                          else next.delete(column.key);
                          return next;
                        });
                      }}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {column.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Secondary filter row */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
              <span>Evidence ≥</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={table.get("minEvidenceCompleteness") ?? ""}
                onChange={(event) =>
                  table.set({ minEvidenceCompleteness: event.target.value || undefined })
                }
                className="h-7 w-16 text-xs"
                aria-label="Minimum evidence completeness"
              />
              <span>%</span>
            </label>

            <label className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
              <span>First seen from</span>
              <Input
                type="date"
                value={table.get("firstSeenFrom") ?? ""}
                onChange={(event) => table.set({ firstSeenFrom: event.target.value || undefined })}
                className="h-7 w-36 text-xs"
                aria-label="First seen from"
              />
            </label>

            <SingleSelectFilter
              label="Reviewer"
              value={table.get("assignedReviewerId")}
              options={options.reviewers.map((reviewer) => ({
                value: reviewer.id,
                label: reviewer.name,
              }))}
              onChange={(value) => table.set({ assignedReviewerId: value })}
            />

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
                Clear {table.activeFilterCount} filter
                {table.activeFilterCount === 1 ? "" : "s"}
              </Button>
            ) : null}

            <div className="ml-auto flex items-center gap-2">
              {table.isPending || loading ? (
                <Loader2
                  className="size-3.5 animate-spin text-foreground-subtle"
                  aria-hidden="true"
                />
              ) : null}
              {canExport ? (
                <Tooltip content="Exports the current filter selection as CSV, with a header stating how many rows are simulated.">
                  <Button asChild variant="secondary" size="sm">
                    <a href={`/api/domains/export?${queryString}`}>
                      <Download aria-hidden="true" />
                      Export CSV
                    </a>
                  </Button>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      {canReview && someSelected ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent-subtle/30 px-3 py-2.5">
          <span className="text-xs font-medium text-foreground">
            {selected.size} domain{selected.size === 1 ? "" : "s"} selected
          </span>
          <BulkReviewDialog
            domainIds={[...selected]}
            onDone={() => {
              setSelected(new Set());
              setReloadToken((token) => token + 1);
            }}
          />
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      ) : null}

      {/* Table */}
      {error ? (
        <EmptyState
          icon={<Globe />}
          tone="critical"
          title="The registry could not be loaded"
          description={error}
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
          }
        />
      ) : rows.length === 0 && !loading ? (
        <EmptyState
          icon={table.activeFilterCount > 0 ? <Filter /> : <Globe />}
          title={
            table.activeFilterCount > 0
              ? "No domains match these filters"
              : "The registry is empty"
          }
          description={
            table.activeFilterCount > 0
              ? "Nothing in the registry matches every filter you have applied. Try removing one."
              : "Run a discovery scan to populate the registry with candidate domains."
          }
          action={
            table.activeFilterCount > 0 ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  table.clearFilters();
                  setSearchValue("");
                }}
              >
                Clear all filters
              </Button>
            ) : null
          }
        />
      ) : (
        <TableWrapper className={cn(loading && "opacity-60 transition-opacity")}>
          <Table>
            <TableHeader>
              <TableRow>
                {canReview ? (
                  <TableHead className="w-9">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all rows on this page"
                    />
                  </TableHead>
                ) : null}
                <SortableHead
                  label="Domain"
                  columnKey="fqdn"
                  activeKey={table.sortBy}
                  direction={table.sortDirection}
                  onSort={table.toggleSort}
                />
                {show("platform") ? <TableHead>Platform</TableHead> : null}
                {show("sources") ? <TableHead>Discovery sources</TableHead> : null}
                {show("firstSeen") ? (
                  <SortableHead
                    label="First discovered"
                    columnKey="firstSeenAt"
                    activeKey={table.sortBy}
                    direction={table.sortDirection}
                    onSort={table.toggleSort}
                  />
                ) : null}
                {show("lastChecked") ? (
                  <SortableHead
                    label="Last checked"
                    columnKey="lastSeenAt"
                    activeKey={table.sortBy}
                    direction={table.sortDirection}
                    onSort={table.toggleSort}
                    hint="When a technical check last ran. 'Not checked' means none has."
                  />
                ) : null}
                {show("dns") ? <TableHead>DNS</TableHead> : null}
                {show("http") ? <TableHead>HTTP</TableHead> : null}
                {show("similarity") ? <TableHead>Brand similarity</TableHead> : null}
                {show("evidence") ? (
                  <SortableHead
                    label="Evidence"
                    columnKey="evidenceCompleteness"
                    activeKey={table.sortBy}
                    direction={table.sortDirection}
                    onSort={table.toggleSort}
                    hint="How complete the evidence picture is — not how suspicious the domain is."
                  />
                ) : null}
                {show("matches") ? <TableHead align="right">Matches</TableHead> : null}
                {show("reviewer") ? <TableHead>Reviewer</TableHead> : null}
                {show("status") ? (
                  <SortableHead
                    label="Review status"
                    columnKey="reviewStatus"
                    activeKey={table.sortBy}
                    direction={table.sortDirection}
                    onSort={table.toggleSort}
                  />
                ) : null}
                {show("priority") ? (
                  <SortableHead
                    label="Priority"
                    columnKey="priority"
                    activeKey={table.sortBy}
                    direction={table.sortDirection}
                    onSort={table.toggleSort}
                  />
                ) : null}
                <TableHead align="right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((domain) => (
                <TableRow key={domain.id} selected={selected.has(domain.id)}>
                  {canReview ? (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(domain.id)}
                        onCheckedChange={() => toggleRow(domain.id)}
                        aria-label={`Select ${domain.fqdn}`}
                      />
                    </TableCell>
                  ) : null}

                  <MonoCell>
                    <span className="flex items-center gap-1.5">
                      <Link
                        href={`/domains/${domain.id}`}
                        className="truncate transition-colors hover:text-accent hover:underline"
                      >
                        {domain.fqdn}
                      </Link>
                      {domain.origin === "SIMULATED_DEMO" ? (
                        <DataOriginBadge origin={domain.origin} compact />
                      ) : null}
                    </span>
                  </MonoCell>

                  {show("platform") ? (
                    <TableCell className="max-w-36 truncate">
                      {domain.seedPlatform?.name ?? "—"}
                    </TableCell>
                  ) : null}

                  {show("sources") ? (
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {domain.discoverySources.slice(0, 2).map((source) => (
                          <Badge key={source.id} tone="muted" size="sm">
                            {source.name}
                          </Badge>
                        ))}
                        {domain.discoverySources.length > 2 ? (
                          <Tooltip
                            content={domain.discoverySources
                              .slice(2)
                              .map((source) => source.name)
                              .join(", ")}
                          >
                            <Badge tone="muted" size="sm" className="cursor-help">
                              +{domain.discoverySources.length - 2}
                            </Badge>
                          </Tooltip>
                        ) : null}
                        {domain.discoverySources.length === 0 ? (
                          <span className="text-foreground-subtle">—</span>
                        ) : null}
                      </span>
                    </TableCell>
                  ) : null}

                  {show("firstSeen") ? (
                    <TableCell>
                      <RelativeTime value={domain.firstSeenAt} />
                    </TableCell>
                  ) : null}

                  {show("lastChecked") ? (
                    <TableCell>
                      <RelativeTime value={domain.lastCheckedAt} />
                    </TableCell>
                  ) : null}

                  {show("dns") ? (
                    <TableCell>
                      <DnsStatusValue status={domain.dnsStatus} />
                    </TableCell>
                  ) : null}

                  {show("http") ? (
                    <TableCell>
                      {domain.httpStatusCode === null ? (
                        <NotCheckedValue />
                      ) : (
                        <span className="font-mono text-[11px]">
                          {formatHttpStatus(domain.httpStatusCode)}
                        </span>
                      )}
                    </TableCell>
                  ) : null}

                  {show("similarity") ? (
                    <TableCell>
                      {domain.brandSimilarityScore === null ? (
                        <NotCheckedValue />
                      ) : (
                        <Tooltip
                          content={
                            domain.similarityRationale ??
                            "Lexical similarity to the investigated brand. A signal for triage only."
                          }
                        >
                          <span className="cursor-help font-mono text-[11px]">
                            {domain.brandSimilarityScore}
                          </span>
                        </Tooltip>
                      )}
                    </TableCell>
                  ) : null}

                  {show("evidence") ? (
                    <TableCell>
                      <EvidenceCompletenessMeter percent={domain.evidenceCompleteness} />
                    </TableCell>
                  ) : null}

                  {show("matches") ? (
                    <TableCell align="right">
                      {domain.regulatoryMatchCount > 0 ? (
                        <Badge tone="review" size="sm">
                          {domain.regulatoryMatchCount}
                        </Badge>
                      ) : (
                        <span className="text-foreground-subtle">0</span>
                      )}
                    </TableCell>
                  ) : null}

                  {show("reviewer") ? (
                    <TableCell className="max-w-32 truncate">
                      {domain.assignedReviewer?.name ?? "—"}
                    </TableCell>
                  ) : null}

                  {show("status") ? (
                    <TableCell>
                      <ReviewStatusBadge status={domain.reviewStatus} />
                    </TableCell>
                  ) : null}

                  {show("priority") ? (
                    <TableCell>
                      <PriorityBadge priority={domain.priority} />
                    </TableCell>
                  ) : null}

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

      {page && page.total > 0 ? (
        <Pagination
          page={page.page}
          pageSize={page.pageSize}
          total={page.total}
          pageCount={page.pageCount}
          onPageChange={table.setPage}
          onPageSizeChange={(size) => table.set({ pageSize: String(size) })}
          itemNoun="domain"
        />
      ) : null}
    </div>
  );
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={selected.length > 0 ? "outline" : "secondary"} size="sm">
          {label}
          {selected.length > 0 ? (
            <Badge tone="info" size="sm">
              {selected.length}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={(checked) => {
              onChange(
                checked
                  ? [...selected, option.value]
                  : selected.filter((value) => value !== option.value),
              );
            }}
            onSelect={(event) => event.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SingleSelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | undefined) => void;
}) {
  const ALL = "__all__";

  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? undefined : next)}
    >
      <SelectTrigger
        size="sm"
        className={cn("w-auto min-w-28 gap-1.5", value && "border-accent/50")}
        aria-label={label}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={ALL}>All {label.toLowerCase()}s</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
