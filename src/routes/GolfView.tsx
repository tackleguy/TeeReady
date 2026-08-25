// Golf: OSM courses + satellite map + multi-model hole wind briefs.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Compass,
  Flag,
  Loader2,
  MapPin,
  Mountain,
  Navigation,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  CloudSun,
  X,
} from 'lucide-react';
import { GolfMap } from '../components/golf/GolfMap';
import { CourseHeroImage } from '../components/golf/CourseHeroImage';
import { GolfMapBoundary } from '../components/golf/GolfMapBoundary';
import { GolfHoleIntel } from '../components/golf/GolfHoleIntel';
import { GolfSetup } from '../components/golf/GolfSetup';
import { GolfScorecard } from '../components/golf/GolfScorecard';
import { GolfTargetHud } from '../components/golf/GolfTargetHud';
import { GolfYardageBook } from '../components/golf/GolfYardageBook';
import { GpsMod } from '../components/golf/GpsMod';
import { GlassPanel } from '../components/ui/GlassPanel';
import { DraggableBox } from '../components/ui/DraggableBox';
import { SearchBar } from '../components/radar/SearchBar';
import { defaultSearchLoc } from '../lib/searchLoc';
import { takePendingCourse } from '../lib/pendingCourse';
import {
  peekSatelliteTilesWarm,
  warmSatelliteTiles,
} from '../lib/golfSatelliteCache';
import {
  loadYardageNotes,
  saveYardageNotesFromPrep,
} from '../lib/yardageNotes';
import { useIsMobile } from '../hooks/useMediaQuery';
import { bearingCompass, bearingDeg } from '../lib/geo';
import { formatHandicap } from '../lib/golfHandicap';
import {
  useGolfCourses,
  useGolfEnsemble,
  useGolfHoles,
  useGolfNotebook,
} from '../hooks/useGolf';
import type { GolfCourseSummary, HoleBrief, TeeKind } from '../lib/golf';
import { DEFAULT_TURF } from '../lib/golf';
import {
  bagArcClubs,
  defaultTarget,
  distancesToGreen,
  greenMarks,
  haversineYards,
  metersToFeet,
  segmentPlaysLike,
} from '../lib/golfMeasure';
import { playLinesGeoJSON, predictHole } from '../lib/golfPredict';
import {
  bagFromStocks,
  DEFAULT_PROFILE,
  loadGolfProfile,
  type GolfPlayerProfile,
} from '../lib/golfProfile';
import { weatherAppHref } from '../lib/golfApp';
import { warmGolfCatalog } from '../lib/golfCatalogPrefetch';
import {
  courseHasGreenMeshes,
  loadGreenMeshCourse,
  resolveGreenMeshSlug,
  type GreenMeshCourse,
} from '../lib/golfGreen3d';
import { Green3DViewer } from '../components/golf/Green3DViewer';
import type { LonLat } from '../lib/golfWind';
import {
  applyTee,
  availableTeeKinds,
  holesOnLoop,
  loopNames,
  pickLoopForCourse,
  pickTee,
  teeKindLabel,
  teesOnHole,
} from '../lib/golfTees';
import { finishAndArchiveRound } from '../lib/roundHistory';
import {
  type TrackedRound,
  addShot,
  clearRound,
  loadRound,
  newRound,
  saveRound,
  shotsForHole,
  undoLastShot,
  bestClubForDistance,
} from '../lib/golfTracker';
import { useGpsWatch } from '../hooks/useGpsWatch';

interface Loc {
  name: string;
  lat: number;
  lon: number;
}

function defaultLoc(): Loc {
  return defaultSearchLoc();
}

function aspectLabel(aspect: string): string {
  switch (aspect) {
    case 'head':
      return 'Headwind';
    case 'tail':
      return 'Tailwind';
    case 'cross-L':
      return 'Cross ←';
    case 'cross-R':
      return 'Cross →';
    case 'quarter-head':
      return '¼ Head';
    case 'quarter-tail':
      return '¼ Tail';
    default:
      return aspect;
  }
}

const MOBILE_FIT_PADDING = { top: 88, right: 28, bottom: 196, left: 28 };

function ChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div className="px-3 pb-2">
      <div className="mb-1 section-eyebrow">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const on = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className="chip-button"
              data-active={on}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function GolfView({ active = true }: { active?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [profile, setProfile] = useState<GolfPlayerProfile>(
    () => loadGolfProfile() ?? DEFAULT_PROFILE,
  );
  const [setupOpen, setSetupOpen] = useState(false);
  const [loc, setLoc] = useState<Loc>(defaultLoc);
  const [course, setCourse] = useState<GolfCourseSummary | null>(null);
  const [activeHole, setActiveHole] = useState<number | null>(null);
  const [loop, setLoop] = useState<string | null>(null);
  const [teeKind, setTeeKind] = useState<TeeKind>('mid');
  const [hour, setHour] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [courseFilter, setCourseFilter] = useState('');
  const [holeUp, setHoleUp] = useState(true);
  const [greens3d, setGreens3d] = useState(false);
  const [greenMeshCourse, setGreenMeshCourse] =
    useState<GreenMeshCourse | null>(null);
  const [canGreens3d, setCanGreens3d] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [target, setTarget] = useState<LonLat | null>(null);
  const [planningMode, setPlanningMode] = useState<'tee' | 'approach'>('tee');
  const [bookOpen, setBookOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Prep / GPS from URL when on /rounds; keep last mode while backgrounded.
  const pathMode: 'prep' | 'gps' | null = location.pathname.includes(
    '/rounds/gps',
  )
    ? 'gps'
    : location.pathname.includes('/rounds/prep')
      ? 'prep'
      : null;
  const [lastMode, setLastMode] = useState<'prep' | 'gps'>('prep');
  useEffect(() => {
    if (pathMode) setLastMode(pathMode);
  }, [pathMode]);
  const viewMode: 'prep' | 'gps' = pathMode ?? lastMode;

  useEffect(() => {
    warmGolfCatalog();
  }, []);

  useEffect(() => {
    if (!active) return;
    if (
      location.pathname === '/rounds' ||
      (location.pathname.startsWith('/rounds/') &&
        pathMode == null &&
        location.pathname !== '/rounds/prep' &&
        location.pathname !== '/rounds/gps')
    ) {
      navigate('/rounds/prep', { replace: true });
    }
  }, [active, location.pathname, pathMode, navigate]);

  const [round, setRound] = useState<TrackedRound | null>(() => loadRound());
  const [scorecardOpen, setScorecardOpen] = useState(false);
  const [gpsHudOpen, setGpsHudOpen] = useState(true);
  const [intelPanelOpen, setIntelPanelOpen] = useState(false);

  // Keep player HCP in sync when Settings (or another tab) saves.
  useEffect(() => {
    const syncProfile = () => {
      const next = loadGolfProfile();
      if (next) setProfile(next);
    };
    const onCustom = () => syncProfile();
    window.addEventListener('teeready-profile-changed', onCustom);
    window.addEventListener('storage', syncProfile);
    window.addEventListener('focus', syncProfile);
    return () => {
      window.removeEventListener('teeready-profile-changed', onCustom);
      window.removeEventListener('storage', syncProfile);
      window.removeEventListener('focus', syncProfile);
    };
  }, []);

  const tracking =
    round != null && course != null && round.courseId === course.id;
  const [gpsFollow, setGpsFollow] = useState(false);
  // Keep GPS running in the background while a round is live.
  const gpsOn = tracking || (active && viewMode === 'gps');
  const {
    position: gpsPos,
    error: gpsError,
    quality: gpsQuality,
    locating: gpsLocating,
    locateOnce,
  } = useGpsWatch(gpsOn);

  useEffect(() => {
    if (viewMode === 'gps' && active) {
      locateOnce();
      setGpsHudOpen(true);
    } else if (!tracking) {
      setGpsFollow(false);
    }
  }, [viewMode, locateOnce, active, tracking]);

  const leaveGpsMode = useCallback(() => {
    setGpsFollow(false);
    navigate('/rounds/prep', { replace: true });
  }, [navigate]);

  // Mapbox needs a resize after the keep-alive layer is shown again.
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
    return () => window.clearTimeout(id);
  }, [active]);

  const searchLat = course?.lat ?? loc.lat;
  const searchLon = course?.lon ?? loc.lon;
  const showPicker = pickerOpen || !course;

  const {
    courses,
    loading: coursesLoading,
    error: coursesError,
    retry: retryCourses,
  } = useGolfCourses(loc.lat, loc.lon, courseFilter);
  const {
    holes,
    loading: holesLoading,
    error: holesError,
    fromBackup: holesFromBackup,
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
    setPlanningMode('tee');
  }, [holes, course?.id, course?.name]);

  // One character filters the nearby list; two or more searches the
  // bundled 14,000+ U.S. course catalog (11,000+ verified with par/yardage).
  const filteredCourses = useMemo(() => {
    const q = courseFilter.trim().toLowerCase();
    if (!q) return courses;
    if (q.length >= 2) return courses;
    return courses.filter((c) => c.name.toLowerCase().includes(q));
  }, [courses, courseFilter]);
  const {
    data: ensemble,
    loading: ensLoading,
    error: ensError,
  } = useGolfEnsemble(
    course?.lat ?? null,
    course?.lon ?? null,
    playHoles,
    hour,
    profile,
  );

  const {
    data: notebook,
    loading: notebookLoading,
    error: notebookError,
  } = useGolfNotebook(
    course?.lat ?? null,
    course?.lon ?? null,
    playHoles,
    profile,
    bookOpen,
  );

  // Persist prep notebook so GPS / reopen can transfer hole notes instantly.
  useEffect(() => {
    if (!notebook || !course || !profile) return;
    saveYardageNotesFromPrep({
      course,
      profile,
      notebook,
      teeKindLabel:
        teeKinds.length > 1 ? teeKindLabel(teeKind) : undefined,
    });
  }, [notebook, course, profile, teeKind, teeKinds.length]);

  const savedYardageNotes = useMemo(
    () => (course ? loadYardageNotes(course.id) : null),
    [course, notebook],
  );
  const yardageNotebook = notebook ?? savedYardageNotes?.notebook ?? null;
  const yardageFromPrep = Boolean(!notebook && savedYardageNotes?.notebook);

  const bag = useMemo(
    () =>
      bagFromStocks(
        profile?.driverYards ?? 225,
        profile?.sevenIronYards ?? 150,
      ),
    [profile],
  );
  const arcClubs = useMemo(() => bagArcClubs(bag), [bag]);
  const courseElevFt = useMemo(() => {
    const tees = playHoles
      .map((h) => h.teeElevationM)
      .filter((m): m is number => typeof m === 'number' && Number.isFinite(m));
    if (!tees.length) return 0;
    return Math.round(
      metersToFeet(tees.reduce((s, n) => s + n, 0) / tees.length),
    );
  }, [playHoles]);

  const activeHoleObj = useMemo(
    () => playHoles.find((h) => h.number === activeHole) ?? null,
    [playHoles, activeHole],
  );

  useEffect(() => {
    if (!activeHoleObj || !profile) {
      setTarget(null);
      return;
    }
    // GPS rangefinder aims at green mid by default; Prep uses a tee-shot landing.
    setTarget(
      viewMode === 'gps'
        ? greenMarks(activeHoleObj).mid
        : defaultTarget(
            activeHoleObj,
            bag[0]?.yards ?? profile.driverYards,
          ),
    );
  }, [activeHoleObj, profile, bag, planningMode, viewMode]);

  const briefByHole = useMemo(() => {
    const m = new Map<number, HoleBrief>();
    for (const h of ensemble?.holes ?? []) m.set(h.number, h);
    return m;
  }, [ensemble]);

  const activeBrief =
    activeHole != null ? briefByHole.get(activeHole) : undefined;
  const turf = ensemble?.turf ?? DEFAULT_TURF;
  const forecast = useMemo(() => {
    if (!activeHoleObj || !target || !profile) return null;
    const hole =
      planningMode === 'tee'
        ? activeHoleObj
        : {
            ...activeHoleObj,
            tee: { lat: target.lat, lon: target.lon },
            yards: Math.round(
              haversineYards(
                target.lat,
                target.lon,
                activeHoleObj.green.lat,
                activeHoleObj.green.lon,
              ),
            ),
            par: 3,
          };
    return predictHole({
      hole,
      target:
        planningMode === 'tee'
          ? target
          : { lat: activeHoleObj.green.lat, lon: activeHoleObj.green.lon },
      bag,
      profile,
      brief: activeBrief,
      turf,
    });
  }, [activeHoleObj, target, bag, profile, activeBrief, turf, planningMode]);
  const playLines = useMemo(
    () => (viewMode === 'prep' ? playLinesGeoJSON(forecast) : null),
    [forecast, viewMode],
  );
  const activeIdx = playHoles.findIndex((h) => h.number === activeHole);
  const layoutLabel = [
    `${playHoles.length} holes`,
    loops.length > 1 ? resolvedLoop : null,
    teeKinds.length > 1 ? teeKindLabel(teeKind) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const pickCourse = useCallback(
    (next: GolfCourseSummary) => {
      warmSatelliteTiles(next.lat, next.lon, {
        courseId: next.id,
        priority: 'high',
      });
      setCourse(next);
      setGreens3d(false);
      setGreenMeshCourse(null);
      setActiveHole(null);
      setLoop(null);
      setTeeKind('mid');
      setTarget(null);
      setBookOpen(false);
      setSheetExpanded(false);
      setScorecardOpen(false);
      // Don't keep showing a scorecard/round for a different course.
      setRound((prev) => {
        if (prev && prev.courseId !== next.id) {
          clearRound();
          return null;
        }
        return prev;
      });
      setPickerOpen(false);
    },
    [],
  );

  // Social → GPS: apply course stashed when a multiplayer group was created.
  useEffect(() => {
    if (!active) return;
    const pending = takePendingCourse();
    if (!pending) return;
    pickCourse(pending);
    if (!location.pathname.includes('/rounds/gps')) {
      navigate('/rounds/gps', { replace: true });
    }
  }, [active, pickCourse, navigate, location.pathname]);

  const openScorecard = useCallback(() => {
    if (!course) return;
    if (!round || round.courseId !== course.id) {
      const r = newRound(
        course.id,
        course.name,
        resolvedLoop ?? undefined,
      );
      setRound(r);
      saveRound(r);
    }
    if (activeHole == null && playHoles.length) {
      setActiveHole(playHoles[0]!.number);
    }
    setScorecardOpen(true);
  }, [course, round, resolvedLoop, activeHole, playHoles]);

  const startRound = useCallback(() => {
    if (!course) return;
    const r = newRound(course.id, course.name, resolvedLoop ?? undefined);
    setRound(r);
    saveRound(r);
  }, [course, resolvedLoop]);

  const endRound = useCallback(() => {
    if (round?.scores.length) {
      finishAndArchiveRound(round);
    } else {
      clearRound();
    }
    setRound(null);
    setScorecardOpen(false);
  }, [round]);

  const dropShot = useCallback(() => {
    if (!round || !activeHoleObj || !gpsPos) return;
    const holeShots = shotsForHole(round, activeHoleObj.number);
    const from =
      holeShots.length > 0
        ? holeShots[holeShots.length - 1]!.to
        : { lat: activeHoleObj.tee.lat, lon: activeHoleObj.tee.lon };
    const to = { lat: gpsPos.lat, lon: gpsPos.lon };
    const distShot = haversineYards(from.lat, from.lon, to.lat, to.lon);
    const club = bestClubForDistance(distShot, bag);
    const updated = addShot(
      round,
      activeHoleObj.number,
      from,
      to,
      activeHoleObj.green,
      club,
    );
    setRound(updated);
    saveRound(updated);
  }, [round, activeHoleObj, gpsPos, bag]);

  const dropShotAtTap = useCallback(
    (pt: LonLat) => {
      setTarget(pt);
      if (!round || !activeHoleObj) return;
      const holeShots = shotsForHole(round, activeHoleObj.number);
      const from =
        holeShots.length > 0
          ? holeShots[holeShots.length - 1]!.to
          : { lat: activeHoleObj.tee.lat, lon: activeHoleObj.tee.lon };
      const to = { lat: pt.lat, lon: pt.lon };
      const distShot = haversineYards(from.lat, from.lon, to.lat, to.lon);
      const club = bestClubForDistance(distShot, bag);
      const updated = addShot(
        round,
        activeHoleObj.number,
        from,
        to,
        activeHoleObj.green,
        club,
      );
      setRound(updated);
      saveRound(updated);
    },
    [round, activeHoleObj, bag],
  );

  const undoShot = useCallback(() => {
    if (!round) return;
    const updated = undoLastShot(round);
    setRound(updated);
    saveRound(updated);
  }, [round]);

  const activeHoleShots = useMemo(
    () => (round && activeHole != null ? shotsForHole(round, activeHole) : []),
    [round, activeHole],
  );

  const gpsBearingToPin = useMemo(() => {
    if (!gpsPos || !activeHoleObj) return null;
    return bearingDeg(
      gpsPos.lat,
      gpsPos.lon,
      activeHoleObj.green.lat,
      activeHoleObj.green.lon,
    );
  }, [gpsPos, activeHoleObj]);

  const gpsGreenDistances = useMemo(() => {
    if (!activeHoleObj) return null;
    const from =
      gpsPos && viewMode === 'gps'
        ? { lat: gpsPos.lat, lon: gpsPos.lon }
        : null;
    if (!from) return null;
    return distancesToGreen(from, greenMarks(activeHoleObj));
  }, [gpsPos, activeHoleObj, viewMode]);

  /** Ball for F/M/B lines: live GPS when close, otherwise the tee (so lines always show). */
  const rangefinderFrom = useMemo(() => {
    if (viewMode !== 'gps' || !activeHoleObj) return null;
    if (
      gpsPos &&
      gpsGreenDistances != null &&
      gpsGreenDistances.mid <= 700
    ) {
      return { lat: gpsPos.lat, lon: gpsPos.lon };
    }
    return { lat: activeHoleObj.tee.lat, lon: activeHoleObj.tee.lon };
  }, [viewMode, activeHoleObj, gpsPos, gpsGreenDistances]);

  const rangefinderDistances = useMemo(() => {
    if (!rangefinderFrom || !activeHoleObj) return null;
    return distancesToGreen(rangefinderFrom, greenMarks(activeHoleObj));
  }, [rangefinderFrom, activeHoleObj]);

  const gpsMidClub = useMemo(() => {
    if (!rangefinderDistances || rangefinderDistances.mid > 700) return null;
    return bestClubForDistance(rangefinderDistances.mid, bag) ?? null;
  }, [rangefinderDistances, bag]);

  /** Aim point for GPS crosshair — tap moves this; defaults to green mid. */
  const rangefinderAim = useMemo(() => {
    if (viewMode !== 'gps' || !activeHoleObj) return null;
    if (target) return target;
    const m = greenMarks(activeHoleObj);
    return m.mid;
  }, [viewMode, activeHoleObj, target]);

  const rangefinderPlaysLikeYd = useMemo(() => {
    if (!rangefinderFrom || !rangefinderAim || !activeHoleObj) return null;
    const yd = Math.round(
      haversineYards(
        rangefinderFrom.lat,
        rangefinderFrom.lon,
        rangefinderAim.lat,
        rangefinderAim.lon,
      ),
    );
    if (yd > 700) return null;
    return segmentPlaysLike(
      yd,
      activeHoleObj.yards,
      activeBrief?.playsLikeYards != null
        ? activeBrief.playsLikeYards - activeBrief.yards
        : 0,
      activeBrief?.slopeYards ?? 0,
      metersToFeet(0),
    );
  }, [
    rangefinderFrom,
    rangefinderAim,
    activeHoleObj,
    activeBrief,
  ]);

  useEffect(() => {
    if (!course) {
      setCanGreens3d(false);
      return;
    }
    let cancelled = false;
    courseHasGreenMeshes(course.name, course.lat, course.lon).then((ok) => {
      if (!cancelled) setCanGreens3d(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [course]);

  useEffect(() => {
    if (!greens3d || !course) {
      setGreenMeshCourse(null);
      return;
    }
    let cancelled = false;
    resolveGreenMeshSlug(course.name, course.lat, course.lon).then((slug) => {
      if (cancelled) return;
      if (!slug) {
        setGreenMeshCourse(null);
        return;
      }
      loadGreenMeshCourse(slug).then((data) => {
        if (!cancelled) setGreenMeshCourse(data);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [greens3d, course]);

  useEffect(() => {
    if (viewMode !== 'gps') return;
    if (activeHole != null) return;
    if (!playHoles.length) return;
    setActiveHole(playHoles[0]!.number);
  }, [viewMode, activeHole, playHoles]);

  useEffect(() => {
    if (!course) setMapReady(false);
  }, [course]);

  const stepHole = useCallback(
    (delta: number) => {
      if (!playHoles.length) return;
      setActiveHole((prev) => {
        if (prev == null) return playHoles[0].number;
        const i = playHoles.findIndex((h) => h.number === prev);
        if (i < 0) return playHoles[0].number;
        const next = Math.min(Math.max(i + delta, 0), playHoles.length - 1);
        return playHoles[next].number;
      });
    },
    [playHoles],
  );

  // Arrow keys walk the course once a hole is open.
  useEffect(() => {
    if (activeHole == null) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepHole(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepHole(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeHole, stepHole]);

  if (setupOpen) {
    return (
      <GolfSetup
        initial={profile}
        onComplete={(next) => {
          setProfile(next);
          setSetupOpen(false);
          if (next.commonCourses[0]) setCourseFilter(next.commonCourses[0]);
        }}
        onCancel={() => setSetupOpen(false)}
      />
    );
  }

  const hourSlider = course ? (
    <div className={isMobile ? 'px-3 pb-2' : 'border-t border-[var(--line-subtle)] p-3'}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
          Forecast hour
        </span>
        <span className="text-[11px] tabular-nums text-[var(--ink-2)]">
          +{hour}h
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={24}
        value={hour}
        onChange={(e) => setHour(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
      {ensemble && (
        <p className="mt-2 text-[11px] leading-snug text-[var(--ink-2)]">
          <Sparkles className="mr-1 inline h-3 w-3 text-[var(--accent)]" />
          {ensemble.summary}
        </p>
      )}
      {ensLoading && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Blending models…
        </p>
      )}
      {ensError && (
        <p className="mt-2 text-[11px] text-red-300">{ensError}</p>
      )}
    </div>
  ) : null;

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col md:flex-row">
      {/* Course picker — full screen on phones until a course is chosen. */}
      <aside
        className={
          showPicker
            ? isMobile
              ? [
                  'z-20 flex min-h-0 flex-col bg-[var(--surface-0)]',
                  course ? 'absolute inset-0' : 'relative h-full',
                ].join(' ')
              : 'golf-hud z-10 flex h-full w-[380px] shrink-0 flex-col border-r border-[var(--line-subtle)] bg-[rgba(8,12,18,0.94)]'
            : 'hidden'
        }
      >
        <div className="border-b border-[var(--line-subtle)] px-3 py-3">
          <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.8} />
          <div className="min-w-0 flex-1">
            <p className="section-eyebrow">Golf intelligence</p>
            <h1 className="truncate text-sm font-semibold text-[var(--ink-1)]">
              TeeReady
            </h1>
            <p className="truncate text-[11px] text-[var(--ink-3)]">
              11,000+ verified · 14,000+ searchable
            </p>
          </div>
          <a
            href={weatherAppHref()}
            className="rounded-lg p-2.5 text-[var(--ink-3)] hover:bg-white/5 hover:text-[var(--ink-1)]"
            aria-label="WeatherStop weather"
            title="WeatherStop weather"
          >
            <CloudSun className="h-4 w-4" />
          </a>
          {course ? (
            <button
              type="button"
              className="rounded-lg px-2 py-2 text-[12px] font-medium text-[var(--ink-2)] hover:bg-white/5 hover:text-[var(--ink-1)]"
              onClick={() => setPickerOpen(false)}
            >
              Map
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg p-2.5 text-[var(--ink-3)] hover:bg-white/5 hover:text-[var(--ink-1)]"
            aria-label="Edit golf profile"
            title={`Settings · HCP ${formatHandicap(profile.handicap)}`}
            onClick={() => navigate('/settings')}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-lg p-2.5 text-[var(--ink-3)] hover:bg-white/5 hover:text-[var(--ink-1)]"
            aria-label="Change location"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
          <div className="mt-3 floating-subpanel flex items-center gap-2 px-3 py-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" />
            <span className="truncate text-xs text-[var(--ink-2)]">{loc.name}</span>
          </div>
        </div>

        {searchOpen ? (
          <div className="px-3 pb-2">
            <SearchBar
              onPick={(p) => {
                setMapReady(false);
                setLoc({ name: p.label, lat: p.lat, lon: p.lon });
                setCourse(null);
                setActiveHole(null);
                setTarget(null);
                setBookOpen(false);
                setPickerOpen(true);
                setSearchOpen(false);
              }}
            />
          </div>
        ) : null}

        <div className="px-3 pb-2">
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            placeholder="City courses & private clubs…"
            className={`w-full rounded-2xl border border-[var(--line-default)] ${isMobile ? 'bg-canvas' : 'bg-black/20'} px-3 py-2.5 text-base text-[var(--ink-1)] placeholder:text-[var(--ink-4)] outline-none focus:border-[var(--accent)] md:py-2 md:text-[13px]`}
          />
        </div>

        {profile.commonCourses.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2">
            {profile.commonCourses.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setCourseFilter(name)}
                className="chip-button shrink-0"
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {coursesLoading && (
            <div className="floating-subpanel flex items-center gap-2 px-3 py-3 text-xs text-[var(--ink-3)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />{' '}
              {courseFilter.trim().length >= 2
                ? 'Searching 14,000+ courses…'
                : 'Finding nearby courses…'}
            </div>
          )}
          {coursesError && !courses.length && (
            <div className="floating-subpanel px-3 py-3">
              <p className="text-xs text-red-300">
                OpenStreetMap is busy right now.
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
                {coursesError}
              </p>
              <button
                type="button"
                onClick={retryCourses}
                className="mt-1.5 rounded-md bg-white/10 px-2 py-1 text-[11px] font-medium text-[var(--ink-1)] hover:bg-white/15"
              >
                Try again
              </button>
            </div>
          )}
          {!coursesLoading && !courses.length && !coursesError && (
            <p className="floating-subpanel px-3 py-3 text-xs text-[var(--ink-3)]">
              {courseFilter.trim().length >= 2
                ? `No courses match “${courseFilter.trim()}”.`
                : 'No golf courses found nearby. Try another city.'}
            </p>
          )}
          {!coursesLoading && courses.length > 0 && !filteredCourses.length && (
            <p className="floating-subpanel px-3 py-3 text-xs text-[var(--ink-3)]">
              No courses match “{courseFilter}”.
            </p>
          )}
          <ul className="space-y-2">
            {filteredCourses.map((c) => {
              const active = course?.id === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pickCourse(c)}
                    className={[
                      'floating-subpanel w-full px-3 py-3 text-left transition-colors',
                      active
                        ? 'border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[var(--accent-soft)]'
                        : 'hover:bg-white/5',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <CourseHeroImage
                        seed={c.id || c.name}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-[var(--ink-1)]">
                          {c.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--ink-3)]">
                      {c.access === 'public' && (
                        <span className="rounded bg-emerald-500/20 px-1 py-px font-medium text-emerald-200">
                          Public
                        </span>
                      )}
                      {c.access === 'private' && (
                        <span className="rounded bg-amber-500/20 px-1 py-px font-medium text-amber-100">
                          Private
                        </span>
                      )}
                      {c.access === 'resort' && (
                        <span className="rounded bg-sky-500/20 px-1 py-px font-medium text-sky-100">
                          Resort
                        </span>
                      )}
                      {c.distanceMi != null && (
                        <span>{c.distanceMi.toFixed(1)} mi</span>
                      )}
                      {c.region && <span className="truncate">{c.region}</span>}
                      {c.holes != null && <span>{c.holes} holes</span>}
                      {c.par != null && <span>par {c.par}</span>}
                        </div>
                      </div>
                      {active ? (
                        <span className="chip-button shrink-0" data-active="true">
                          Selected
                        </span>
                      ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {course && !isMobile ? hourSlider : null}
      </aside>

      {/* Map + hole board */}
      <div
        className={[
          'golf-hud relative min-h-0 flex-1 overflow-hidden',
          isMobile && !course ? 'hidden' : '',
        ].join(' ')}
      >
        {course ? (
          <>
            <GolfMapBoundary
              fallback={
                <div className="flex h-full items-center justify-center bg-[var(--surface-0)] px-6 text-center text-sm text-[var(--ink-3)]">
                  Satellite map couldn’t start on this device. Hole wind is
                  still available in the panel.
                </div>
              }
            >
              <GolfMap
                lat={searchLat}
                lon={searchLon}
                holes={playHoles}
                activeHole={activeHole}
                onSelectHole={setActiveHole}
                target={target}
                arcClubs={viewMode === 'prep' ? arcClubs : []}
                onSetTarget={tracking ? dropShotAtTap : setTarget}
                playLines={playLines}
                planningMode={planningMode}
                windFromDeg={ensemble?.ensemble.windFromDeg ?? null}
                windMph={ensemble?.ensemble.windMph ?? null}
                headwindMph={activeBrief?.headwindMph ?? null}
                crosswindMph={activeBrief?.crosswindMph ?? null}
                holeUp={holeUp}
                compactControls={isMobile}
                showWindLegend={!isMobile && viewMode === 'prep'}
                fitPadding={isMobile ? MOBILE_FIT_PADDING : 60}
                legendClassName="left-3 top-3"
                onReady={() => setMapReady(true)}
                satelliteCached={peekSatelliteTilesWarm(
                  searchLat,
                  searchLon,
                  course.id,
                )}
                courseName={course.name}
                greens3d={false}
                showRangefinder={viewMode === 'gps'}
                rangefinderFrom={viewMode === 'gps' ? rangefinderFrom : null}
                rangefinderAim={viewMode === 'gps' ? rangefinderAim : null}
                rangefinderPlaysLikeYd={
                  viewMode === 'gps' ? rangefinderPlaysLikeYd : null
                }
                gpsMidClub={viewMode === 'gps' ? gpsMidClub : null}
                trackedShots={activeHoleShots}
                gpsPosition={
                  gpsOn && gpsPos
                    ? { lat: gpsPos.lat, lon: gpsPos.lon }
                    : null
                }
                gpsAccuracyM={gpsOn ? gpsPos?.accuracyM ?? null : null}
                gpsHeadingDeg={gpsOn ? gpsPos?.headingDeg ?? null : null}
                followGps={gpsFollow && gpsOn}
              />
            </GolfMapBoundary>

            {!mapReady || (holesLoading && holes.length === 0) ? (
              <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-[linear-gradient(180deg,rgba(4,7,12,0.72),rgba(4,7,12,0.5))] p-6">
                <div className="floating-panel w-full max-w-md px-5 py-5 text-center">
                  <p className="section-eyebrow">Course map</p>
                  <h2 className="mt-1 text-lg font-semibold text-[var(--ink-1)]">
                    {course.name}
                  </h2>
                  <p className="mt-2 text-[13px] text-[var(--ink-3)]">
                    {holesLoading && holes.length === 0
                      ? 'Loading course map, hole geometry, and weather overlays…'
                      : peekSatelliteTilesWarm(searchLat, searchLon, course.id)
                        ? 'Opening saved satellite imagery…'
                        : 'Starting the satellite course map…'}
                  </p>
                  <div className="mt-4 space-y-2">
                    <div className="h-40 rounded-2xl shimmer" />
                    <div className="grid grid-cols-3 gap-2">
                      <div className="h-10 rounded-xl shimmer" />
                      <div className="h-10 rounded-xl shimmer" />
                      <div className="h-10 rounded-xl shimmer" />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {viewMode === 'prep' && activeHoleObj && target && profile ? (
              <DraggableBox
                id="prep-hud"
                defaultAnchor={{ left: 12, bottom: 16 }}
                zIndex={22}
              >
                <GolfTargetHud
                  hole={activeHoleObj}
                  target={target}
                  bag={bag}
                  brief={activeBrief}
                  elevFt={courseElevFt}
                  turf={turf}
                  forecast={forecast}
                  mode={planningMode}
                  onReset={() =>
                    setTarget(
                      defaultTarget(
                        activeHoleObj,
                        bag[0]?.yards ?? profile.driverYards,
                      ),
                    )
                  }
                />
              </DraggableBox>
            ) : null}

            {/* Scorecard — Prep/GPS chosen from Rounds nav dropdown */}
            {course ? (
              <DraggableBox
                id="mode-card"
                defaultAnchor={{ right: 12, top: 12 }}
                zIndex={24}
                showHandle={false}
              >
                <GlassPanel
                  variant="high"
                  className="flex items-center gap-0.5 overflow-hidden p-0.5 shadow-xl"
                >
                  <span
                    className={
                      viewMode === 'gps'
                        ? 'rounded-md bg-[#3b82f6] px-2 py-1 text-[10px] font-bold text-white'
                        : 'rounded-md bg-brand px-2 py-1 text-[10px] font-bold text-white'
                    }
                  >
                    {viewMode === 'gps' ? 'GPS' : 'Prep'}
                  </span>
                  {viewMode === 'gps' && !gpsHudOpen ? (
                    <button
                      type="button"
                      onClick={() => setGpsHudOpen(true)}
                      title="Show GPS panel"
                      className="rounded-md px-2 py-1 text-[10px] font-semibold text-[#3b82f6] hover:bg-white/10"
                    >
                      Show GPS
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={openScorecard}
                    title={`Scorecard · HCP ${formatHandicap(profile.handicap)}`}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-[var(--ink-2)] hover:bg-white/10"
                  >
                    <ClipboardList className="h-3 w-3" />
                    Card
                  </button>
                  {course && canGreens3d ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (activeHole == null && playHoles[0]) {
                          setActiveHole(playHoles[0].number);
                        }
                        setGreens3d(true);
                      }}
                      aria-pressed={greens3d}
                      title="Open 3D green viewer"
                      className={[
                        'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold transition-colors',
                        greens3d
                          ? 'bg-emerald-500/30 text-emerald-100'
                          : 'text-[var(--ink-2)] hover:bg-white/10',
                      ].join(' ')}
                    >
                      <Mountain className="h-3 w-3" />
                      3D green
                    </button>
                  ) : null}
                  {!intelPanelOpen ? (
                    <button
                      type="button"
                      onClick={() => setIntelPanelOpen(true)}
                      title="Show course panel"
                      className="rounded-md px-1.5 py-1 text-[10px] font-semibold text-[var(--ink-2)] hover:bg-white/10"
                    >
                      Course
                    </button>
                  ) : null}
                  {viewMode === 'gps' ? (
                    <button
                      type="button"
                      onClick={leaveGpsMode}
                      title="Close GPS · return to Prep"
                      className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-semibold text-[var(--ink-2)] hover:bg-white/10"
                    >
                      <X className="h-3 w-3" />
                      Prep
                    </button>
                  ) : null}
                </GlassPanel>
              </DraggableBox>
            ) : null}

            {/* Hole-by-hole walkthrough + course switcher */}
            {(isMobile || playHoles.length > 0) && (
              <DraggableBox
                id="hole-nav"
                defaultAnchor={{ left: 12, top: 12 }}
                zIndex={23}
                showHandle={false}
              >
                <GlassPanel
                  variant="high"
                  className="flex max-w-[min(100vw-2rem,24rem)] items-center gap-0 overflow-hidden px-0.5 py-0.5 shadow-xl"
                >
                  {course ? (
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      aria-label="Change course"
                      className="shrink-0 rounded-lg px-2 py-2 text-[11px] font-medium text-[var(--ink-2)] hover:bg-white/10 hover:text-[var(--ink-1)]"
                    >
                      Courses
                    </button>
                  ) : null}
                  {playHoles.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => stepHole(-1)}
                        disabled={activeIdx <= 0}
                        aria-label="Previous hole"
                        className="rounded-lg p-2 text-[var(--ink-2)] transition-colors hover:bg-white/10 hover:text-[var(--ink-1)] disabled:opacity-30 md:p-1.5"
                      >
                        <ChevronLeft className="h-5 w-5 md:h-4 md:w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveHole(
                            activeHole == null ? playHoles[0].number : null,
                          )
                        }
                        className="min-w-[96px] rounded-lg px-2 py-0.5 text-center transition-colors hover:bg-white/10"
                        title={
                          activeHole == null
                            ? 'Start the walkthrough'
                            : 'Back to full course'
                        }
                      >
                        <span className="block text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                          {activeHole == null ? 'Course' : 'Hole'}
                        </span>
                        <span className="block text-[13px] font-semibold tabular-nums text-[var(--ink-1)]">
                          {activeHole == null
                            ? layoutLabel
                            : `${activeHole} · ${playHoles[activeIdx]?.yards ?? '—'} yd`}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => stepHole(1)}
                        disabled={activeIdx >= playHoles.length - 1}
                        aria-label="Next hole"
                        className="rounded-lg p-2 text-[var(--ink-2)] transition-colors hover:bg-white/10 hover:text-[var(--ink-1)] disabled:opacity-30 md:p-1.5"
                      >
                        <ChevronRight className="h-5 w-5 md:h-4 md:w-4" />
                      </button>
                      {activeHole != null &&
                      activeIdx >= 0 &&
                      activeIdx < playHoles.length - 1 ? (
                        <button
                          type="button"
                          onClick={() => stepHole(1)}
                          className="ml-0.5 rounded-lg bg-brand/25 px-2 py-1.5 text-[11px] font-semibold text-[var(--ink-1)] hover:bg-brand/35"
                        >
                          Next hole
                        </button>
                      ) : null}
                      <span className="mx-0.5 h-6 w-px bg-[var(--line-subtle)]" />
                      <button
                        type="button"
                        onClick={() => setHoleUp((v) => !v)}
                        aria-pressed={holeUp}
                        title="Rotate map so the hole plays up the screen"
                        className={[
                          'rounded-lg p-2 transition-colors md:p-1.5',
                          holeUp
                            ? 'bg-[var(--accent)]/25 text-[var(--ink-1)]'
                            : 'text-[var(--ink-3)] hover:bg-white/10',
                        ].join(' ')}
                      >
                        <Compass className="h-5 w-5 md:h-4 md:w-4" />
                      </button>
                      <span className="mx-0.5 h-6 w-px bg-[var(--line-subtle)]" />
                      {tracking ? (
                        <>
                          <button
                            type="button"
                            onClick={dropShot}
                            disabled={!gpsPos || !activeHoleObj}
                            title="Drop shot at GPS position"
                            className="rounded-lg bg-pink-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-pink-300 transition-colors hover:bg-pink-500/30 disabled:opacity-40"
                          >
                            Drop
                          </button>
                          <button
                            type="button"
                            onClick={endRound}
                            title="End round"
                            className="rounded-lg px-2 py-1.5 text-[11px] text-red-300 hover:bg-red-500/20"
                          >
                            End
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={startRound}
                          disabled={!course}
                          title="Start tracking a round"
                          className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-pink-300 hover:bg-pink-500/20 disabled:opacity-40"
                        >
                          Track
                        </button>
                      )}
                    </>
                  ) : null}
                </GlassPanel>
              </DraggableBox>
            )}

            {/* GPS HUD — only in GPS mode */}
            {course && viewMode === 'gps' && gpsHudOpen ? (
              <DraggableBox
                id="gps-mod"
                defaultAnchor={{ left: 12, top: 52 }}
                zIndex={22}
                style={{ width: 'min(100vw - 1.5rem, 220px)' }}
                onClose={() => setGpsHudOpen(false)}
              >
                <GpsMod
                  enabled={gpsOn}
                  follow={gpsFollow}
                  position={gpsPos}
                  quality={gpsQuality}
                  error={gpsError}
                  locating={gpsLocating}
                  distances={
                    gpsPos ? gpsGreenDistances : rangefinderDistances
                  }
                  holeYards={activeHoleObj?.yards ?? null}
                  holeNumber={activeHoleObj?.number ?? null}
                  bearingToPin={gpsBearingToPin}
                  onToggleFollow={() => setGpsFollow((v) => !v)}
                  onLocate={() => {
                    locateOnce();
                    setGpsFollow(true);
                  }}
                  onDropShot={tracking ? dropShot : undefined}
                  canDropShot={Boolean(tracking && gpsPos && activeHoleObj)}
                  onClose={() => setGpsHudOpen(false)}
                />
              </DraggableBox>
            ) : null}

            {scorecardOpen &&
            round &&
            course &&
            round.courseId === course.id ? (
              <DraggableBox
                id="scorecard"
                defaultAnchor={{ left: 12, top: 56 }}
                zIndex={40}
                style={{
                  width: 'min(100vw - 1.5rem, 420px)',
                  height: 'min(72dvh, 640px)',
                }}
              >
                <div className="h-full overflow-hidden rounded-b-card">
                  <GolfScorecard
                    holes={playHoles}
                    round={round}
                    handicap={profile.handicap}
                    activeHoleNumber={activeHole}
                    onChange={(next) => {
                      setRound(next);
                      saveRound(next);
                    }}
                    onClose={() => setScorecardOpen(false)}
                    onFinishRound={endRound}
                    onSelectHole={setActiveHole}
                    onNextHole={() => stepHole(1)}
                    onPrevHole={() => stepHole(-1)}
                  />
                </div>
              </DraggableBox>
            ) : null}

            {/* Shot tracker info bar */}
            {tracking && activeHoleObj && activeHoleShots.length > 0 && (
              <DraggableBox
                id="shot-bar"
                defaultAnchor={{ left: 12, bottom: 180 }}
                zIndex={21}
              >
                <GlassPanel
                  variant="high"
                  className="overflow-hidden px-2 py-1.5 shadow-xl"
                >
                  <div className="flex max-w-[min(100vw-2rem,28rem)] flex-wrap items-center gap-2 text-[10px]">
                    <span className="font-semibold text-pink-200">
                      Hole {activeHoleObj.number}
                    </span>
                    {activeHoleShots.map((s) => (
                      <span key={s.id} className="tabular-nums text-[var(--ink-2)]">
                        {s.shotNumber}. {s.club ?? '?'} {s.yards}yd → {s.remainYards}yd
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={undoShot}
                      className="rounded-md px-1.5 py-0.5 font-medium text-[var(--ink-3)] hover:bg-white/10 hover:text-[var(--ink-1)]"
                    >
                      Undo
                    </button>
                  </div>
                </GlassPanel>
              </DraggableBox>
            )}

            {intelPanelOpen ? (
            <DraggableBox
              id="intel-panel"
              defaultAnchor={
                isMobile
                  ? { left: 12, bottom: 12 }
                  : { right: 12, top: 12 }
              }
              zIndex={18}
              onClose={() => setIntelPanelOpen(false)}
              style={{
                width: isMobile
                  ? 'min(100vw - 1.5rem, 100%)'
                  : 'min(100vw - 1.5rem, 272px)',
                maxHeight: isMobile
                  ? sheetExpanded
                    ? 'min(50dvh, 22rem)'
                    : '7.5rem'
                  : 'min(100% - 1.5rem, calc(100dvh - 5.5rem))',
              }}
            >
              <GlassPanel
                className={[
                  'flex max-h-[inherit] flex-col overflow-hidden p-0 shadow-xl',
                  isMobile
                    ? sheetExpanded
                      ? 'max-h-[min(50dvh,22rem)]'
                      : 'max-h-[7.5rem]'
                    : 'max-h-full',
                ].join(' ')}
              >
                {isMobile ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 border-b border-[var(--line-subtle)] px-3 py-2.5 text-left"
                    onClick={() => setSheetExpanded((v) => !v)}
                    aria-expanded={sheetExpanded}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[var(--ink-1)]">
                        {course.name}
                      </div>
                      <div className="text-[11px] text-[var(--ink-3)]">
                        {holesLoading && !playHoles.length
                          ? 'Loading hole geometry…'
                          : holesFromBackup && playHoles.length
                            ? `Saved course map · ${layoutLabel}`
                            : holesError && !playHoles.length
                              ? 'OpenStreetMap is busy — hole data unavailable'
                              : playHoles.length
                                ? ensemble?.ensemble.windMph != null
                                  ? `${layoutLabel} · ${Math.round(ensemble.ensemble.windMph)} mph ${bearingCompass(ensemble.ensemble.windFromDeg)}`
                                  : `${layoutLabel} · yardage, bearing & elevation`
                                : 'No hole geometry in OSM for this course yet'}
                      </div>
                    </div>
                    {sheetExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
                    ) : (
                      <ChevronUp className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
                    )}
                  </button>
                ) : (
                  <div className="border-b border-[var(--line-subtle)] px-4 py-3">
                    <p className="section-eyebrow">Selected course</p>
                    <div className="mt-1 truncate text-base font-semibold text-[var(--ink-1)]">
                      {course.name}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--ink-3)]">
                      {holesLoading && !playHoles.length
                        ? 'Loading hole geometry…'
                        : holesFromBackup && playHoles.length
                          ? `Saved course map · ${layoutLabel}`
                          : holesError && !playHoles.length
                            ? 'OpenStreetMap is busy — hole data unavailable'
                            : playHoles.length
                              ? `${layoutLabel} · yardage, bearing & elevation`
                              : 'No hole geometry in OSM for this course yet'}
                    </div>
                    {ensemble?.ensemble.windMph != null ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                        <span className="chip-button" data-active="true">
                          {Math.round(ensemble.ensemble.windMph)} mph {bearingCompass(ensemble.ensemble.windFromDeg)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                )}
                {holesError && (
                  <div className="px-3 pb-2">
                    <button
                      type="button"
                      onClick={retryHoles}
                      className="mt-1.5 rounded-md bg-white/10 px-2 py-1 text-[11px] font-medium text-[var(--ink-1)] hover:bg-white/15"
                    >
                      {holesFromBackup ? 'Refresh from OSM' : 'Retry holes'}
                    </button>
                  </div>
                )}
                <div className="px-3 pb-2">
                  <button
                    type="button"
                    onClick={() => setBookOpen(true)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)]/20 px-2 py-1.5 text-[11px] font-semibold text-[var(--ink-1)] hover:bg-[var(--accent)]/30"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    {savedYardageNotes ? 'Yardage notes' : 'Yardage book'}
                  </button>
                </div>
                {(!isMobile || sheetExpanded) && (
                  <>
                    {loops.length >= 2 ? (
                      <ChipRow
                        label="Course"
                        options={loops.map((name) => ({
                          id: name,
                          label: name,
                        }))}
                        value={resolvedLoop ?? ''}
                        onChange={(id) => {
                          setLoop(id);
                          setActiveHole(null);
                        }}
                      />
                    ) : null}
                    <ChipRow
                      label="Tees"
                      options={teeKinds.map((kind) => ({
                        id: kind,
                        label: teeKindLabel(kind),
                      }))}
                      value={teeKind}
                      onChange={(id) => setTeeKind(id as TeeKind)}
                    />
                    <ChipRow
                      label="Planner"
                      options={[
                        { id: 'tee', label: 'Tee' },
                        { id: 'approach', label: 'Approach' },
                      ]}
                      value={planningMode}
                      onChange={(id) =>
                        setPlanningMode(id as 'tee' | 'approach')
                      }
                    />
                  </>
                )}

                {activeBrief && (
                  <div className="border-b border-[var(--line-subtle)] bg-[var(--accent)]/10 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--ink-1)]">
                        Hole {activeBrief.number}
                      </span>
                      <span className="rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-2)]">
                        {aspectLabel(activeBrief.aspect)}
                      </span>
                    </div>
                    {(!isMobile || sheetExpanded) && (
                      <>
                        <p className="mt-1 text-[12px] leading-snug text-[var(--ink-2)]">
                          {activeBrief.tip}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--accent)]">
                          {activeBrief.clubHint}
                        </p>
                      </>
                    )}
                    <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                      <div className="rounded-md bg-black/25 px-1 py-1">
                        <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)]">
                          {activeBrief.headwindMph >= 0 ? 'Into' : 'Helping'}
                        </div>
                        <div className="text-[12px] font-semibold tabular-nums text-[var(--ink-1)]">
                          {Math.abs(Math.round(activeBrief.headwindMph))} mph
                        </div>
                      </div>
                      <div className="rounded-md bg-black/25 px-1 py-1">
                        <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)]">
                          Slope
                        </div>
                        <div className="text-[11px] font-semibold tabular-nums text-[var(--ink-1)]">
                          {activeBrief.slopeYards > 0 ? '+' : ''}
                          {activeBrief.slopeYards} yd
                        </div>
                      </div>
                      <div className="rounded-md bg-black/25 px-1 py-1">
                        <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)]">
                          Drift
                        </div>
                        <div className="text-[11px] font-semibold tabular-nums text-[var(--ink-1)]">
                          {Math.abs(activeBrief.driftYards)} yd{' '}
                          {activeBrief.driftYards >= 0 ? 'R' : 'L'}
                        </div>
                      </div>
                      <div className="rounded-md bg-black/25 px-1 py-1">
                        <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)]">
                          Plays vs {activeBrief.yards}
                        </div>
                        <div className="text-[12px] font-semibold tabular-nums text-[var(--ink-1)]">
                          {activeBrief.playsLikeYards}
                          <span className="ml-0.5 text-[10px] font-medium text-[var(--accent)]">
                            {activeBrief.playsLikeYards - activeBrief.yards > 0
                              ? '+'
                              : ''}
                            {activeBrief.playsLikeYards - activeBrief.yards}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {forecast && (!isMobile || sheetExpanded) && (
                  <GolfHoleIntel
                    forecast={forecast}
                    turf={turf}
                    miss={profile.miss}
                  />
                )}

                {(!isMobile || sheetExpanded) && (
                  <>
                    {isMobile ? hourSlider : null}
                    <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                      {playHoles.map((h) => {
                        const brief = briefByHole.get(h.number);
                        const on = activeHole === h.number;
                        const teeCount = teesOnHole(h).length;
                        const teeLabel = pickTee(h, teeKind).label;
                        return (
                          <li key={`${h.loop ?? ''}-${h.number}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveHole(h.number);
                                if (isMobile) setSheetExpanded(false);
                              }}
                              className={[
                                'flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors md:py-2',
                                on ? 'bg-white/10' : 'hover:bg-white/5',
                              ].join(' ')}
                            >
                              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-black/30 text-[11px] font-semibold tabular-nums text-[var(--ink-1)]">
                                {h.number}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-[var(--ink-1)]">
                                  <span className="font-medium tabular-nums">
                                    {h.yards} yd
                                    {brief && brief.playsLikeYards !== h.yards
                                      ? ` · plays ${brief.playsLikeYards} (${brief.playsLikeYards - h.yards > 0 ? '+' : ''}${brief.playsLikeYards - h.yards})`
                                      : brief
                                        ? ' · plays even'
                                        : ''}
                                  </span>
                                  <span className="text-[10px] text-[var(--ink-3)]">
                                    {h.bearingDeg}°{' '}
                                    {bearingCompass(h.bearingDeg)}
                                  </span>
                                  {h.par != null && (
                                    <span className="text-[10px] text-[var(--ink-4)]">
                                      par {h.par}
                                    </span>
                                  )}
                                  {teeCount > 1 && (
                                    <span className="text-[10px] text-[var(--ink-4)]">
                                      {teeLabel}
                                      {teeCount > 2 ? ` · ${teeCount} tees` : ''}
                                    </span>
                                  )}
                                </span>
                                {brief && (
                                  <span className="mt-0.5 block truncate text-[10px] text-[var(--ink-3)]">
                                    · {brief.recommendedClub} · {brief.aspect} ·{' '}
                                    {Math.round(brief.windMph)} mph
                                  </span>
                                )}
                              </span>
                              <Navigation
                                className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]"
                                style={{
                                  transform: `rotate(${h.bearingDeg}deg)`,
                                }}
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}

                {ensemble && (!isMobile || sheetExpanded) && (
                  <div className="border-t border-[var(--line-subtle)] px-3 py-2 text-[10px] text-[var(--ink-4)]">
                    {ensemble.ensemble.modelsUsed.length} models · OSM +
                    Open-Meteo elevation · Esri imagery
                  </div>
                )}
              </GlassPanel>
            </DraggableBox>
            ) : null}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--surface-0)] px-6 text-center">
            <Flag className="h-8 w-8 text-[var(--ink-4)]" />
            <p className="max-w-sm text-sm text-[var(--ink-2)]">
              Pick a course to open high-detail satellite imagery, hole
              yardages &amp; bearings from OpenStreetMap, then an
              all-model wind ensemble hole by hole.
            </p>
          </div>
        )}
      </div>
      {bookOpen && course && profile ? (
        <GolfYardageBook
          course={course}
          profile={profile}
          notebook={yardageNotebook}
          loading={notebookLoading && !yardageNotebook}
          error={notebookError && !yardageNotebook ? notebookError : null}
          teeKindLabel={
            teeKinds.length > 1 ? teeKindLabel(teeKind) : undefined
          }
          transferredFromPrep={yardageFromPrep || viewMode === 'gps'}
          onClose={() => setBookOpen(false)}
        />
      ) : null}

      {greens3d && greenMeshCourse && activeHole != null ? (
        <Green3DViewer
          course={greenMeshCourse}
          hole={activeHole}
          onClose={() => setGreens3d(false)}
        />
      ) : null}
    </div>
  );
}
