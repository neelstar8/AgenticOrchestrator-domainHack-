"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Dashboard error boundary.
 *
 * Shows what went wrong and offers a real retry. A ForbiddenError thrown by a
 * page guard surfaces here, so its message is rendered rather than hidden —
 * "the Reviewer role does not have reports:approve" is actionable.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isPermissionError = /permission|role does not have/i.test(error.message);

  return (
    <EmptyState
      icon={<TriangleAlert />}
      tone={isPermissionError ? "review" : "critical"}
      title={isPermissionError ? "You do not have access to this" : "This page could not load"}
      description={
        <>
          {error.message || "An unexpected error occurred."}
          {error.digest ? (
            <span className="mt-2 block font-mono text-[10px] opacity-70">
              Reference: {error.digest}
            </span>
          ) : null}
        </>
      }
      action={
        isPermissionError ? (
          <Button asChild variant="primary" size="sm">
            <Link href="/overview">Back to overview</Link>
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={reset}>
            <RotateCcw aria-hidden="true" />
            Try again
          </Button>
        )
      }
      secondaryAction={
        isPermissionError ? null : (
          <Button asChild variant="secondary" size="sm">
            <Link href="/overview">Back to overview</Link>
          </Button>
        )
      }
      className="mt-10"
    />
  );
}
