import { SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-6 w-40 animate-pulse-soft rounded bg-surface-hover" />
      <div className="h-3 w-full max-w-3xl animate-pulse-soft rounded bg-surface-hover" />
      <SkeletonTable rows={12} columns={10} />
    </div>
  );
}
