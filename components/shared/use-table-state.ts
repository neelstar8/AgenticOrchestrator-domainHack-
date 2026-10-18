"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Table state synchronised to the URL query string.
 *
 * Keeping filters, sorting and pagination in the URL is what makes a deep link
 * to "all escalated .in domains awaiting review" shareable, and what makes the
 * browser's back button behave the way an investigator expects. It also means
 * a page refresh preserves exactly what was on screen.
 */

export interface TableState {
  values: Record<string, string>;
  get: (key: string) => string | undefined;
  getAll: (key: string) => string[];
  set: (updates: Record<string, string | string[] | undefined>) => void;
  setPage: (page: number) => void;
  toggleSort: (key: string) => void;
  clearFilters: (keep?: string[]) => void;
  sortBy: string | undefined;
  sortDirection: "asc" | "desc" | undefined;
  page: number;
  pageSize: number;
  /** True while a navigation triggered by a state change is in flight. */
  isPending: boolean;
  /** Number of active filters, excluding paging and sorting. */
  activeFilterCount: number;
}

const NON_FILTER_KEYS = new Set(["page", "pageSize", "sortBy", "sortDirection", "tab"]);

export function useTableState(defaults: { pageSize?: number } = {}): TableState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const values = React.useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      result[key] = value;
    }
    return result;
  }, [searchParams]);

  const navigate = React.useCallback(
    (next: URLSearchParams) => {
      const query = next.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  const set = React.useCallback(
    (updates: Record<string, string | string[] | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        next.delete(key);
        if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
          continue;
        }
        if (Array.isArray(value)) next.set(key, value.join(","));
        else next.set(key, value);
      }

      // Any change other than paging returns to page 1: staying on page 7 of a
      // freshly filtered result set would show an empty table.
      if (!("page" in updates)) next.delete("page");

      navigate(next);
    },
    [navigate, searchParams],
  );

  const setPage = React.useCallback(
    (page: number) => {
      const next = new URLSearchParams(searchParams.toString());
      if (page <= 1) next.delete("page");
      else next.set("page", String(page));
      navigate(next);
    },
    [navigate, searchParams],
  );

  /** Cycles a column: descending, then ascending, then unsorted. */
  const toggleSort = React.useCallback(
    (key: string) => {
      const currentKey = searchParams.get("sortBy");
      const currentDirection = searchParams.get("sortDirection");
      const next = new URLSearchParams(searchParams.toString());

      if (currentKey !== key) {
        next.set("sortBy", key);
        next.set("sortDirection", "desc");
      } else if (currentDirection === "desc") {
        next.set("sortDirection", "asc");
      } else {
        next.delete("sortBy");
        next.delete("sortDirection");
      }

      next.delete("page");
      navigate(next);
    },
    [navigate, searchParams],
  );

  const clearFilters = React.useCallback(
    (keep: string[] = []) => {
      const next = new URLSearchParams();
      for (const key of keep) {
        const value = searchParams.get(key);
        if (value) next.set(key, value);
      }
      navigate(next);
    },
    [navigate, searchParams],
  );

  const activeFilterCount = React.useMemo(
    () => Object.keys(values).filter((key) => !NON_FILTER_KEYS.has(key)).length,
    [values],
  );

  const direction = searchParams.get("sortDirection");

  return {
    values,
    get: (key: string) => searchParams.get(key) ?? undefined,
    getAll: (key: string) => {
      const raw = searchParams.get(key);
      return raw ? raw.split(",").filter(Boolean) : [];
    },
    set,
    setPage,
    toggleSort,
    clearFilters,
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortDirection: direction === "asc" || direction === "desc" ? direction : undefined,
    page: Math.max(1, Number(searchParams.get("page") ?? 1) || 1),
    pageSize: Number(searchParams.get("pageSize") ?? defaults.pageSize ?? 25) || 25,
    isPending,
    activeFilterCount,
  };
}

/**
 * Debounced search box state.
 *
 * Typing into a filter should not fire a request per keystroke, but the input
 * must stay responsive, so the visible value is local and the URL catches up.
 */
export function useDebouncedSearch(
  initial: string,
  onCommit: (value: string) => void,
  delayMs = 300,
): [string, (value: string) => void] {
  const [value, setValue] = React.useState(initial);
  const committed = React.useRef(initial);
  const onCommitRef = React.useRef(onCommit);

  React.useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  // Adopt an externally-driven change (back button, cleared filters).
  React.useEffect(() => {
    if (initial !== committed.current) {
      committed.current = initial;
      setValue(initial);
    }
  }, [initial]);

  React.useEffect(() => {
    if (value === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = value;
      onCommitRef.current(value);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return [value, setValue];
}
