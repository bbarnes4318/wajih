import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-3 backdrop-blur-md sm:px-5 xl:px-6">
        <Skeleton className="h-4 w-28" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    </>
  );
}
