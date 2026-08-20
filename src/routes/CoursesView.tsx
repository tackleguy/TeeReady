import { Link } from 'react-router-dom';
import { COURSES, scoreColor } from '../lib/mock';

export function CoursesView() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-ink">
          Courses near you
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          Play scores for this morning’s wind and firmness window.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {COURSES.map((course) => (
          <article
            key={course.slug}
            className="overflow-hidden rounded-card bg-surface shadow-card"
          >
            <div className="h-36 bg-[repeating-linear-gradient(135deg,#1d2a1c_0_14px,#243324_14px_28px)]" />
            <div className="flex items-start justify-between gap-3 p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[16px] font-bold text-ink">
                    {course.name}
                  </h2>
                  <span className="label shrink-0">{course.access}</span>
                </div>
                <p className="mt-1 text-[13px] text-muted">
                  {course.distanceMi} mi · {course.wind}
                </p>
                <Link
                  to="/rounds"
                  className="mt-3 inline-block text-[13px] font-semibold text-brand hover:underline"
                >
                  Open hole plan
                </Link>
              </div>
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-soft">
                <span
                  className="text-[18px] font-bold tabular"
                  style={{ color: scoreColor(course.playScore) }}
                >
                  {course.playScore}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
