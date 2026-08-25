import { Skeleton } from '../Skeleton';

/** Matches TodayView layout — hero verdict, hourly block, coach card. */
export function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-6 md:gap-8" aria-busy="true" aria-label="Loading today">
      <header className="space-y-2">
        <Skeleton className="h-9 w-48 max-w-[70%]" />
        <Skeleton className="h-4 w-full max-w-md" />
      </header>

      <div className="surface-feature aspect-[4/3] min-h-[220px] sm:aspect-[16/9] sm:min-h-[240px]">
        <div className="relative flex h-full flex-col justify-end p-5 sm:p-6">
          <Skeleton className="mb-2 h-3 w-24 bg-white/20" />
          <Skeleton className="h-14 w-28 bg-white/25" />
          <Skeleton className="mt-3 h-4 w-56 max-w-full bg-white/20" />
          <Skeleton className="mt-4 h-11 w-36 rounded-full bg-white/25" />
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <div className="hour-table space-y-0 p-0">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="grid grid-cols-[4.5rem_1fr_3.5rem_5rem] items-center gap-2 border-b border-line px-3 py-3 last:border-0 sm:grid-cols-[5rem_1fr_4rem_5.5rem] sm:px-4"
            >
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-full max-w-[12rem]" />
              <Skeleton className="ml-auto h-4 w-8" />
              <Skeleton className="ml-auto h-5 w-12" />
            </div>
          ))}
        </div>
      </div>

      <div className="surface-card p-4 sm:p-5">
        <div className="flex gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      </div>
    </div>
  );
}
