import { ChevronDown, Loader2, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useWorkingCourses } from '../../hooks/useWorkingCourses';
import type { GolfCourseSummary } from '../../lib/golf';
import { defaultSearchLoc } from '../../lib/searchLoc';
import { venueKindLabel } from '../../lib/venueKind';

function courseLabel(c: GolfCourseSummary): string {
  return c.region ? `${c.name} · ${c.region}` : c.name;
}

type Props = {
  value: GolfCourseSummary | null;
  onChange: (course: GolfCourseSummary | null) => void;
  /** Pre-fill search when opened */
  initialQuery?: string;
  required?: boolean;
};

export function CourseSearchSelect({
  value,
  onChange,
  initialQuery = '',
  required,
}: Props) {
  const loc = defaultSearchLoc();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | undefined>(undefined);
  const { courses, loading } = useWorkingCourses(loc.lat, loc.lon, query);

  useEffect(
    () => () => {
      if (blurTimer.current !== undefined) {
        window.clearTimeout(blurTimer.current);
      }
    },
    [],
  );

  const display = value ? courseLabel(value) : '';

  const pick = (c: GolfCourseSummary) => {
    onChange(c);
    setQuery('');
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setQuery('');
  };

  return (
    <div className="relative">
      <div
        className={[
          'flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5',
          open ? 'border-brand ring-1 ring-[color-mix(in_srgb,var(--brand)_25%,transparent)]' : '',
        ].join(' ')}
      >
        <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden="true" />
        <input
          type="search"
          required={required && !value}
          value={open ? query : display}
          placeholder="Search playable courses…"
          aria-label="Search golf courses"
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onChange(null);
          }}
          onFocus={() => {
            if (blurTimer.current !== undefined) {
              window.clearTimeout(blurTimer.current);
              blurTimer.current = undefined;
            }
            setOpen(true);
            if (value) {
              setQuery(value.name);
              onChange(null);
            }
          }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 150);
          }}
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-brand"
        />
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden="true" />
        ) : value && !open ? (
          <button
            type="button"
            aria-label="Clear course"
            onClick={clear}
            className="shrink-0 text-muted hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden="true" />
        )}
      </div>

      {open ? (
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
            <ul className="max-h-64 overflow-y-auto py-1">
              {courses.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => pick(c)}
                    className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-[var(--hover-fill)]"
                  >
                    <span className="text-[13px] font-semibold text-ink">
                      {c.name}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                      {c.region ? <span>{c.region}</span> : null}
                      {c.distanceMi != null ? (
                        <span>{c.distanceMi.toFixed(1)} mi</span>
                      ) : null}
                      {c.access === 'public' ? (
                        <span className="text-brand">Public</span>
                      ) : null}
                      {c.access === 'private' ? (
                        <span>Private</span>
                      ) : null}
                      {venueKindLabel(c.kind) ? (
                        <span>{venueKindLabel(c.kind)}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

export { courseLabel };
