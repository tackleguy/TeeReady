import { useLocation } from 'react-router-dom';
import { Skeleton } from './Skeleton';
import { CoursesSkeleton } from './skeletons/CoursesSkeleton';
import { GpsSkeleton } from './skeletons/GpsSkeleton';
import { StatsSkeleton } from './skeletons/StatsSkeleton';
import { TodaySkeleton } from './skeletons/TodaySkeleton';

function GenericFallback() {
  return (
    <div
      className="flex min-h-[40vh] flex-col gap-4 px-1 py-8"
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full max-w-md" />
      <Skeleton className="mt-2 h-40 w-full rounded-2xl" />
    </div>
  );
}

export function RouteFallback() {
  const { pathname } = useLocation();

  if (pathname === '/today') return <TodaySkeleton />;
  if (pathname.startsWith('/courses')) return <CoursesSkeleton />;
  if (pathname.startsWith('/rounds')) return <GpsSkeleton />;
  if (pathname === '/stats') return <StatsSkeleton />;

  return <GenericFallback />;
}
