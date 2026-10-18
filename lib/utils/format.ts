/**
 * Display formatting helpers, safe on both server and client.
 *
 * Everything here renders a stable, locale-independent string so the server and
 * the client produce identical markup (no hydration mismatch) and so CSV/PDF
 * exports match what the UI shows.
 */

import { NOT_CHECKED_LABEL } from "./labels";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  hour12: false,
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

/** "17 Oct 2026, 14:32 UTC" — fixed to UTC so SSR and CSR agree. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return NOT_CHECKED_LABEL;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return `${DATE_TIME_FORMATTER.format(date)} UTC`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return NOT_CHECKED_LABEL;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return DATE_FORMATTER.format(date);
}

/** ISO date portion only, for chart axes and CSV columns. */
export function toDateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

/**
 * Relative time against an explicit reference point.
 *
 * The caller must pass `now` so a Server Component and the client agree. The
 * <RelativeTime> component supplies it from a mount-time effect.
 */
export function formatRelativeTime(value: string | null | undefined, now: number): string {
  if (!value) return NOT_CHECKED_LABEL;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "Invalid date";

  const deltaSeconds = Math.round((now - then) / 1000);
  const future = deltaSeconds < 0;
  const abs = Math.abs(deltaSeconds);

  const describe = (amount: number, unit: string) => {
    const plural = amount === 1 ? unit : `${unit}s`;
    return future ? `in ${amount} ${plural}` : `${amount} ${plural} ago`;
  };

  if (abs < 45) return future ? "in a moment" : "just now";
  if (abs < 90) return describe(1, "minute");
  if (abs < 3600) return describe(Math.round(abs / 60), "minute");
  if (abs < 86_400) return describe(Math.round(abs / 3600), "hour");
  if (abs < 2_592_000) return describe(Math.round(abs / 86_400), "day");
  if (abs < 31_536_000) return describe(Math.round(abs / 2_592_000), "month");
  return describe(Math.round(abs / 31_536_000), "year");
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return NOT_CHECKED_LABEL;
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined) return NOT_CHECKED_LABEL;
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return NOT_CHECKED_LABEL;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

/** Turns SCREAMING_SNAKE_CASE into "Screaming snake case" as a last resort. */
export function humanizeEnum(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/** Renders a value that may legitimately be "not checked". */
export function orNotChecked(
  value: string | number | null | undefined,
  render: (v: string | number) => string = String,
): string {
  if (value === null || value === undefined || value === "") return NOT_CHECKED_LABEL;
  return render(value);
}

/**
 * Formats an HTTP status code for display without implying a verdict.
 * A 404 means "the server said 404", not "this site is fake".
 */
export function formatHttpStatus(code: number | null | undefined): string {
  if (code === null || code === undefined) return NOT_CHECKED_LABEL;
  const descriptions: Record<number, string> = {
    200: "OK",
    201: "Created",
    204: "No content",
    301: "Moved permanently",
    302: "Found",
    303: "See other",
    307: "Temporary redirect",
    308: "Permanent redirect",
    400: "Bad request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not found",
    410: "Gone",
    429: "Too many requests",
    451: "Unavailable for legal reasons",
    500: "Internal server error",
    502: "Bad gateway",
    503: "Service unavailable",
    504: "Gateway timeout",
  };
  const description = descriptions[code];
  return description ? `${code} ${description}` : String(code);
}
