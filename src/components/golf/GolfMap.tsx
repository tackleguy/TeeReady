// Satellite hole view: hole paths, drawn wind streamlines, and the predicted
// wind-bent shot path for the selected hole.

import { useCallback, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GOLF_SATELLITE_STYLE, type GolfHole } from '../../lib/golf';
import {
  bagRingsGeoJSON,
  gpsGuideGeoJSON,
  targetLineGeoJSON,
  targetPointGeoJSON,
} from '../../lib/golfMeasure';
import type { BagClub } from '../../lib/golfProfile';
import type { TrackedShot } from '../../lib/golfTracker';
import {
  shotTracesGeoJSON,
  shotPointsGeoJSON,
} from '../../lib/golfTracker';
import {
  emptyCollection,
  shotPathGeoJSON,
  windFlowGeoJSON,
  type LonLat,
} from '../../lib/golfWind';
import { bearingCompass } from '../../lib/geo';
import { accuracyCircleGeoJSON } from '../../lib/gps';
import {
  greenMeshSlug,
  loadGreenMeshCourse,
  type GreenMeshCourse,
} from '../../lib/golfGreen3d';
import { attachGreen3DLayer } from './GolfGreen3DLayer';

interface Props {
  lat: number;
  lon: number;
  holes: GolfHole[];
  activeHole: number | null;
  onSelectHole?: (n: number) => void;
  target?: LonLat | null;
  arcClubs?: BagClub[];
  onSetTarget?: (pt: LonLat) => void;
  /** Three miss lines per shot (tee / approach / chip / putt). */
  playLines?: GeoJSON.FeatureCollection | null;
  windFromDeg?: number | null;
  windMph?: number | null;
  headwindMph?: number | null;
  crosswindMph?: number | null;
  /** Rotate the map so the active hole plays up the screen. */
  holeUp?: boolean;
  className?: string;
  /** Hide zoom buttons — pinch-zoom still works on phones. */
  compactControls?: boolean;
  showWindLegend?: boolean;
  fitPadding?: number | { top: number; right: number; bottom: number; left: number };
  legendClassName?: string;
  onReady?: () => void;
  /** GPS shot trace data for live tracking. */
  trackedShots?: TrackedShot[];
  /** Live GPS position dot. */
  gpsPosition?: { lat: number; lon: number } | null;
  /** Horizontal accuracy in meters for the GPS ring. */
  gpsAccuracyM?: number | null;
  /** Device heading degrees, when available. */
  gpsHeadingDeg?: number | null;
  /** Keep the map centered on the GPS fix. */
  followGps?: boolean;
  planningMode?: 'tee' | 'approach';
  /** Satellite tiles were prefetched — dismiss loading overlay sooner. */
  satelliteCached?: boolean;
  /** When set, loads pre-built 3D green meshes for supported courses. */
  courseName?: string | null;
  /** User toggle — show LiDAR green 3D mesh. */
  greens3d?: boolean;
  /** Club labels for GPS F/M/B callout boxes. */
  gpsClubs?: {
    front: string | null;
    mid: string | null;
    back: string | null;
  } | null;
  /** Ball/tee origin for F/M/B rangefinder lines (GPS mode). */
  rangefinderFrom?: LonLat | null;
  /** Show 18Birdies-style F/M/B rangefinder overlay. */
  showRangefinder?: boolean;
  /** Movable aim point for the rangefinder crosshair. */
  rangefinderAim?: LonLat | null;
  /** Wind/alt adjusted "plays like" yards for the aim. */
  rangefinderPlaysLikeYd?: number | null;
}

const SRC = 'golf-holes';
const SRC_TEE = 'golf-tees';
const SRC_GREEN = 'golf-greens';
const SRC_FLOW = 'golf-wind-flow';
const SRC_SHOT = 'golf-shot-path';
const SRC_ARCS = 'golf-arcs';
const SRC_TARGET_LINE = 'golf-target-line';
const SRC_TARGET = 'golf-target-pt';
const SRC_PLAY = 'golf-play-lines';
const SRC_SHOT_TRACES = 'golf-shot-traces';
const SRC_SHOT_PTS = 'golf-shot-pts';
const SRC_GPS = 'golf-gps-pos';
const SRC_GPS_ACC = 'golf-gps-acc';
const SRC_GPS_HDG = 'golf-gps-hdg';
const SRC_GPS_GUIDE = 'golf-gps-guide';

const LINE = 'golf-hole-lines';
const LINE_ACTIVE = 'golf-hole-lines-active';
const LYR_TEE = 'golf-tees-lyr';
const LYR_GREEN = 'golf-greens-lyr';
const LYR_TEE_HIT = 'golf-tees-hit';
const LYR_GREEN_HIT = 'golf-greens-hit';
const LINE_HIT = 'golf-hole-lines-hit';
const LYR_FLOW = 'golf-wind-flow-lyr';
const LYR_FLOW_ARROW = 'golf-wind-arrow-lyr';
const LYR_AIM = 'golf-aim-lyr';
const LYR_DRIFT = 'golf-drift-lyr';
const LYR_LANDING = 'golf-landing-lyr';
const LYR_ARCS = 'golf-arcs-lyr';
const LYR_CARRY = 'golf-target-carry-lyr';
const LYR_REMAIN = 'golf-target-remain-lyr';
const LYR_TARGET = 'golf-target-pt-lyr';
const LYR_PLAY_TEE = 'golf-play-tee-lyr';
const LYR_PLAY_APP = 'golf-play-app-lyr';
const LYR_PLAY_CHIP = 'golf-play-chip-lyr';
const LYR_PLAY_PUTT = 'golf-play-putt-lyr';
const LYR_PLAY_TICK = 'golf-play-tick-lyr';
const LYR_PLAY_LABEL = 'golf-play-label-lyr';
const LYR_GPS_GUIDE = 'golf-gps-guide-lyr';
const LYR_GPS_GUIDE_LABEL = 'golf-gps-guide-label-lyr';
const LYR_GPS_PIN = 'golf-gps-pin-lyr';
const LYR_GPS_PIN_LABEL = 'golf-gps-pin-label-lyr';
const LYR_SHOT_TRACE = 'golf-shot-trace-lyr';
const LYR_SHOT_PT = 'golf-shot-pt-lyr';
const LYR_SHOT_LABEL = 'golf-shot-label-lyr';
const LYR_GPS = 'golf-gps-lyr';
const LYR_GPS_RING = 'golf-gps-ring-lyr';
const LYR_GPS_ACC = 'golf-gps-acc-lyr';
const LYR_GPS_HDG = 'golf-gps-hdg-lyr';

const CLICK_LAYERS = [LINE_HIT, LINE, LINE_ACTIVE, LYR_TEE_HIT, LYR_GREEN_HIT, LYR_TEE, LYR_GREEN];

function holeNumberFromFeature(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Marching-ants cycle for the streamlines.
const DASH_STEPS: Array<[number, number, number, number]> = [
  [0, 4, 3, 0],
  [0.5, 4, 2.5, 0.5],
  [1, 4, 2, 1],
  [1.5, 4, 1.5, 1.5],
  [2, 4, 1, 2],
  [2.5, 4, 0.5, 2.5],
  [3, 4, 0, 3],
];

function holesGeoJSON(holes: GolfHole[], active: number | null) {
  return {
    type: 'FeatureCollection' as const,
    features: holes.map((h) => {
      const path = h.path?.length
        ? h.path.map((p) => [p.lon, p.lat] as [number, number])
        : [
            [h.tee.lon, h.tee.lat] as [number, number],
            [h.green.lon, h.green.lat] as [number, number],
          ];
      return {
        type: 'Feature' as const,
        properties: {
          number: h.number,
          active: Number(active) === Number(h.number) ? 1 : 0,
          yards: h.yards,
          bearing: h.bearingDeg,
        },
        geometry: { type: 'LineString' as const, coordinates: path },
      };
    }),
  };
}

function pointsGeoJSON(holes: GolfHole[], kind: 'tee' | 'green') {
  return {
    type: 'FeatureCollection' as const,
    features: holes.map((h) => {
      const pt = kind === 'tee' ? h.tee : h.green;
      return {
        type: 'Feature' as const,
        properties: { number: h.number, kind },
        geometry: {
          type: 'Point' as const,
          coordinates: [pt.lon, pt.lat] as [number, number],
        },
      };
    }),
  };
}

/** Guide LineStrings mirrored onto the prep target-line source (always present). */
function guideAsTargetLines(
  guide: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: guide.features
      .filter(
        (f) =>
          f.geometry?.type === 'LineString' &&
          (f.properties as { kind?: string } | null)?.kind === 'guide',
      )
      .map((f) => {
        const role = (f.properties as { role?: string } | null)?.role;
        return {
          type: 'Feature' as const,
          properties: { kind: role === 'remain' ? 'remain' : 'carry' },
          geometry: f.geometry,
        };
      }),
  };
}

function addLayerSafe(
  map: maplibregl.Map,
  layer: maplibregl.LayerSpecification,
) {
  try {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  } catch (err) {
    console.warn('Golf map layer failed', layer.id, err);
  }
}

function clearCalloutMarkers(markers: maplibregl.Marker[]) {
  for (const m of markers) m.remove();
  markers.length = 0;
}

/** DOM yardage/club boxes — MapLibre symbol/circle callouts are unreliable on
 *  the satellite style (glyphs), so render these as HTML markers instead. */
function syncGpsCalloutMarkers(
  map: maplibregl.Map,
  guide: GeoJSON.FeatureCollection,
  store: maplibregl.Marker[],
) {
  clearCalloutMarkers(store);
  for (const f of guide.features) {
    const props = f.properties as {
      kind?: string;
      yardsText?: string;
      clubText?: string;
    } | null;
    const geom = f.geometry;
    if (!props || !geom || geom.type !== 'Point') continue;
    const coords = geom.coordinates as [number, number];
    if (props.kind === 'callout-yards') {
      const el = document.createElement('div');
      el.textContent = props.yardsText ?? '';
      el.style.cssText = [
        'pointer-events:none',
        'user-select:none',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'min-width:52px',
        'height:36px',
        'padding:0 10px',
        'border-radius:999px',
        'background:#0a0a0a',
        'color:#fff',
        'font:700 13px/1 Sora, system-ui, sans-serif',
        'letter-spacing:0.02em',
        'box-shadow:0 1px 4px rgba(0,0,0,0.45)',
      ].join(';');
      store.push(
        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(coords)
          .addTo(map),
      );
    } else if (props.kind === 'callout-club') {
      const el = document.createElement('div');
      el.textContent = props.clubText ?? '';
      el.style.cssText = [
        'pointer-events:none',
        'user-select:none',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'min-width:44px',
        'padding:7px 11px',
        'border-radius:999px',
        'background:#fff',
        'color:#111',
        'font:700 12px/1.15 Sora, system-ui, sans-serif',
        'white-space:pre-line',
        'text-align:center',
        'box-shadow:0 1px 4px rgba(0,0,0,0.35)',
      ].join(';');
      store.push(
        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(coords)
          .addTo(map),
      );
    }
  }
}

/** GPS path + callout frames — registered early so a later layer failure
 *  cannot leave GPS mode with markers but no lines. */
function ensureGpsGuideLayers(map: maplibregl.Map) {
  addLayerSafe(map, {
    id: 'golf-gps-whisker',
    type: 'line',
    source: SRC_GPS_GUIDE,
    filter: ['==', ['get', 'kind'], 'whisker'],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.4,
      'line-opacity': 0.55,
      'line-dasharray': [1.5, 1.8],
    },
  });
  addLayerSafe(map, {
    id: 'golf-gps-guide-casing',
    type: 'line',
    source: SRC_GPS_GUIDE,
    filter: ['==', ['get', 'kind'], 'guide'],
    paint: {
      'line-color': '#0a0a0a',
      'line-width': 7,
      'line-opacity': 0.75,
    },
  });
  addLayerSafe(map, {
    id: LYR_GPS_GUIDE,
    type: 'line',
    source: SRC_GPS_GUIDE,
    filter: ['==', ['get', 'kind'], 'guide'],
    paint: {
      'line-color': '#ffffff',
      'line-width': 4,
      'line-opacity': 1,
    },
  });
  addLayerSafe(map, {
    id: LYR_GPS_PIN,
    type: 'circle',
    source: SRC_GPS_GUIDE,
    filter: ['==', ['get', 'kind'], 'pin'],
    paint: {
      'circle-radius': 6,
      'circle-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#0a0a0a',
    },
  });
  addLayerSafe(map, {
    id: LYR_GPS_PIN_LABEL,
    type: 'symbol',
    source: SRC_GPS_GUIDE,
    filter: [
      'all',
      ['==', ['get', 'kind'], 'pin'],
      ['!=', ['get', 'label'], ''],
    ],
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 10,
      'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
      'text-offset': [0, 1.15],
      'text-anchor': 'top',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#020617',
      'text-halo-width': 1.4,
    },
  });
  addLayerSafe(map, {
    id: 'golf-gps-yards-badge',
    type: 'circle',
    source: SRC_GPS_GUIDE,
    filter: ['==', ['get', 'kind'], 'callout-yards'],
    paint: {
      'circle-radius': 26,
      'circle-color': '#000000',
      'circle-opacity': 0.88,
    },
  });
  addLayerSafe(map, {
    id: 'golf-gps-yards-text',
    type: 'symbol',
    source: SRC_GPS_GUIDE,
    filter: ['==', ['get', 'kind'], 'callout-yards'],
    layout: {
      'text-field': ['get', 'yardsText'],
      'text-size': 14,
      'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
      'text-anchor': 'center',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#ffffff',
    },
  });
  addLayerSafe(map, {
    id: 'golf-gps-club-pill',
    type: 'circle',
    source: SRC_GPS_GUIDE,
    filter: ['==', ['get', 'kind'], 'callout-club'],
    paint: {
      'circle-radius': 22,
      'circle-color': '#ffffff',
      'circle-opacity': 0.96,
    },
  });
  addLayerSafe(map, {
    id: LYR_GPS_GUIDE_LABEL,
    type: 'symbol',
    source: SRC_GPS_GUIDE,
    filter: ['==', ['get', 'kind'], 'callout-club'],
    layout: {
      'text-field': ['get', 'clubText'],
      'text-size': 11,
      'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
      'text-anchor': 'center',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-line-height': 1.05,
    },
    paint: {
      'text-color': '#111111',
    },
  });
  addLayerSafe(map, {
    id: 'golf-gps-crosshair',
    type: 'circle',
    source: SRC_GPS_GUIDE,
    filter: ['==', ['get', 'kind'], 'crosshair'],
    paint: {
      'circle-radius': 16,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#ffffff',
    },
  });
  addLayerSafe(map, {
    id: 'golf-gps-crosshair-dot',
    type: 'circle',
    source: SRC_GPS_GUIDE,
    filter: ['==', ['get', 'kind'], 'crosshair'],
    paint: {
      'circle-radius': 3.5,
      'circle-color': '#ffffff',
    },
  });
}

export function GolfMap({
  lat,
  lon,
  holes,
  activeHole,
  onSelectHole,
  target = null,
  arcClubs = [],
  onSetTarget,
  playLines = null,
  windFromDeg,
  windMph,
  headwindMph,
  crosswindMph,
  holeUp = true,
  className = '',
  compactControls = false,
  showWindLegend = true,
  fitPadding = 60,
  legendClassName = 'left-3 top-3',
  onReady,
  trackedShots = [],
  gpsPosition = null,
  gpsAccuracyM = null,
  gpsHeadingDeg = null,
  followGps = false,
  planningMode = 'tee',
  satelliteCached = false,
  courseName = null,
  greens3d = false,
  gpsClubs = null,
  rangefinderFrom = null,
  showRangefinder = false,
  rangefinderAim = null,
  rangefinderPlaysLikeYd = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<Array<() => void>>([]);
  const calloutMarkersRef = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelectHole);
  onSelectRef.current = onSelectHole;
  const fitPaddingRef = useRef(fitPadding);
  fitPaddingRef.current = fitPadding;
  const onSetTargetRef = useRef(onSetTarget);
  onSetTargetRef.current = onSetTarget;
  const showRangefinderRef = useRef(showRangefinder);
  showRangefinderRef.current = showRangefinder;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const satelliteCachedRef = useRef(satelliteCached);
  satelliteCachedRef.current = satelliteCached;
  const activeHoleRef = useRef(activeHole);
  activeHoleRef.current = activeHole;
  const green3dRef = useRef<GreenMeshCourse | null>(null);
  const green3dStateRef = useRef({
    course: null as GreenMeshCourse | null,
    activeHole: null as number | null,
    enabled: false,
  });
  green3dStateRef.current = {
    course: green3dRef.current,
    activeHole,
    enabled: greens3d,
  };
  const green3dSlug = greenMeshSlug(courseName);
  const canGreens3d = green3dSlug != null;

  // Layers only exist after `load`, so defer any data/camera work until then.
  const whenReady = useCallback((fn: () => void) => {
    if (readyRef.current) fn();
    else queueRef.current.push(fn);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    try {
      maplibregl.setMaxParallelImageRequests(32);
    } catch {
      // older maplibre
    }
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: GOLF_SATELLITE_STYLE as maplibregl.StyleSpecification,
        center: [lon, lat],
        zoom: 15.2,
        attributionControl: { compact: true },
        pitchWithRotate: true,
        touchPitch: true,
        maxPitch: 72,
        trackResize: true,
      });
    } catch (err) {
      console.error('Golf map failed to start', err);
      return;
    }
    if (!compactControls) {
      map.addControl(
        new maplibregl.NavigationControl({ visualizePitch: false }),
        'top-right',
      );
    }
    mapRef.current = map;

    const resize = () => {
      if (!mapRef.current) return;
      try {
        map.resize();
      } catch {
        // Map already removed.
      }
    };
    let lastW = 0;
    let lastH = 0;
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver((entries) => {
            const cr = entries[0]?.contentRect;
            if (!cr) return;
            if (cr.width === lastW && cr.height === lastH) return;
            lastW = cr.width;
            lastH = cr.height;
            resize();
          })
        : null;
    ro?.observe(container);
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);

    const onLoad = () => {
      map.addSource(SRC, { type: 'geojson', data: holesGeoJSON([], null) });
      map.addSource(SRC_TEE, {
        type: 'geojson',
        data: pointsGeoJSON([], 'tee'),
      });
      map.addSource(SRC_GREEN, {
        type: 'geojson',
        data: pointsGeoJSON([], 'green'),
      });
      map.addSource(SRC_FLOW, { type: 'geojson', data: emptyCollection() });
      map.addSource(SRC_SHOT, { type: 'geojson', data: emptyCollection() });
      map.addSource(SRC_ARCS, { type: 'geojson', data: emptyCollection() });
      map.addSource(SRC_TARGET_LINE, {
        type: 'geojson',
        data: emptyCollection(),
      });
      map.addSource(SRC_TARGET, { type: 'geojson', data: emptyCollection() });
      map.addSource(SRC_PLAY, { type: 'geojson', data: emptyCollection() });
      map.addSource(SRC_SHOT_TRACES, { type: 'geojson', data: emptyCollection() });
      map.addSource(SRC_SHOT_PTS, { type: 'geojson', data: emptyCollection() });
      map.addSource(SRC_GPS, { type: 'geojson', data: emptyCollection() });
      map.addSource(SRC_GPS_ACC, { type: 'geojson', data: emptyCollection() });
      map.addSource(SRC_GPS_HDG, { type: 'geojson', data: emptyCollection() });
      map.addSource(SRC_GPS_GUIDE, { type: 'geojson', data: emptyCollection() });

      // Fat invisible stroke first so tees/fairways are tappable on phones.
      map.addLayer({
        id: LINE_HIT,
        type: 'line',
        source: SRC,
        paint: {
          'line-color': '#ffffff',
          'line-width': 28,
          'line-opacity': 0.02,
        },
      });
      map.addLayer({
        id: LINE,
        type: 'line',
        source: SRC,
        filter: ['==', ['get', 'active'], 0],
        paint: {
          'line-color': '#f8fafc',
          'line-width': 2,
          'line-opacity': 0.55,
        },
      });
      map.addLayer({
        id: LINE_ACTIVE,
        type: 'line',
        source: SRC,
        filter: ['==', ['get', 'active'], 1],
        paint: {
          'line-color': '#ffffff',
          'line-width': 3,
          'line-opacity': 0.85,
        },
      });

      // Wind streamlines under the shot path so the ball line stays readable.
      map.addLayer({
        id: LYR_FLOW,
        type: 'line',
        source: SRC_FLOW,
        filter: ['==', ['get', 'kind'], 'flow'],
        paint: {
          'line-color': '#4dd9ff',
          'line-width': 2.4,
          'line-opacity': 0.85,
          'line-dasharray': [0, 4, 3, 0],
          'line-blur': 0.4,
        },
      });
      map.addLayer({
        id: LYR_FLOW_ARROW,
        type: 'line',
        source: SRC_FLOW,
        filter: ['==', ['get', 'kind'], 'arrow'],
        paint: {
          'line-color': '#4dd9ff',
          'line-width': 2.4,
          'line-opacity': 0.95,
        },
      });

      map.addLayer({
        id: LYR_AIM,
        type: 'line',
        source: SRC_SHOT,
        filter: ['==', ['get', 'kind'], 'aim'],
        paint: {
          'line-color': '#e2e8f0',
          'line-width': 1.4,
          'line-opacity': 0.5,
          'line-dasharray': [2, 2],
        },
      });
      map.addLayer({
        id: LYR_DRIFT,
        type: 'line',
        source: SRC_SHOT,
        filter: ['==', ['get', 'kind'], 'drift'],
        paint: {
          'line-color': '#ff8a3d',
          'line-width': 3.4,
          'line-opacity': 0.95,
        },
      });
      map.addLayer({
        id: LYR_LANDING,
        type: 'line',
        source: SRC_SHOT,
        filter: ['==', ['get', 'kind'], 'landing'],
        paint: {
          'line-color': '#ff8a3d',
          'line-width': 3,
          'line-opacity': 0.9,
        },
      });

      map.addLayer({
        id: LYR_ARCS,
        type: 'line',
        source: SRC_ARCS,
        paint: {
          'line-color': '#f8fafc',
          'line-width': 1.15,
          'line-opacity': 0.42,
          'line-dasharray': [2, 2.4],
        },
      });
      map.addLayer({
        id: LYR_CARRY,
        type: 'line',
        source: SRC_TARGET_LINE,
        filter: ['==', ['get', 'kind'], 'carry'],
        paint: {
          'line-color': '#22c55e',
          'line-width': 2.6,
          'line-opacity': 0.95,
        },
      });
      map.addLayer({
        id: LYR_REMAIN,
        type: 'line',
        source: SRC_TARGET_LINE,
        filter: ['==', ['get', 'kind'], 'remain'],
        paint: {
          'line-color': '#facc15',
          'line-width': 2.2,
          'line-opacity': 0.9,
          'line-dasharray': [2, 1.4],
        },
      });
      map.addLayer({
        id: LYR_TEE_HIT,
        type: 'circle',
        source: SRC_TEE,
        paint: {
          'circle-radius': 18,
          'circle-color': '#22c55e',
          'circle-opacity': 0.02,
        },
      });
      map.addLayer({
        id: LYR_GREEN_HIT,
        type: 'circle',
        source: SRC_GREEN,
        paint: {
          'circle-radius': 18,
          'circle-color': '#f8fafc',
          'circle-opacity': 0.02,
        },
      });
      map.addLayer({
        id: LYR_TEE,
        type: 'circle',
        source: SRC_TEE,
        paint: {
          'circle-radius': 6,
          'circle-color': '#22c55e',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#052e16',
        },
      });
      map.addLayer({
        id: LYR_GREEN,
        type: 'circle',
        source: SRC_GREEN,
        paint: {
          'circle-radius': 7,
          'circle-color': '#f8fafc',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0f172a',
        },
      });

      // GPS path/callouts before prep layers so they always exist in GPS mode.
      ensureGpsGuideLayers(map);

      map.addLayer({
        id: LYR_TARGET,
        type: 'circle',
        source: SRC_TARGET,
        paint: {
          'circle-radius': 7,
          'circle-color': '#f97316',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff7ed',
        },
      });

      map.addLayer({
        id: LYR_PLAY_TEE,
        type: 'line',
        source: SRC_PLAY,
        filter: ['==', ['get', 'kind'], 'tee'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['match', ['get', 'role'], 'start', 4.2, 'more', 2.4, 3.1],
          'line-opacity': 0.95,
        },
      });
      map.addLayer({
        id: LYR_PLAY_APP,
        type: 'line',
        source: SRC_PLAY,
        filter: ['==', ['get', 'kind'], 'approach'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['match', ['get', 'role'], 'start', 2.6, 'more', 1.6, 2.1],
          'line-opacity': 0.9,
          'line-dasharray': [2.2, 1.4],
        },
      });
      map.addLayer({
        id: LYR_PLAY_CHIP,
        type: 'line',
        source: SRC_PLAY,
        filter: ['==', ['get', 'kind'], 'chip'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['match', ['get', 'role'], 'start', 2.2, 'more', 1.4, 1.8],
          'line-opacity': 0.88,
          'line-dasharray': [1.2, 1.6],
        },
      });
      map.addLayer({
        id: LYR_PLAY_PUTT,
        type: 'line',
        source: SRC_PLAY,
        filter: ['==', ['get', 'kind'], 'putt'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['match', ['get', 'role'], 'start', 1.8, 'more', 1.2, 1.5],
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: LYR_PLAY_TICK,
        type: 'line',
        source: SRC_PLAY,
        filter: ['==', ['get', 'kind'], 'tick'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.4,
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: LYR_PLAY_LABEL,
        type: 'symbol',
        source: SRC_PLAY,
        filter: ['==', ['get', 'kind'], 'callout'],
        layout: {
          'text-field': ['get', 'callout'],
          'text-size': 12,
          'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
          'text-offset': [0, -0.7],
          'text-anchor': 'bottom',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#020617',
          'text-halo-width': 1.8,
        },
      });

      // Shot tracker layers
      map.addLayer({
        id: LYR_SHOT_TRACE,
        type: 'line',
        source: SRC_SHOT_TRACES,
        paint: {
          'line-color': '#f472b6',
          'line-width': 2.8,
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: LYR_SHOT_PT,
        type: 'circle',
        source: SRC_SHOT_PTS,
        paint: {
          'circle-radius': 8,
          'circle-color': '#f472b6',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: LYR_SHOT_LABEL,
        type: 'symbol',
        source: SRC_SHOT_PTS,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 10,
          'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });
      map.addLayer({
        id: LYR_GPS_ACC,
        type: 'fill',
        source: SRC_GPS_ACC,
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.14,
        },
      });
      map.addLayer({
        id: LYR_GPS_RING,
        type: 'circle',
        source: SRC_GPS,
        paint: {
          'circle-radius': 16,
          'circle-color': '#3b82f6',
          'circle-opacity': 0.18,
        },
      });
      map.addLayer({
        id: LYR_GPS_HDG,
        type: 'line',
        source: SRC_GPS_HDG,
        paint: {
          'line-color': '#93c5fd',
          'line-width': 3,
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: LYR_GPS,
        type: 'circle',
        source: SRC_GPS,
        paint: {
          'circle-radius': 7,
          'circle-color': '#3b82f6',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      const clickMap = (e: maplibregl.MapMouseEvent) => {
        // GPS / rangefinder: taps always move the aim so the white path updates.
        if (showRangefinderRef.current && onSetTargetRef.current) {
          if (activeHoleRef.current != null) {
            onSetTargetRef.current({ lat: e.lngLat.lat, lon: e.lngLat.lng });
            return;
          }
        }
        const markerHits = map.queryRenderedFeatures(e.point, {
          layers: [LYR_TEE_HIT, LYR_GREEN_HIT, LYR_TEE, LYR_GREEN],
        });
        if (markerHits.length > 0) {
          const n = holeNumberFromFeature(markerHits[0]?.properties?.number);
          if (n != null) {
            onSelectRef.current?.(n);
            return;
          }
        }
        // With a hole selected, map taps move the target — don't let the fat
        // centerline hit area steal the click to re-select the same hole.
        if (activeHoleRef.current != null && onSetTargetRef.current) {
          onSetTargetRef.current({ lat: e.lngLat.lat, lon: e.lngLat.lng });
          return;
        }
        const hits = map.queryRenderedFeatures(e.point, { layers: CLICK_LAYERS });
        if (hits.length > 0) {
          const n = holeNumberFromFeature(hits[0]?.properties?.number);
          if (n != null) onSelectRef.current?.(n);
        }
      };
      map.on('click', clickMap);
      for (const id of CLICK_LAYERS) {
        map.on('mouseenter', id, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', id, () => {
          map.getCanvas().style.cursor = activeHoleRef.current != null ? 'crosshair' : '';
        });
      }

      resize();
      attachGreen3DLayer(map, () => green3dStateRef.current);
      readyRef.current = true;
      const signalReady = () => onReadyRef.current?.();
      // Don't wait for every peripheral tile — show the map as soon as the
      // first full frame paints (or a short cap), so satellite feels instant.
      let signaled = false;
      const done = () => {
        if (signaled) return;
        signaled = true;
        signalReady();
      };
      if (satelliteCachedRef.current) {
        done();
      } else {
        map.once('idle', done);
        map.once('render', () => {
          window.setTimeout(done, 280);
        });
        window.setTimeout(done, 900);
      }
      const queued = queueRef.current;
      queueRef.current = [];
      for (const fn of queued) fn();
    };

    map.on('load', onLoad);

    return () => {
      readyRef.current = false;
      queueRef.current = [];
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      clearCalloutMarkers(calloutMarkersRef.current);
      map.remove();
      mapRef.current = null;
    };
    // Mount once; data updates run in the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!green3dSlug) {
      green3dRef.current = null;
      mapRef.current?.triggerRepaint();
      return;
    }
    let cancelled = false;
    loadGreenMeshCourse(green3dSlug).then((course) => {
      if (cancelled) return;
      green3dRef.current = course;
      mapRef.current?.triggerRepaint();
    });
    return () => {
      cancelled = true;
    };
  }, [green3dSlug]);

  useEffect(() => {
    mapRef.current?.triggerRepaint();
  }, [greens3d, activeHole]);

  // Animate the streamlines so the flow direction reads at a glance.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let step = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 90) {
        last = now;
        step = (step + 1) % DASH_STEPS.length;
        if (map.getLayer(LYR_FLOW)) {
          map.setPaintProperty(LYR_FLOW, 'line-dasharray', DASH_STEPS[step]);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    whenReady(() => {
      const map = mapRef.current;
      if (!map) return;
      // GPS rangefinder: drop static tee→green centerlines (yardageless /
      // unmovable). Keep markers for the active hole only. Prefer emptying
      // sources over setLayoutProperty/setFilter so a style error can't
      // abort later effects that paint the movable yardage path.
      (map.getSource(SRC) as maplibregl.GeoJSONSource | undefined)?.setData(
        showRangefinder
          ? emptyCollection()
          : holesGeoJSON(holes, activeHole),
      );
      const markerHoles =
        showRangefinder && activeHole != null
          ? holes.filter((h) => Number(h.number) === Number(activeHole))
          : holes;
      (map.getSource(SRC_TEE) as maplibregl.GeoJSONSource | undefined)?.setData(
        pointsGeoJSON(markerHoles, 'tee'),
      );
      (
        map.getSource(SRC_GREEN) as maplibregl.GeoJSONSource | undefined
      )?.setData(pointsGeoJSON(markerHoles, 'green'));
    });
  }, [holes, activeHole, showRangefinder, whenReady]);

  // Camera: frame the whole course, or fly down the selected hole.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const hole = holes.find((h) => h.number === activeHole);

    const move = () => {
      if (hole) {
        const greenMesh = green3dRef.current?.greens.find(
          (g) => g.hole === hole.number,
        );
        const aim = greenMesh
          ? { lon: greenMesh.lon, lat: greenMesh.lat }
          : { lon: hole.green.lon, lat: hole.green.lat };
        const useGreen = greens3d && greenMesh;
        const mid: [number, number] = useGreen
          ? [aim.lon, aim.lat]
          : [
              (hole.tee.lon + hole.green.lon) / 2,
              (hole.tee.lat + hole.green.lat) / 2,
            ];
        const zoom = useGreen
          ? 18.1
          : hole.yards > 520
            ? 15.4
            : hole.yards > 380
              ? 15.9
              : 16.4;
        map.easeTo({
          center: mid,
          zoom,
          pitch: useGreen ? 55 : 0,
          bearing: holeUp ? hole.bearingDeg : 0,
          duration: 700,
        });
        return;
      }
      if (holes.length) {
        const b = new maplibregl.LngLatBounds();
        for (const h of holes) {
          b.extend([h.tee.lon, h.tee.lat]);
          b.extend([h.green.lon, h.green.lat]);
        }
        map.easeTo({ bearing: 0, duration: 300 });
        map.fitBounds(b, {
          padding: fitPaddingRef.current,
          maxZoom: 17,
          duration: 700,
        });
      } else {
        map.easeTo({ center: [lon, lat], duration: 600 });
      }
    };

    whenReady(move);
    // Course-level recentering is driven by lat/lon; hole framing by activeHole.
  }, [holes, activeHole, holeUp, lat, lon, whenReady, greens3d]);

  // Wind streamlines + predicted shot path for the selected hole.
  useEffect(() => {
    whenReady(() => {
      const map = mapRef.current;
      if (!map) return;
      const hole =
        holes.find((h) => Number(h.number) === Number(activeHole)) ?? null;
      (
        map.getSource(SRC_FLOW) as maplibregl.GeoJSONSource | undefined
      )?.setData(
        showRangefinder
          ? emptyCollection()
          : windFlowGeoJSON(hole, windFromDeg, windMph),
      );
      (
        map.getSource(SRC_SHOT) as maplibregl.GeoJSONSource | undefined
      )?.setData(
        playLines && playLines.features.length
          ? emptyCollection()
          : showRangefinder
            ? emptyCollection()
            : shotPathGeoJSON(hole, crosswindMph, headwindMph),
      );
    });
  }, [
    holes,
    activeHole,
    windFromDeg,
    windMph,
    headwindMph,
    crosswindMph,
    playLines,
    showRangefinder,
    whenReady,
  ]);

  useEffect(() => {
    whenReady(() => {
      const map = mapRef.current;
      if (!map) return;
      const hole =
        holes.find((h) => Number(h.number) === Number(activeHole)) ?? null;
      const tee = hole ? { lon: hole.tee.lon, lat: hole.tee.lat } : null;
      const green = hole
        ? { lon: hole.green.lon, lat: hole.green.lat }
        : null;

      (
        map.getSource(SRC_ARCS) as maplibregl.GeoJSONSource | undefined
      )?.setData(bagRingsGeoJSON(tee, hole ? arcClubs : []));
      // In GPS mode the guide effect owns SRC_TARGET_LINE (fallback path).
      if (!showRangefinder) {
        (
          map.getSource(SRC_TARGET_LINE) as maplibregl.GeoJSONSource | undefined
        )?.setData(
          playLines && playLines.features.length
            ? emptyCollection()
            : targetLineGeoJSON(tee, hole ? target : null, green, planningMode),
        );
        if (map.getLayer(LYR_CARRY)) {
          map.setPaintProperty(LYR_CARRY, 'line-color', '#22c55e');
          map.setPaintProperty(LYR_CARRY, 'line-width', 2.6);
        }
        if (map.getLayer(LYR_REMAIN)) {
          map.setPaintProperty(LYR_REMAIN, 'line-color', '#facc15');
          map.setPaintProperty(LYR_REMAIN, 'line-width', 2.2);
        }
      }
      (
        map.getSource(SRC_PLAY) as maplibregl.GeoJSONSource | undefined
      )?.setData(playLines ?? emptyCollection());
      (
        map.getSource(SRC_TARGET) as maplibregl.GeoJSONSource | undefined
      )?.setData(
        showRangefinder
          ? emptyCollection()
          : targetPointGeoJSON(hole ? target : null),
      );
      map.getCanvas().style.cursor =
        hole && onSetTargetRef.current ? 'crosshair' : '';
    });
  }, [
    holes,
    activeHole,
    target,
    arcClubs,
    playLines,
    planningMode,
    showRangefinder,
    whenReady,
  ]);

  // Shot tracker traces + landing points
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    whenReady(() => {
      (
        map.getSource(SRC_SHOT_TRACES) as maplibregl.GeoJSONSource | undefined
      )?.setData(shotTracesGeoJSON(trackedShots));
      (
        map.getSource(SRC_SHOT_PTS) as maplibregl.GeoJSONSource | undefined
      )?.setData(shotPointsGeoJSON(trackedShots));
    });
  }, [trackedShots, whenReady]);

  // Live GPS position, accuracy ring, and heading tick
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    whenReady(() => {
      const data: GeoJSON.FeatureCollection = gpsPosition
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {
                  heading: gpsHeadingDeg ?? -1,
                },
                geometry: {
                  type: 'Point',
                  coordinates: [gpsPosition.lon, gpsPosition.lat],
                },
              },
            ],
          }
        : emptyCollection();
      (
        map.getSource(SRC_GPS) as maplibregl.GeoJSONSource | undefined
      )?.setData(data);

      const acc =
        gpsPosition && gpsAccuracyM != null && gpsAccuracyM > 0
          ? accuracyCircleGeoJSON(
              gpsPosition.lat,
              gpsPosition.lon,
              Math.min(gpsAccuracyM, 80),
            )
          : emptyCollection();
      (
        map.getSource(SRC_GPS_ACC) as maplibregl.GeoJSONSource | undefined
      )?.setData(acc);

      let hdg: GeoJSON.FeatureCollection = emptyCollection();
      if (
        gpsPosition &&
        gpsHeadingDeg != null &&
        Number.isFinite(gpsHeadingDeg)
      ) {
        const latRad = (gpsPosition.lat * Math.PI) / 180;
        const lenM = 28;
        const dLat = (lenM * Math.cos((gpsHeadingDeg * Math.PI) / 180)) / 111_320;
        const dLon =
          (lenM * Math.sin((gpsHeadingDeg * Math.PI) / 180)) /
          Math.max(1e-6, 111_320 * Math.cos(latRad));
        hdg = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [
                  [gpsPosition.lon, gpsPosition.lat],
                  [gpsPosition.lon + dLon, gpsPosition.lat + dLat],
                ],
              },
            },
          ],
        };
      }
      (
        map.getSource(SRC_GPS_HDG) as maplibregl.GeoJSONSource | undefined
      )?.setData(hdg);
    });
  }, [
    gpsPosition,
    gpsAccuracyM,
    gpsHeadingDeg,
    whenReady,
  ]);

  // GPS rangefinder path + callouts.
  // IMPORTANT: always queue via whenReady — do not early-return when mapRef
  // is still null or the guide never applies after the map finishes loading.
  useEffect(() => {
    whenReady(() => {
      const map = mapRef.current;
      if (!map) return;
      ensureGpsGuideLayers(map);
      const hole =
        holes.find((h) => Number(h.number) === Number(activeHole)) ?? null;
      const from =
        rangefinderFrom ??
        (hole ? { lat: hole.tee.lat, lon: hole.tee.lon } : null);
      const aim =
        rangefinderAim ??
        (hole ? { lat: hole.green.lat, lon: hole.green.lon } : null);
      const guide =
        showRangefinder && from && hole
          ? gpsGuideGeoJSON(from, hole, {
              frontClub: gpsClubs?.front ?? null,
              midClub: gpsClubs?.mid ?? null,
              backClub: gpsClubs?.back ?? null,
              maxYards: 900,
              aim,
              playsLikeYd: rangefinderPlaysLikeYd,
            })
          : emptyCollection();
      (
        map.getSource(SRC_GPS_GUIDE) as maplibregl.GeoJSONSource | undefined
      )?.setData(guide);
      syncGpsCalloutMarkers(map, guide, calloutMarkersRef.current);
      // Fallback onto prep carry/remain layers (registered before GPS) so a
      // missing guide layer still shows the white path between tee and green.
      if (showRangefinder) {
        (
          map.getSource(SRC_TARGET_LINE) as maplibregl.GeoJSONSource | undefined
        )?.setData(guideAsTargetLines(guide));
        if (map.getLayer(LYR_CARRY)) {
          map.setPaintProperty(LYR_CARRY, 'line-color', '#ffffff');
          map.setPaintProperty(LYR_CARRY, 'line-width', 4);
          map.setPaintProperty(LYR_CARRY, 'line-opacity', 1);
        }
        if (map.getLayer(LYR_REMAIN)) {
          map.setPaintProperty(LYR_REMAIN, 'line-color', '#ffffff');
          map.setPaintProperty(LYR_REMAIN, 'line-width', 3.2);
          map.setPaintProperty(LYR_REMAIN, 'line-opacity', 0.95);
        }
      } else {
        clearCalloutMarkers(calloutMarkersRef.current);
      }
      for (const id of [
        'golf-gps-whisker',
        'golf-gps-guide-casing',
        LYR_GPS_GUIDE,
        LYR_GPS_PIN,
        'golf-gps-crosshair',
        'golf-gps-crosshair-dot',
      ]) {
        if (map.getLayer(id)) {
          try {
            map.setLayoutProperty(id, 'visibility', 'visible');
            map.moveLayer(id);
          } catch {
            // Layer may not support layout visibility in older builds.
          }
        }
      }
      // Prefer HTML markers for yardage/club boxes; hide map symbol callouts.
      for (const id of [
        'golf-gps-yards-badge',
        'golf-gps-yards-text',
        'golf-gps-club-pill',
        LYR_GPS_GUIDE_LABEL,
        LYR_GPS_PIN_LABEL,
      ]) {
        if (map.getLayer(id)) {
          try {
            map.setLayoutProperty(id, 'visibility', 'none');
          } catch {
            // ignore
          }
        }
      }
    });
  }, [
    holes,
    activeHole,
    gpsClubs,
    rangefinderFrom,
    rangefinderAim,
    rangefinderPlaysLikeYd,
    showRangefinder,
    whenReady,
  ]);

  // Follow GPS — ease camera when the fix moves
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followGps || !gpsPosition) return;
    whenReady(() => {
      map.easeTo({
        center: [gpsPosition.lon, gpsPosition.lat],
        duration: 700,
        essential: true,
      });
    });
  }, [followGps, gpsPosition, whenReady]);

  const windLabel =
    windFromDeg != null
      ? `Wind ${windMph != null ? `${Math.round(windMph)} mph ` : ''}from ${Math.round(windFromDeg)}° ${bearingCompass(windFromDeg)}`
      : null;

  return (
    <div className={`relative h-full min-h-0 w-full overflow-hidden ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {showWindLegend && (windLabel || (greens3d && canGreens3d && activeHole != null)) && (
        <div
          className={`pointer-events-none absolute flex flex-col gap-1 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[11px] font-medium backdrop-blur-md ${legendClassName}`}
        >
          {windLabel ? <span className="text-cyan-200">{windLabel}</span> : null}
          {greens3d && canGreens3d && activeHole != null && (
            <span className="text-emerald-200">
              3D greens · LiDAR mesh · drag to tilt
            </span>
          )}
          {activeHole != null && (
            <span className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
              <span className="inline-block h-0.5 w-4 rounded bg-cyan-300" />
              wind
              <span className="ml-1 inline-block h-0.5 w-4 rounded bg-[#f8fafc]" />
              start
              <span className="ml-1 inline-block h-0.5 w-4 rounded bg-[#facc15]" />
              miss
              <span className="ml-1 inline-block h-0.5 w-4 rounded bg-[#fb7185]" />
              more
              <span className="text-[9px] text-[var(--ink-4)]">tap to move target</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
