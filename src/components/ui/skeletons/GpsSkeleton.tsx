import { Skeleton } from '../Skeleton';

/** Matches GolfView prep/GPS — map + bottom sheet chrome. */
export function GpsSkeleton() {
  return (
    <div
      className="absolute inset-0 flex min-h-0 flex-col bg-[var(--surface-0)]"
      aria-busy="true"
      aria-label="Loading round prep"
    >
      <Skeleton static className="min-h-0 flex-1 rounded-none" />
      <div className="border-t border-line bg-surface p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] md:absolute md:bottom-4 md:left-4 md:max-w-xs md:rounded-2xl md:border md:shadow-lift">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-3 w-full max-w-[16rem]" />
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-8 flex-1 rounded-lg" />
          <Skeleton className="h-8 flex-1 rounded-lg" />
        </div>
        <div className="mt-3 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
