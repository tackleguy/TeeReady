import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Loader2, MapPin, Search } from 'lucide-react';
import { CourseHeroImage } from '../components/golf/CourseHeroImage';
import { CoursesLocatorMap } from '../components/golf/CoursesLocatorMap';
import { GolfMapBoundary } from '../components/golf/GolfMapBoundary';
import { useGolfCourses } from '../hooks/useGolf';
import type { GolfCourseSummary } from '../lib/golf';
import { stashPendingCourse } from '../lib/pendingCourse';
import { defaultSearchLoc } from '../lib/searchLoc';

function accessLabel(access: GolfCourseSummary['access']) {
  if (access === 'public') return 'Public';
  if (access === 'private') return 'Private';
  if (access === 'resort') return 'Resort';
  return null;
}

export function CourseMapView() {
  const navigate = useNavigate();
  const loc = defaultSearchLoc();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { courses, loading, error, retry } = useGolfCourses(
    loc.lat,
    loc.lon,
    query,
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length >= 2) return courses;
    return courses.filter((c) => c.name.toLowerCase().includes(q));
  }, [courses, query]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && filtered.some((c) => c.id === selectedId)) return;
    setSelectedId(filtered[0]!.id);
  }, [filtered, selectedId]);

  const selected =
    filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  const openPrep = (course: GolfCourseSummary) => {
    stashPendingCourse(course);
    navigate('/rounds/prep');
  };

  const openGps = (course: GolfCourseSummary) => {
    stashPendingCourse(course);
    navigate('/rounds/gps');
  };

  return (
    <div className="relative flex h-full min-h-[inherit] flex-col bg-canvas md:flex-row">
      {/* Directory list — Youth-on-Course style course finder */}
      <aside className="z-10 flex max-h-[42%] w-full flex-col border-b border-line bg-surface md:max-h-none md:w-[22rem] md:shrink-0 md:border-b-0 md:border-r lg:w-[26rem]">
        <div className="shrink-0 border-b border-line px-4 py-4">
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
            Course map
          </h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Courses near {loc.name} — pick one to prep or play.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses…"
              aria-label="Search courses"
              className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-brand"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && filtered.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Finding courses…
            </div>
          ) : error && filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] font-medium text-ink">
                Couldn&apos;t load courses
              </p>
              <p className="mt-1 text-[12px] text-muted">{error}</p>
              <button
                type="button"
                onClick={retry}
                className="mt-3 text-[13px] font-semibold text-brand"
              >
                Try again
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-muted">
              No courses match
              {query.trim() ? ` “${query.trim()}”` : ''}.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {filtered.map((c) => {
                const on = c.id === selected?.id;
                const access = accessLabel(c.access);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={`flex w-full gap-3 px-4 py-3 text-left transition-colors ${
                        on
                          ? 'bg-[color-mix(in_srgb,var(--brand)_8%,var(--surface))]'
                          : 'hover:bg-canvas'
                      }`}
                    >
                      <CourseHeroImage
                        seed={c.id || c.name}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-ink">
                          {c.name}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-muted">
                          {[
                            c.region,
                            c.holes != null ? `${c.holes} holes` : null,
                            c.par != null ? `Par ${c.par}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                          {c.distanceMi != null ? (
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" strokeWidth={2} />
                              {c.distanceMi.toFixed(1)} mi
                            </span>
                          ) : null}
                          {access ? (
                            <span className="rounded-full border border-line px-1.5 py-0.5 font-medium">
                              {access}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-line px-4 py-3 text-[12px] text-muted">
          <Link to="/courses" className="font-semibold text-brand">
            Browse as cards →
          </Link>
        </div>
      </aside>

      {/* Locator map */}
      <div className="relative min-h-0 flex-1">
        <GolfMapBoundary
          fallback={
            <div className="grid h-full place-items-center bg-canvas px-6 text-center">
              <p className="text-[14px] text-muted">
                Map couldn&apos;t start on this device.
              </p>
            </div>
          }
        >
          <CoursesLocatorMap
            lat={loc.lat}
            lon={loc.lon}
            courses={filtered}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onReady={() => setMapReady(true)}
            className="h-full w-full"
          />
        </GolfMapBoundary>

        {!mapReady ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-canvas/60">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : null}

        {selected ? (
          <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 md:inset-x-auto md:bottom-4 md:left-4 md:right-auto md:w-[22rem]">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-lift">
              <div className="flex gap-3 p-3">
                <CourseHeroImage
                  seed={selected.id || selected.name}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">
                    {selected.name}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-muted">
                    {[
                      selected.region,
                      selected.distanceMi != null
                        ? `${selected.distanceMi.toFixed(1)} mi`
                        : null,
                      selected.holes != null
                        ? `${selected.holes} holes`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openPrep(selected)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-brand px-3 py-2 text-[12px] font-bold text-white"
                    >
                      Prep
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openGps(selected)}
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-line px-3 py-2 text-[12px] font-bold text-ink hover:bg-canvas"
                    >
                      GPS
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
