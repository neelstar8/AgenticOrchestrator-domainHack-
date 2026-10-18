"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Globe, Landmark, Loader2, Radar, Search } from "lucide-react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import type { DomainListItem, Paginated, ReportListItem, ScanListItem } from "@/lib/types/views";

/**
 * Global search (⌘K / Ctrl+K).
 *
 * Searches domains, scans and reports concurrently and groups the results.
 * Each result navigates to a real page, so a match is always one click from
 * its full record rather than a preview.
 */

interface SearchResults {
  domains: DomainListItem[];
  scans: ScanListItem[];
  reports: ReportListItem[];
}

const EMPTY: SearchResults = { domains: [], scans: [], reports: [] };

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<SearchResults>(EMPTY);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ⌘K / Ctrl+K opens the palette from anywhere.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    const query = term.trim();
    if (query.length < 2) {
      setResults(EMPTY);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const encoded = encodeURIComponent(query);
        const [domains, scans, reports] = await Promise.all([
          fetchJson<Paginated<DomainListItem>>(
            `/api/domains?search=${encoded}&pageSize=6`,
            controller.signal,
          ),
          fetchJson<Paginated<ScanListItem>>(
            `/api/scans?search=${encoded}&pageSize=4`,
            controller.signal,
          ),
          fetchJson<Paginated<ReportListItem>>(
            `/api/reports?search=${encoded}&pageSize=4`,
            controller.signal,
          ),
        ]);
        setResults({
          domains: domains?.items ?? [],
          scans: scans?.items ?? [],
          reports: reports?.items ?? [],
        });
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setError("Search failed. Check your connection and try again.");
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term]);

  const go = (href: string) => {
    setOpen(false);
    setTerm("");
    router.push(href);
  };

  const total = results.domains.length + results.scans.length + results.reports.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-8 items-center gap-2 rounded-md border border-border bg-surface-sunken",
          "px-2.5 text-xs text-foreground-subtle transition-colors hover:border-border-strong",
          "hover:text-foreground-muted focus-visible:outline-2 focus-visible:outline-offset-2",
          "focus-visible:outline-ring sm:w-64",
        )}
      >
        <Search className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden flex-1 text-left sm:inline">Search domains, scans, reports…</span>
        <kbd className="hidden shrink-0 rounded border border-border bg-surface px-1 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" className="top-[20%] translate-y-0">
          <DialogHeader>
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>
              Searches domain names, brands, page titles, scan references and report titles.
            </DialogDescription>
          </DialogHeader>
          <div className="border-b border-border px-5 py-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground-subtle"
                aria-hidden="true"
              />
              <Input
                autoFocus
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Type at least two characters…"
                className="pl-8"
                aria-label="Search query"
              />
              {loading ? (
                <Loader2
                  className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-foreground-subtle"
                  aria-hidden="true"
                />
              ) : null}
            </div>
          </div>

          <DialogBody className="max-h-[50dvh] py-2">
            {error ? (
              <p role="alert" className="px-1 py-6 text-center text-xs text-critical">
                {error}
              </p>
            ) : term.trim().length < 2 ? (
              <p className="px-1 py-8 text-center text-xs text-foreground-subtle">
                Start typing to search.
              </p>
            ) : total === 0 && !loading ? (
              <EmptyState
                icon={<Search />}
                title="No matches"
                description={`Nothing matched "${term.trim()}". Try a shorter term, or a partial domain name.`}
                className="border-0 bg-transparent py-8"
              />
            ) : (
              <div className="flex flex-col gap-4">
                <ResultGroup
                  label="Domains"
                  icon={<Globe />}
                  items={results.domains.map((domain) => ({
                    key: domain.id,
                    primary: domain.fqdn,
                    secondary: domain.seedPlatform?.name ?? domain.registrableDomain,
                    badge: domain.origin === "SIMULATED_DEMO" ? "Simulated" : null,
                    href: `/domains/${domain.id}`,
                  }))}
                  onSelect={go}
                />
                <ResultGroup
                  label="Scans"
                  icon={<Radar />}
                  items={results.scans.map((scan) => ({
                    key: scan.id,
                    primary: scan.reference,
                    secondary: `${scan.platformNameInput}${scan.seedDomain ? ` · ${scan.seedDomain}` : ""}`,
                    badge: scan.status.replace(/_/g, " ").toLowerCase(),
                    href: `/scans/${scan.id}`,
                  }))}
                  onSelect={go}
                />
                <ResultGroup
                  label="Reports"
                  icon={<FileText />}
                  items={results.reports.map((report) => ({
                    key: report.id,
                    primary: report.reference,
                    secondary: report.title,
                    badge: report.status.replace(/_/g, " ").toLowerCase(),
                    href: `/reports/${report.id}`,
                  }))}
                  onSelect={go}
                />
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResultGroup({
  label,
  icon,
  items,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  items: Array<{
    key: string;
    primary: string;
    secondary: string;
    badge: string | null;
    href: string;
  }>;
  onSelect: (href: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <h3 className="flex items-center gap-1.5 px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
        <span className="[&_svg]:size-3" aria-hidden="true">
          {icon}
        </span>
        {label}
      </h3>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onSelect(item.href)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                "hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
                "focus-visible:outline-ring",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-foreground">
                  {item.primary}
                </span>
                <span className="block truncate text-[11px] text-foreground-subtle">
                  {item.secondary}
                </span>
              </span>
              {item.badge ? (
                <Badge tone="muted" size="sm" className="shrink-0 capitalize">
                  {item.badge}
                </Badge>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  const response = await fetch(url, { signal, headers: { accept: "application/json" } });
  if (!response.ok) return null;
  const payload: unknown = await response.json();
  if (
    payload &&
    typeof payload === "object" &&
    "ok" in payload &&
    (payload as { ok: boolean }).ok
  ) {
    return (payload as unknown as { data: T }).data;
  }
  return null;
}

export { Landmark };
