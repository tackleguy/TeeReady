// Satellite hole view: hole paths, drawn wind streamlines, and the predicted
// wind-bent shot path for the selected hole.

import { useCallback, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GOLF_SATELLITE_STYLE, type GolfHole } from '../../lib/golf';
import {
  bagRingsGeoJSON,
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
  planningMode?: 'tee' | 'approach';
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
const LYR_SHOT_TRACE = 'golf-shot-trace-lyr';
const LYR_SHOT_PT = 'golf-shot-pt-lyr';
const LYR_SHOT_LABEL = 'golf-shot-label-lyr';
const LYR_GPS = 'golf-gps-lyr';
const LYR_GPS_RING = 'golf-gps-ring-lyr';

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
          active: active === h.number ? 1 : 0,
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
  planningMode = 'tee',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<Array<() => void>>([]);
  const onSelectRef = useRef(onSelectHole);
  onSelectRef.current = onSelectHole;
  const fitPaddingRef = useRef(fitPadding);
  fitPaddingRef.current = fitPadding;
  const onSetTargetRef = useRef(onSetTarget);
  onSetTargetRef.current = onSetTarget;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const activeHoleRef = useRef(activeHole);
  activeHoleRef.current = activeHole;

  // Layers only exist after `load`, so defer any data/camera work until then.
  const whenReady = useCallback((fn: () => void) => {
    if (readyRef.current) fn();
    else queueRef.current.push(fn);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: GOLF_SATELLITE_STYLE as maplibregl.StyleSpecification,
        center: [lon, lat],
        zoom: 15.2,
        attributionControl: { compact: true },
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
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
          'text-font': ['Open Sans Bold'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });
      map.addLayer({
        id: LYR_GPS_RING,
        type: 'circle',
        source: SRC_GPS,
        paint: {
          'circle-radius': 18,
          'circle-color': '#3b82f6',
          'circle-opacity': 0.15,
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
        const hits = map.queryRenderedFeatures(e.point, { layers: CLICK_LAYERS });
        if (hits.length > 0) {
          const n = holeNumberFromFeature(hits[0]?.properties?.number);
          const active = activeHoleRef.current;
          if (n != null && (active == null || n !== active || !onSetTargetRef.current)) {
            onSelectRef.current?.(n);
            return;
          }
        }
        if (activeHoleRef.current == null) return;
        onSetTargetRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
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
      readyRef.current = true;
      onReadyRef.current?.();
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
      map.remove();
      mapRef.current = null;
    };
    // Mount once; data updates run in the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const map = mapRef.current;
    if (!map) return;
    whenReady(() => {
      (map.getSource(SRC) as maplibregl.GeoJSONSource | undefined)?.setData(
        holesGeoJSON(holes, activeHole),
      );
      (map.getSource(SRC_TEE) as maplibregl.GeoJSONSource | undefined)?.setData(
        pointsGeoJSON(holes, 'tee'),
      );
      (
        map.getSource(SRC_GREEN) as maplibregl.GeoJSONSource | undefined
      )?.setData(pointsGeoJSON(holes, 'green'));
    });
  }, [holes, activeHole, whenReady]);

  // Camera: frame the whole course, or fly down the selected hole.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const hole = holes.find((h) => h.number === activeHole);

    const move = () => {
      if (hole) {
        const mid: [number, number] = [
          (hole.tee.lon + hole.green.lon) / 2,
          (hole.tee.lat + hole.green.lat) / 2,
        ];
        // Longer holes need a wider frame to fit tee through green.
        const zoom =
          hole.yards > 520 ? 15.4 : hole.yards > 380 ? 15.9 : 16.4;
        map.easeTo({
          center: mid,
          zoom,
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
  }, [holes, activeHole, holeUp, lat, lon, whenReady]);

  // Wind streamlines + predicted shot path for the selected hole.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const hole = holes.find((h) => h.number === activeHole) ?? null;

    whenReady(() => {
      (
        map.getSource(SRC_FLOW) as maplibregl.GeoJSONSource | undefined
      )?.setData(windFlowGeoJSON(hole, windFromDeg, windMph));
      (
        map.getSource(SRC_SHOT) as maplibregl.GeoJSONSource | undefined
      )?.setData(
        playLines && playLines.features.length
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
    whenReady,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const hole = holes.find((h) => h.number === activeHole) ?? null;
    const tee = hole ? { lon: hole.tee.lon, lat: hole.tee.lat } : null;
    const green = hole
      ? { lon: hole.green.lon, lat: hole.green.lat }
      : null;

    whenReady(() => {
      (
        map.getSource(SRC_ARCS) as maplibregl.GeoJSONSource | undefined
      )?.setData(bagRingsGeoJSON(tee, hole ? arcClubs : []));
      (
        map.getSource(SRC_TARGET_LINE) as maplibregl.GeoJSONSource | undefined
      )?.setData(
        playLines && playLines.features.length
          ? emptyCollection()
          : targetLineGeoJSON(tee, hole ? target : null, green, planningMode),
      );
      (
        map.getSource(SRC_PLAY) as maplibregl.GeoJSONSource | undefined
      )?.setData(playLines ?? emptyCollection());
      (
        map.getSource(SRC_TARGET) as maplibregl.GeoJSONSource | undefined
      )?.setData(targetPointGeoJSON(hole ? target : null));
      map.getCanvas().style.cursor =
        hole && onSetTargetRef.current ? 'crosshair' : '';
    });
  }, [holes, activeHole, target, arcClubs, playLines, planningMode, whenReady]);

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

  // Live GPS position blue dot
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
                properties: {},
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
    });
  }, [gpsPosition, whenReady]);

  const windLabel =
    windFromDeg != null
      ? `Wind ${windMph != null ? `${Math.round(windMph)} mph ` : ''}from ${Math.round(windFromDeg)}° ${bearingCompass(windFromDeg)}`
      : null;

  return (
    <div className={`relative h-full min-h-0 w-full overflow-hidden ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {showWindLegend && windLabel && (
        <div
          className={`pointer-events-none absolute flex flex-col gap-1 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[11px] font-medium backdrop-blur-md ${legendClassName}`}
        >
          <span className="text-cyan-200">{windLabel}</span>
          {activeHole != null && (
            <span className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
              <span className="inline-block h-0.5 w-4 rounded bg-cyan-300" />
              wind
              <span className="ml-1 inline-block h-0.5 w-4 rounded bg-emerald-400" />
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
