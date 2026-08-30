import { ChevronDown, Loader2, Plus, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useWorkingCourses } from '../../hooks/useWorkingCourses';
import type { GolfCourseSummary } from '../../lib/golf';
import { defaultSearchLoc } from '../../lib/searchLoc';
import { courseLabel } from './CourseSearchSelect';

type Props = {
  value: GolfCourseSummary[];
  onChange: (courses: GolfCourseSummary[]) => void;
  max?: number;
  initialQuery?: string;
};

export function CourseSearchMultiSelect({
  value,
  onChange,
  max = 8,
  initialQuery = '',
}: Props) {
  const loc = defaultSearchLoc();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | undefined>(undefined);
  const { courses, loading } = useWorkingCourses(loc.lat, loc.lon, query);
  const atMax = value.length >= max;

  useEffect(
    () => () => {
      if (blurTimer.current !== undefined) {
        window.clearTimeout(blurTimer.current);
      }
    },
    [],
  );

  const selectedIds = new Set(value.map((c) => c.id));

  const add = (c: GolfCourseSummary) => {
    if (selectedIds.has(c.id) || atMax) return;
    onChange([...value, c]);
    setQuery('');
    setOpen(false);
  };

  const remove = (id: string) => {
    onChange(value.filter((c) => c.id !== id));
  };

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <li key={c.id}>
              <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-canvas py-1 pl-2.5 pr-1 text-[12px] font-medium text-ink">
                <span className="truncate">{c.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => remove(c.id)}
                  className="rounded-full p-0.5 text-muted hover:bg-[var(--hover-fill)] hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <div
          className={[
            'flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5',
            open
              ? 'border-brand ring-1 ring-[color-mix(in_srgb,var(--brand)_25%,transparent)]'
              : '',
            atMax ? 'opacity-60' : '',
          ].join(' ')}
        >
          <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden="true" />
          <input
            type="search"
            disabled={atMax}
            value={query}
            placeholder={
              atMax
                ? `${max} courses selected`
                : 'Search and add courses…'
            }
            aria-label="Search and add golf courses"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (atMax) return;
              if (blurTimer.current !== undefined) {
                window.clearTimeout(blurTimer.current);
                blurTimer.current = undefined;
              }
              setOpen(true);
            }}
            onBlur={() => {
              blurTimer.current = window.setTimeout(() => setOpen(false), 150);
            }}
            className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed"
          />
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden="true" />
          )}
        </div>

        {open && !atMax ? (
          <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lift">
            {loading && courses.length === 0 ? (
              <div className="px-3 py-2.5 text-[13px] text-muted">Searching…</div>
            ) : courses.length === 0 ? (
              <div className="px-3 py-2.5 text-[13px] text-muted">
                {query.trim().length >= 2
                  ? `No courses match “${query.trim()}”.`
                  : 'No courses found nearby — try searching by name.'}
              </div>
            ) : (
              <ul className="max-h-56 overflow-y-auto py-1">
                {courses.map((c) => {
                  const picked = selectedIds.has(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={picked}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => add(c)}
                        className={[
                          'flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left',
                          picked
                            ? 'cursor-default opacity-50'
                            : 'hover:bg-[var(--hover-fill)]',
                        ].join(' ')}
                      >
                        <div className="min-w-0">
                          <span className="block text-[13px] font-semibold text-ink">
                            {c.name}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                            {c.region ? <span>{c.region}</span> : null}
                            {c.distanceMi != null ? (
                              <span>{c.distanceMi.toFixed(1)} mi</span>
                            ) : null}
                          </span>
                        </div>
                        {picked ? (
                          <span className="shrink-0 text-[11px] font-medium text-muted">
                            Added
                          </span>
                        ) : (
                          <Plus className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <p className="text-[11px] text-muted">
        {value.length}/{max} · {value.map(courseLabel).join(', ') || 'Pick where you usually play'}
      </p>
    </div>
  );
}
