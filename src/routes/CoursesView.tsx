import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Box,
  Loader2,
  MapPin,
  Search,
} from 'lucide-react';
import { CourseHeroImage } from '../components/golf/CourseHeroImage';
import { useGolfCourses } from '../hooks/useGolf';
import type { GolfCourseSummary } from '../lib/golf';
import {
  loadGreenMeshManifest,
  type GreenMeshManifestEntry,
} from '../lib/golfGreen3d';
import { stashPendingCourse } from '../lib/pendingCourse';
import { defaultSearchLoc } from '../lib/searchLoc';

type FilterMode = 'nearby' | '3d';

function haversineMi(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const A =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(A));
}

function manifestToSummary(
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

function CourseCard({
  course,
  has3d,
  onOpen,
  onPrep,
}: {
  course: GolfCourseSummary;
  has3d?: boolean;
  onOpen: (c: GolfCourseSummary) => void;
  onPrep: (c: GolfCourseSummary) => void;
}) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift">
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
            {has3d ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/90 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                <Box className="h-3 w-3" strokeWidth={2.5} />
                3D
              </span>
            ) : null}
          </div>
        </div>
      </button>

      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          {course.distanceMi != null ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
              {course.distanceMi.toFixed(1)} mi
            </span>
          ) : null}
          {course.holes != null ? <span>{course.holes} holes</span> : null}
        </div>
        <button
          type="button"
          onClick={() => onPrep(course)}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand"
        >
          Prep
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

export function CoursesView() {
  const navigate = useNavigate();
  const loc = defaultSearchLoc();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('nearby');
  const [green3dCourses, setGreen3dCourses] = useState<
    GreenMeshManifestEntry[]
  >([]);
  const [green3dLoading, setGreen3dLoading] = useState(true);

  const { courses, loading, error } = useGolfCourses(loc.lat, loc.lon, '');

  useEffect(() => {
    let cancelled = false;
    setGreen3dLoading(true);
    loadGreenMeshManifest().then((manifest) => {
      if (cancelled) return;
      setGreen3dCourses(manifest?.courses ?? []);
      setGreen3dLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const courseHas3d = (course: GolfCourseSummary) =>
    green3dCourses.some((entry) => {
      if (entry.name.toLowerCase() === course.name.toLowerCase()) return true;
      return haversineMi(course.lat, course.lon, entry.lat, entry.lon) < 0.85;
    });

  const filteredNearby = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = courses;
    if (filter === '3d') {
      list = list.filter(courseHas3d);
    }
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.region?.toLowerCase().includes(q) ?? false),
    );
  }, [courses, query, filter, green3dCourses]);

  const filteredGreen3d = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...green3dCourses].sort((a, b) => {
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

  const mainTitle =
    filter === '3d' ? '3D greens nearby' : `Near ${loc.name}`;

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
                Find a track, then prep or open the map.
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
            <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses…"
              className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-faint"
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>

          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={() => setFilter('nearby')}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                filter === 'nearby'
                  ? 'bg-brand text-white'
                  : 'bg-canvas text-muted hover:text-ink'
              }`}
            >
              Nearby
            </button>
            <button
              type="button"
              onClick={() => setFilter('3d')}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                filter === '3d'
                  ? 'bg-brand text-white'
                  : 'bg-canvas text-muted hover:text-ink'
              }`}
            >
              <Box className="h-3 w-3" strokeWidth={2.5} />
              3D greens
              {!green3dLoading ? (
                <span className="opacity-70">{green3dCourses.length}</span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filter === '3d' ? (
            green3dLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
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
                          openPrep(manifestToSummary(entry, loc))
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
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-brand" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <div className="px-4 py-5 text-[13px] leading-relaxed text-muted">
              <p>
                Browse nearby courses in the main view. Switch to{' '}
                <button
                  type="button"
                  onClick={() => setFilter('3d')}
                  className="font-semibold text-brand"
                >
                  3D greens
                </button>{' '}
                for the full mesh catalog.
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
                onOpen={openMap}
                onPrep={openPrep}
              />
            ))}
            {!loading && filteredNearby.length === 0 ? (
              <p className="col-span-full text-[14px] text-muted">
                No nearby courses with 3D greens — pick one from the list.
              </p>
            ) : null}
          </div>
        ) : loading && courses.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center gap-2 text-[14px] text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Finding courses…
          </div>
        ) : error && courses.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface px-5 py-8 text-center">
            <p className="text-[15px] font-medium text-ink">
              Couldn&apos;t load courses
            </p>
            <p className="mt-1 text-[13px] text-muted">{error}</p>
          </div>
        ) : filteredNearby.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface px-5 py-8 text-center">
            <p className="text-[15px] font-medium text-ink">
              {query.trim() ? 'No courses match' : 'No courses nearby'}
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredNearby.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                has3d={courseHas3d(course)}
                onOpen={openMap}
                onPrep={openPrep}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
