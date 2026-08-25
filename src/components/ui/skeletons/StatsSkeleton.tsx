import { Skeleton } from '../Skeleton';

/** Matches StatsView — stat grid + round list. */
export function StatsSkeleton() {
  return (
    <div
      className="mx-auto flex max-w-3xl flex-col gap-6"
      aria-busy="true"
      aria-label="Loading stats"
    >
      <header className="space-y-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="surface-card p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="surface-card overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-5 w-12 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
