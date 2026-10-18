"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * The graph is loaded client-side only.
 *
 * React Flow measures the DOM to lay out and fit the viewport, so rendering it
 * on the server produces a flash of a mis-sized canvas. Loading it on the
 * client with a matching skeleton avoids that.
 */
const RelationshipGraphExplorer = dynamic(
  () =>
    import("@/components/relationships/relationship-graph").then(
      (module) => module.RelationshipGraphExplorer,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="grid gap-3 xl:grid-cols-[1fr_22rem]">
          <Skeleton className="h-[clamp(24rem,65dvh,48rem)] w-full rounded-lg" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-56 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </div>
      </div>
    ),
  },
);

export function RelationshipsClient() {
  return <RelationshipGraphExplorer />;
}
