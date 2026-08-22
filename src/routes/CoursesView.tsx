import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { COURSES, scoreColor } from '../lib/mock';

const PHOTO_FALLBACK =
  'bg-[repeating-linear-gradient(135deg,#1d2a1c_0_14px,#243324_14px_28px)]';

export function CoursesView() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COURSES;
    return COURSES.filter(
      (course) =>
        course.name.toLowerCase().includes(q) ||
        course.access.toLowerCase().includes(q),
    );
  }, [query]);

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

      <label className="flex items-center gap-2 rounded-card border border-[var(--line-default)] bg-surface px-3 py-2.5 shadow-card">
        <Search
          className="h-4 w-4 shrink-0 text-muted"
          strokeWidth={2}
          aria-hidden
        />
        <span className="sr-only">Search courses</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or public / private…"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="rounded-card bg-surface px-5 py-8 text-center text-[14px] text-muted shadow-card">
          No courses match “{query.trim()}”.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((course) => (
            <article
              key={course.slug}
              className="overflow-hidden rounded-card bg-surface shadow-card"
            >
              <div className={`relative h-36 overflow-hidden ${PHOTO_FALLBACK}`}>
                {course.photo ? (
                  <img
                    src={course.photo}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : null}
              </div>
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
                    to="/rounds/prep"
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
      )}
    </div>
  );
}
