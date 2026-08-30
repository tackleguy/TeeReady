import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Box,
  Loader2,
  MapPin,
  Navigation,
  Search,
} from 'lucide-react';
import { CourseHeroImage } from '../components/golf/CourseHeroImage';
import { CourseSignals } from '../components/golf/CourseSignals';
import { useWorkingCourses } from '../hooks/useWorkingCourses';
import type { GolfCourseSummary } from '../lib/golf';
import {
  loadGreenMeshManifest,
  type GreenMeshManifestEntry,
} from '../lib/golfGreen3d';
import { haversineMi } from '../lib/workingCourses';
import { loadGolfProfile } from '../lib/golfProfile';
import { stashPendingCourse } from '../lib/pendingCourse';
import { defaultSearchLoc } from '../lib/searchLoc';

type FilterMode = 'nearby' | 'mine' | '3d';

function greenEntryToSummary(
  entry: GreenMeshManifestEntry,
  from?: { lat: number; lon: number },
): GolfCourseSummary {
  return {
    id: `green3d:${entry.slug}`,
    osmType: 'node',
    osmId: 0,
    name: entry.name,
    lat: entry.lat,
    lon: entry.lon,
    holes: entry.holes,
    distanceMi:
      from != null
        ? Math.round(haversineMi(from.lat, from.lon, entry.lat, entry.lon) * 10) /
          10
        : undefined,
  };
}

function nameMatchesHome(courseName: string, homes: string[]): boolean {
  const n = courseName.toLowerCase();
  return homes.some((h) => {
    const home = h.toLowerCase().trim();
    if (!home) return false;
    return n.includes(home) || home.includes(n);
  });
}

function courseHas3dEntry(
  course: GolfCourseSummary,
  entries: GreenMeshManifestEntry[],
): boolean {
  return entries.some(
    (entry) =>
      entry.name.toLowerCase() === course.name.toLowerCase() ||
      haversineMi(course.lat, course.lon, entry.lat, entry.lon) < 0.85,
  );
}

function CourseCard({
  course,
  has3d,
  mapReady,
  onOpen,
  onPrep,
  onGps,
}: {
  course: GolfCourseSummary;
  has3d?: boolean;
  mapReady?: boolean;
  onOpen: (c: GolfCourseSummary) => void;
  onPrep: (c: GolfCourseSummary) => void;
  onGps: (c: GolfCourseSummary) => void;
}) {
  const [busy, setBusy] = useState<'prep' | 'gps' | null>(null);

  return (
    <article className="group overflow-hidden rounded-2xl bg-surface shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <button
        type="button"
        onClick={() => onOpen(course)}
        className="block w-full text-left"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-canvas">
          <CourseHeroImage
            seed={course.id || course.name}
            alt={`${course.name} golf course`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <div className="absolute left-3 top-3">
            <CourseSignals course={course} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-3 p-4">
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-white">
                {course.name}
              </h2>
              {course.region ? (
                <p className="mt-0.5 truncate text-[13px] text-white/80">
                  {course.region}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {mapReady ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/95 backdrop-blur-sm">
                  Map ready
                </span>
              ) : null}
              {has3d ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand/90 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                  <Box className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                  3D
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </button>

      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          {course.distanceMi != null ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              {course.distanceMi.toFixed(1)} mi
            </span>
          ) : null}
          {course.holes != null ? <span>{course.holes} holes</span> : null}
          {course.par != null ? <span>Par {course.par}</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setBusy('gps');
              onGps(course);
            }}
            disabled={busy != null}
            aria-busy={busy === 'gps'}
            className="inline-flex min-h-[44px] items-center gap-1 px-2 text-[13px] font-semibold text-muted hover:text-ink disabled:opacity-60"
          >
            {busy === 'gps' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <>
                <Navigation className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                GPS
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setBusy('prep');
              onPrep(course);
            }}
            disabled={busy != null}
            aria-busy={busy === 'prep'}
            className="inline-flex min-h-[44px] items-center gap-1 px-2 text-[13px] font-semibold text-brand disabled:opacity-60"
          >
            {busy === 'prep' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Opening…
              </>
            ) : (
              <>
                Prep
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

export function CoursesView() {
  const navigate = useNavigate();
  const loc = defaultSearchLoc();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('nearby');
  const [homeCourses, setHomeCourses] = useState<string[]>(() => {
    const p = loadGolfProfile();
    return p?.commonCourses?.filter(Boolean) ?? [];
  });
  const [green3dCourses, setGreen3dCourses] = useState<
    GreenMeshManifestEntry[]
  >([]);
  const [greenManifestLoading, setGreenManifestLoading] = useState(true);

  const {
    courses,
    loading,
    error,
    retry,
    workingCount,
  } = useWorkingCourses(loc.lat, loc.lon, query);

  useEffect(() => {
    const sync = () => {
      const p = loadGolfProfile();
      setHomeCourses(p?.commonCourses?.filter(Boolean) ?? []);
    };
    window.addEventListener('teeready-profile-changed', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('teeready-profile-changed', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setGreenManifestLoading(true);
    loadGreenMeshManifest().then((greenManifest) => {
      if (cancelled) return;
      setGreen3dCourses(greenManifest?.courses ?? []);
      setGreenManifestLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const manifestsLoading = loading || greenManifestLoading;

  const courseHas3d = (course: GolfCourseSummary) =>
    courseHas3dEntry(course, green3dCourses);

  const filteredNearby = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = courses.filter(
      (c) => c.holes == null || c.holes === 9 || c.holes === 18,
    );
    if (filter === '3d') {
      list = list.filter(courseHas3d);
    } else if (filter === 'mine') {
      list = list.filter((c) => nameMatchesHome(c.name, homeCourses));
    }
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.region?.toLowerCase().includes(q) ?? false),
    );
  }, [courses, query, filter, green3dCourses, homeCourses]);

  const filteredGreen3d = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...green3dCourses]
      .filter((c) => c.holes === 9 || c.holes === 18)
      .sort((a, b) => {
        const da = haversineMi(loc.lat, loc.lon, a.lat, a.lon);
        const db = haversineMi(loc.lat, loc.lon, b.lat, b.lon);
        return da - db;
      });
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [green3dCourses, query, loc.lat, loc.lon]);

  const openMap = (course: GolfCourseSummary) => {
    stashPendingCourse(course);
    navigate('/courses/map');
  };

  const openPrep = (course: GolfCourseSummary) => {
    stashPendingCourse(course);
    navigate('/rounds/prep');
  };

  const openGps = (course: GolfCourseSummary) => {
    stashPendingCourse(course);
    navigate('/rounds/gps');
  };

  const mainTitle =
    filter === '3d'
      ? '3D greens nearby'
      : filter === 'mine'
        ? 'Your courses nearby'
        : `Near ${loc.name}`;

  const filterBtn = (mode: FilterMode, label: ReactNode) => (
    <button
      type="button"
      onClick={() => setFilter(mode)}
      className={`rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${
        filter === mode
          ? 'bg-brand text-white'
          : 'bg-canvas text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="relative flex h-full min-h-[inherit] flex-col bg-canvas md:flex-row">
      <aside className="z-10 flex max-h-[40%] w-full flex-col border-b border-line bg-surface md:max-h-none md:w-[20rem] md:shrink-0 md:border-b-0 md:border-r lg:w-[22rem]">
        <div className="shrink-0 border-b border-line px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
                Courses
              </h1>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                Find a track, then prep or start GPS.
              </p>
            </div>
            <Link
              to="/courses/map"
              className="shrink-0 pt-1 text-[12px] font-semibold text-brand"
            >
              Map
            </Link>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses…"
              aria-label="Search courses"
              className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-brand"
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {filterBtn('nearby', 'Nearby')}
            {homeCourses.length > 0
              ? filterBtn('mine', `Mine (${homeCourses.length})`)
              : null}
            {filterBtn(
              '3d',
              <span className="inline-flex items-center gap-1">
                <Box className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                3D
                {!manifestsLoading ? (
                  <span className="opacity-70">{green3dCourses.length}</span>
                ) : null}
              </span>,
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filter === '3d' ? (
            manifestsLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading…
              </div>
            ) : filteredGreen3d.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted">
                No 3D courses match.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {filteredGreen3d.map((entry) => {
                  const mi = haversineMi(loc.lat, loc.lon, entry.lat, entry.lon);
                  return (
                    <li key={entry.slug}>
                      <button
                        type="button"
                        onClick={() =>
                          openPrep(greenEntryToSummary(entry, loc))
                        }
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-ink">
                            {entry.name}
                          </p>
                          <p className="mt-0.5 text-[12px] text-muted">
                            {entry.holes} greens
                            {Number.isFinite(mi)
                              ? ` · ${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`
                              : ''}
                          </p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : filter === 'mine' ? (
            <div className="px-4 py-5 text-[13px] leading-relaxed text-muted">
              <p className="font-medium text-ink">Home courses</p>
              <ul className="mt-2 space-y-1.5">
                {homeCourses.map((name) => (
                  <li key={name} className="text-muted">
                    {name}
                  </li>
                ))}
              </ul>
              <p className="mt-3">
                Matching nearby results appear in the main view. Edit the list in{' '}
                <Link to="/profile" className="font-semibold text-brand">
                  Golfer info
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="px-4 py-5 text-[13px] leading-relaxed text-muted">
              <p>
                {manifestsLoading
                  ? 'Loading backed-up courses…'
                  : `${workingCount.toLocaleString()} playable courses with offline hole lines.`}{' '}
                Cards marked{' '}
                <span className="font-semibold text-ink">Map ready</span> have
                local hole geometry; <span className="font-semibold text-ink">3D</span>{' '}
                means a local green mesh pack. Prep is the default path; GPS
                starts a live round.
              </p>
            </div>
          )}
        </div>
      </aside>

      <section className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
        <header className="mb-5 max-w-xl">
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink md:text-[24px]">
            {mainTitle}
          </h2>
        </header>

        {filter === '3d' ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredNearby.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                has3d
                mapReady
                onOpen={openMap}
                onPrep={openPrep}
                onGps={openGps}
              />
            ))}
            {!loading && filteredNearby.length === 0 ? (
              <p className="col-span-full text-[14px] text-muted">
                No nearby courses with 3D greens — pick one from the list.
              </p>
            ) : null}
          </div>
        ) : (loading && courses.length === 0) || manifestsLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl bg-surface shadow-card"
              >
                <div className="skeleton aspect-[16/10] w-full rounded-none" />
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="skeleton h-4 w-24" />
                  <div className="skeleton h-4 w-14" />
                </div>
              </div>
            ))}
          </div>
        ) : error && courses.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface px-5 py-8 text-center">
            <p className="text-[15px] font-medium text-ink">
              Couldn&apos;t load courses
            </p>
            <p className="mt-1 text-[13px] text-muted">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="btn-primary mt-4 inline-flex"
            >
              Retry
            </button>
          </div>
        ) : filteredNearby.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface px-5 py-8 text-center">
            <p className="text-[15px] font-medium text-ink">
              {query.trim()
                ? 'No backed-up courses match'
                : filter === 'mine'
                  ? 'No backed-up home courses nearby'
                  : 'No backed-up courses nearby'}
            </p>
            {filter === 'mine' ? (
              <p className="mt-2 text-[13px] text-muted">
                Names come from your profile. Try Nearby, or update{' '}
                <Link to="/profile" className="font-semibold text-brand">
                  Golfer info
                </Link>
                .
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredNearby.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                has3d={courseHas3d(course)}
                mapReady
                onOpen={openMap}
                onPrep={openPrep}
                onGps={openGps}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
