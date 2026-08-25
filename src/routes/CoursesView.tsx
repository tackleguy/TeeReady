import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Box,
  Loader2,
  Map as MapIcon,
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

function accessLabel(access: GolfCourseSummary['access']) {
  if (access === 'public') return 'Public';
  if (access === 'private') return 'Private';
  if (access === 'resort') return 'Resort';
  return null;
}

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
  onMap,
  onPrep,
}: {
  course: GolfCourseSummary;
  has3d?: boolean;
  onMap: (c: GolfCourseSummary) => void;
  onPrep: (c: GolfCourseSummary) => void;
}) {
  const access = accessLabel(course.access);
  const photoSeed = course.id || course.name;

  return (
    <article className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <button
        type="button"
        onClick={() => onMap(course)}
        className="block w-full text-left"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-canvas">
          <CourseHeroImage
            seed={photoSeed}
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
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {has3d ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand/90 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                  <Box className="h-3 w-3" strokeWidth={2.5} />
                  3D greens
                </span>
              ) : null}
              {access ? (
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                  {access}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </button>

      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          {course.distanceMi != null ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
              {course.distanceMi.toFixed(1)} mi
            </span>
          ) : null}
          {course.holes != null ? <span>{course.holes} holes</span> : null}
          {course.par != null ? <span>Par {course.par}</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => onMap(course)}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-ink"
          >
            <MapIcon className="h-3.5 w-3.5" strokeWidth={2} />
            Map
          </button>
          <button
            type="button"
            onClick={() => onPrep(course)}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand"
          >
            Prep
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
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
  const [green3dQuery, setGreen3dQuery] = useState('');
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

  const green3dSlugsByName = useMemo(() => {
    const byKey = new Map<string, GreenMeshManifestEntry>();
    for (const entry of green3dCourses) {
      byKey.set(entry.name.toLowerCase(), entry);
      byKey.set(entry.slug, entry);
    }
    return byKey;
  }, [green3dCourses]);

  const courseHas3d = (course: GolfCourseSummary) => {
    if (green3dSlugsByName.has(course.name.toLowerCase())) return true;
    return green3dCourses.some((entry) => {
      const d = haversineMi(course.lat, course.lon, entry.lat, entry.lon);
      return d < 0.85;
    });
  };

  const filteredNearby = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.region?.toLowerCase().includes(q) ?? false),
    );
  }, [courses, query]);

  const filteredGreen3d = useMemo(() => {
    const q = green3dQuery.trim().toLowerCase();
    const list = [...green3dCourses].sort((a, b) => {
      const da = haversineMi(loc.lat, loc.lon, a.lat, a.lon);
      const db = haversineMi(loc.lat, loc.lon, b.lat, b.lon);
      return da - db;
    });
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [green3dCourses, green3dQuery, loc.lat, loc.lon]);

  const openMap = (course: GolfCourseSummary) => {
    stashPendingCourse(course);
    navigate('/courses/map');
  };

  const openPrep = (course: GolfCourseSummary) => {
    stashPendingCourse(course);
    navigate('/rounds/prep');
  };

  const openGreen3d = (entry: GreenMeshManifestEntry) => {
    openPrep(manifestToSummary(entry, loc));
  };

  return (
    <div className="flex flex-col gap-10">
      <header className="max-w-xl">
        <p className="text-[13px] font-medium text-brand">Near {loc.name}</p>
        <h1 className="mt-1 text-[32px] font-bold tracking-[-0.04em] text-ink">
          Courses
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Public and private tracks around you — open the satellite map or
          jump into prep.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card">
          <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nearby courses…"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint sm:text-[14px]"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
      </header>

      {loading && courses.length === 0 ? (
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
          <p className="mt-1 text-[13px] text-muted">
            {query.trim()
              ? 'Try a different search, or browse 3D greens below.'
              : 'Try changing your city in Settings, or search from Map / Rounds.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredNearby.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              has3d={courseHas3d(course)}
              onMap={openMap}
              onPrep={openPrep}
            />
          ))}
        </div>
      )}

      <section className="flex flex-col gap-4">
        <div className="max-w-xl">
          <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand">
            <Box className="h-3.5 w-3.5" strokeWidth={2.5} />
            3D greens
          </p>
          <h2 className="mt-1 text-[24px] font-bold tracking-[-0.03em] text-ink">
            Courses with green meshes
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
            {green3dLoading
              ? 'Loading mesh catalog…'
              : `${green3dCourses.length} courses with free OSM + USGS 3D greens — sorted nearest first.`}
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card">
            <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
            <input
              type="search"
              value={green3dQuery}
              onChange={(e) => setGreen3dQuery(e.target.value)}
              placeholder="Search 3D green courses…"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint sm:text-[14px]"
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>
        </div>

        {green3dLoading ? (
          <div className="flex items-center gap-2 py-6 text-[13px] text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : filteredGreen3d.length === 0 ? (
          <p className="py-4 text-[14px] text-muted">
            No 3D green courses match that search.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {filteredGreen3d.map((entry) => {
              const mi = haversineMi(loc.lat, loc.lon, entry.lat, entry.lon);
              return (
                <li key={entry.slug}>
                  <button
                    type="button"
                    onClick={() => openGreen3d(entry)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-canvas"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
                        {entry.name}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {entry.holes} greens
                        {Number.isFinite(mi)
                          ? ` · ${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`
                          : ''}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-brand">
                      Prep
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
