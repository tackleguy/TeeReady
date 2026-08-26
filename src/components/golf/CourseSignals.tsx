/** Course layout / access signals for discovery cards. */

import type { GolfCourseSummary } from '../../lib/golf';

type CourseType = GolfCourseSummary['courseType'];
type Access = GolfCourseSummary['access'];

export function courseTypeLabel(type?: CourseType): string | null {
  if (type === 'par3') return 'Par 3';
  if (type === 'executive') return 'Executive';
  if (type === 'regulation') return 'Full track';
  return null;
}

export function accessLabel(access?: Access): string | null {
  if (access === 'public') return 'Public';
  if (access === 'private') return 'Private';
  if (access === 'resort') return 'Resort';
  return null;
}

export function courseSignalLine(course: GolfCourseSummary): string {
  const parts = [
    courseTypeLabel(course.courseType),
    accessLabel(course.access),
  ].filter(Boolean) as string[];
  return parts.join(' · ');
}

/** Compact chips for course cards — layout / access, not pill soup. */
export function CourseSignals({
  course,
  variant = 'on-photo',
}: {
  course: GolfCourseSummary;
  variant?: 'on-photo' | 'inline';
}) {
  const line = courseSignalLine(course);
  if (!line) return null;

  if (variant === 'inline') {
    return <span className="text-[12px] font-medium text-muted">{line}</span>;
  }

  const chips = line.split(' · ');
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Course details">
      {chips.map((chip) => (
        <li
          key={chip}
          className="rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white/95 backdrop-blur-sm"
        >
          {chip}
        </li>
      ))}
    </ul>
  );
}
