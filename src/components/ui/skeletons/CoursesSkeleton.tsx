import { Skeleton } from '../Skeleton';

/** Matches CoursesView — sidebar + 16:10 course cards. */
export function CoursesSkeleton() {
  return (
    <div
      className="relative flex h-full min-h-[inherit] flex-col bg-canvas md:flex-row"
      aria-busy="true"
      aria-label="Loading courses"
    >
      <aside className="z-10 flex max-h-[40%] w-full flex-col border-b border-line bg-surface md:max-h-none md:w-[20rem] md:shrink-0 md:border-b-0 md:border-r">
        <div className="shrink-0 space-y-3 border-b border-line px-4 py-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-full" />
            <Skeleton className="h-9 flex-1 rounded-full" />
          </div>
        </div>
        <div className="space-y-2 p-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </aside>
      <main className="min-h-0 flex-1 overflow-hidden p-4 md:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl bg-surface shadow-card">
              <Skeleton className="aspect-[16/10] w-full rounded-none" />
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-14" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
