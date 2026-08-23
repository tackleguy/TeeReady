import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Map as MapIcon,
} from 'lucide-react';
import { CourseSearchSelect } from '../components/golf/CourseSearchSelect';
import { GolfMap } from '../components/golf/GolfMap';
import { GolfMapBoundary } from '../components/golf/GolfMapBoundary';
import { useGolfCourses, useGolfHoles } from '../hooks/useGolf';
import type { GolfCourseSummary, TeeKind } from '../lib/golf';
import {
  applyTee,
  availableTeeKinds,
  holesOnLoop,
  loopNames,
  pickLoopForCourse,
  teeKindLabel,
} from '../lib/golfTees';
import {
  stashPendingCourse,
  takePendingCourse,
} from '../lib/pendingCourse';
import { defaultSearchLoc } from '../lib/searchLoc';

export function CourseMapView() {
  const navigate = useNavigate();
  const loc = defaultSearchLoc();
  const [course, setCourse] = useState<GolfCourseSummary | null>(null);
  const [activeHole, setActiveHole] = useState<number | null>(null);
  const [loop, setLoop] = useState<string | null>(null);
  const [teeKind, setTeeKind] = useState<TeeKind>('mid');
  const [mapReady, setMapReady] = useState(false);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const pending = takePendingCourse();
    if (pending) setCourse(pending);
    setBooted(true);
  }, []);

  const { courses, loading: coursesLoading } = useGolfCourses(
    loc.lat,
    loc.lon,
    '',
  );

  // Open the nearest course so the satellite map has hole geometry right away.
  useEffect(() => {
    if (!booted || course || coursesLoading || !courses.length) return;
    setCourse(courses[0]!);
  }, [booted, course, courses, coursesLoading]);

  const {
    holes,
    loading: holesLoading,
    error: holesError,
    retry: retryHoles,
  } = useGolfHoles(
    course?.lat ?? null,
    course?.lon ?? null,
    course
      ? {
          bbox: course.bbox,
          osmType: course.osmType,
          osmId: course.osmId,
          name: course.name,
        }
      : null,
  );

  const loops = useMemo(() => loopNames(holes), [holes]);
  const resolvedLoop =
    loop ??
    pickLoopForCourse(course?.name ?? '', loops) ??
    (loops.length ? loops[0]! : null);
  const loopHoles = useMemo(
    () => holesOnLoop(holes, resolvedLoop),
    [holes, resolvedLoop],
  );
  const playHoles = useMemo(
    () => loopHoles.map((h) => applyTee(h, teeKind)),
    [loopHoles, teeKind],
  );
  const teeKinds = useMemo(() => availableTeeKinds(loopHoles), [loopHoles]);

  useEffect(() => {
    const names = loopNames(holes);
    const next =
      pickLoopForCourse(course?.name ?? '', names) ?? names[0] ?? null;
    setLoop(next);
    setTeeKind('mid');
    setActiveHole(null);
  }, [holes, course?.id, course?.name]);

  const activeIdx = playHoles.findIndex((h) => h.number === activeHole);
  const activeHoleObj = activeIdx >= 0 ? playHoles[activeIdx]! : null;

  const pickCourse = useCallback((next: GolfCourseSummary | null) => {
    setCourse(next);
    setActiveHole(null);
    setLoop(null);
    setTeeKind('mid');
  }, []);

  const stepHole = useCallback(
    (dir: -1 | 1) => {
      if (!playHoles.length) return;
      if (activeIdx < 0) {
        setActiveHole(playHoles[0]!.number);
        return;
      }
      const next = playHoles[activeIdx + dir];
      if (next) setActiveHole(next.number);
    },
    [playHoles, activeIdx],
  );

  const openRounds = (mode: 'prep' | 'gps') => {
    if (!course) return;
    stashPendingCourse(course);
    navigate(`/rounds/${mode}`);
  };

  const mapLat = course?.lat ?? loc.lat;
  const mapLon = course?.lon ?? loc.lon;
  const showHoleHud = Boolean(course && playHoles.length > 0);
  const waitingOnGeometry = Boolean(course && holesLoading && !playHoles.length);

  return (
    <div className="relative h-full min-h-[inherit] bg-[#0a1210] text-white">
      <div className="absolute inset-0">
        <GolfMapBoundary
          fallback={
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <p className="text-[15px] font-semibold">Map unavailable</p>
                <p className="mt-1 text-[13px] text-white/60">
                  WebGL couldn&apos;t start on this device.
                </p>
              </div>
            </div>
          }
        >
          <GolfMap
            lat={mapLat}
            lon={mapLon}
            holes={playHoles}
            activeHole={activeHole}
            onSelectHole={setActiveHole}
            holeUp={Boolean(activeHole)}
            compactControls
            showWindLegend={false}
            fitPadding={{ top: 96, right: 28, bottom: 150, left: 28 }}
            onReady={() => setMapReady(true)}
            className="h-full w-full"
          />
        </GolfMapBoundary>

        {!mapReady || waitingOnGeometry ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/35">
            <Loader2 className="h-6 w-6 animate-spin text-white/85" />
            <p className="text-[13px] font-medium text-white/90">
              {!mapReady
                ? 'Starting satellite map…'
                : 'Loading hole geometry…'}
            </p>
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 md:p-4">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[color-mix(in_srgb,#0a1210_88%,transparent)] px-3 py-2.5 shadow-lift backdrop-blur-md">
            <MapIcon
              className="h-4 w-4 shrink-0 text-[#7dcea0]"
              strokeWidth={2}
            />
            <div className="min-w-0 flex-1">
              <CourseSearchSelect value={course} onChange={pickCourse} />
            </div>
            {course ? (
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => openRounds('prep')}
                  className="rounded-xl bg-[#1a5c3a] px-3 py-2 text-[12px] font-bold text-white hover:bg-[#227248]"
                >
                  Prep
                </button>
                <button
                  type="button"
                  onClick={() => openRounds('gps')}
                  className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[12px] font-bold text-white hover:bg-white/15"
                >
                  GPS
                </button>
              </div>
            ) : null}
          </div>

          {course && (loops.length > 1 || teeKinds.length > 1) ? (
            <div className="flex flex-wrap gap-2">
              {loops.length > 1
                ? loops.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setLoop(name)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                        resolvedLoop === name
                          ? 'bg-white text-[#0a1210]'
                          : 'border border-white/15 bg-black/40 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      {name}
                    </button>
                  ))
                : null}
              {teeKinds.length > 1
                ? teeKinds.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setTeeKind(kind)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                        teeKind === kind
                          ? 'bg-[#7dcea0] text-[#0a1210]'
                          : 'border border-white/15 bg-black/40 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      {teeKindLabel(kind)}
                    </button>
                  ))
                : null}
            </div>
          ) : null}

          {holesError && course ? (
            <div className="rounded-xl border border-red-400/30 bg-black/55 px-3 py-2 text-[12px] text-red-200">
              {holesError}{' '}
              <button
                type="button"
                onClick={retryHoles}
                className="font-semibold underline"
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {!course && mapReady && !coursesLoading ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 md:p-4">
          <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-white/10 bg-black/55 px-5 py-4 text-center backdrop-blur-md">
            <p className="text-[14px] font-semibold">Pick a course</p>
            <p className="mt-1 text-[13px] leading-relaxed text-white/70">
              Search above or{' '}
              <Link
                to="/courses"
                className="font-semibold text-[#7dcea0]"
              >
                browse nearby
              </Link>{' '}
              to overlay hole lines.
            </p>
          </div>
        </div>
      ) : null}

      {showHoleHud ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 md:p-4">
          <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[color-mix(in_srgb,#0a1210_90%,transparent)] px-3 py-3 shadow-lift backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold tracking-[-0.01em]">
                  {course!.name}
                </p>
                <p className="truncate text-[12px] text-white/55">
                  {activeHoleObj
                    ? `Hole ${activeHoleObj.number} · ${activeHoleObj.yards} yd · Par ${activeHoleObj.par}`
                    : `${playHoles.length} holes · tap a hole on the map`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous hole"
                  disabled={activeIdx <= 0}
                  onClick={() => stepHole(-1)}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-white/12 text-white/80 hover:bg-white/10 disabled:opacity-35"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next hole"
                  disabled={
                    activeIdx < 0 || activeIdx >= playHoles.length - 1
                  }
                  onClick={() => stepHole(1)}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-white/12 text-white/80 hover:bg-white/10 disabled:opacity-35"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {playHoles.map((h) => {
                const on = activeHole === h.number;
                return (
                  <button
                    key={h.number}
                    type="button"
                    onClick={() => setActiveHole(on ? null : h.number)}
                    className={`min-w-[2.5rem] shrink-0 rounded-lg px-2 py-2 text-center transition-colors ${
                      on
                        ? 'bg-[#7dcea0] text-[#0a1210]'
                        : 'bg-white/8 text-white/80 hover:bg-white/14'
                    }`}
                  >
                    <span className="block font-mono text-[13px] font-bold tabular">
                      {h.number}
                    </span>
                    <span className="block text-[9px] font-medium opacity-70">
                      {h.par}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
