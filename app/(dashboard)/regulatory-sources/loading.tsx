import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-3 w-full max-w-3xl" />
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-40 w-full rounded-lg" />
      ))}
    </div>
  );
}
