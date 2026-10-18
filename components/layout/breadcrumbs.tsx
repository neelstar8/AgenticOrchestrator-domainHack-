"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { NAV_SECTIONS } from "@/lib/config/constants";

/**
 * Breadcrumbs derived from the pathname.
 *
 * The last crumb can be overridden with a real label — a domain's FQDN or a
 * scan reference reads far better than an opaque id.
 */
export function Breadcrumbs({ currentLabel }: { currentLabel?: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const sectionHref = `/${segments[0]}`;
  const section = NAV_SECTIONS.find((item) => item.href === sectionHref);
  const sectionLabel = section?.label ?? toTitle(segments[0] ?? "");

  const trail: Array<{ href: string; label: string }> = [
    { href: sectionHref, label: sectionLabel },
  ];

  if (segments.length > 1) {
    const rest = segments.slice(1);
    let href = sectionHref;
    rest.forEach((segment, index) => {
      href += `/${segment}`;
      const isLast = index === rest.length - 1;
      trail.push({
        href,
        label: isLast && currentLabel ? currentLabel : toTitle(decodeURIComponent(segment)),
      });
    });
  }

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-xs">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight
                  className="size-3 shrink-0 text-foreground-subtle"
                  aria-hidden="true"
                />
              ) : null}
              {isLast ? (
                <span
                  aria-current="page"
                  className="truncate font-medium text-foreground"
                  title={crumb.label}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate text-foreground-muted transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function toTitle(segment: string): string {
  // Leave ids and domain names alone; only prettify word-ish segments.
  if (segment.includes(".") || /^[a-z]{3}_[a-z0-9]{8,}$/i.test(segment)) return segment;
  return segment
    .split("-")
    .map((word) => (word.length <= 2 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}
