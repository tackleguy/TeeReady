import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GolfCourseSummary } from '../../lib/golf';

/** Clean light basemap — directory / locator style, not satellite. */
export const COURSES_LOCATOR_STYLE =
  'https://tiles.openfreemap.org/styles/positron';

const SRC = 'teeready-courses';
const LYR_CIRCLE = 'teeready-courses-circle';
const LYR_LABEL = 'teeready-courses-label';
const LYR_HIT = 'teeready-courses-hit';

function coursesGeoJSON(
  courses: GolfCourseSummary[],
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: courses.map((c) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [c.lon, c.lat],
      },
      properties: {
        id: c.id,
        name: c.name,
        holes: c.holes ?? null,
        access: c.access ?? 'unknown',
        selected: 0,
      },
    })),
  };
}

type Props = {
  lat: number;
  lon: number;
  courses: GolfCourseSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
  onReady?: () => void;
};

export function CoursesLocatorMap({
  lat,
  lon,
  courses,
  selectedId,
  onSelect,
  className = '',
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const coursesRef = useRef(courses);
  coursesRef.current = courses;
  const centerRef = useRef({ lat, lon });
  centerRef.current = { lat, lon };

  const applyCourses = (map: maplibregl.Map, list: GolfCourseSummary[]) => {
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    src?.setData(coursesGeoJSON(list));
    if (list.length) {
      const b = new maplibregl.LngLatBounds();
      for (const c of list) b.extend([c.lon, c.lat]);
      if (!b.isEmpty()) {
        map.fitBounds(b, {
          padding: { top: 72, right: 48, bottom: 220, left: 48 },
          maxZoom: 12.5,
          duration: 700,
        });
      }
    } else {
      map.easeTo({
        center: [centerRef.current.lon, centerRef.current.lat],
        zoom: 10.5,
        duration: 500,
      });
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: COURSES_LOCATOR_STYLE,
        center: [lon, lat],
        zoom: 10.5,
        attributionControl: { compact: true },
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        trackResize: true,
      });
    } catch (err) {
      console.error('Courses locator map failed to start', err);
      return;
    }

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: false }),
      'top-right',
    );
    mapRef.current = map;

    const resize = () => {
      try {
        map.resize();
      } catch {
        // removed
      }
    };
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => resize())
        : null;
    ro?.observe(container);
    window.addEventListener('resize', resize);

    map.on('load', () => {
      map.addSource(SRC, {
        type: 'geojson',
        data: coursesGeoJSON(coursesRef.current),
        promoteId: 'id',
      });

      map.addLayer({
        id: LYR_HIT,
        type: 'circle',
        source: SRC,
        paint: {
          'circle-radius': 22,
          'circle-opacity': 0,
        },
      });

      map.addLayer({
        id: LYR_CIRCLE,
        type: 'circle',
        source: SRC,
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            11,
            8,
          ],
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#1a5c3a',
            '#3d9970',
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        },
      });

      map.addLayer({
        id: LYR_LABEL,
        type: 'symbol',
        source: SRC,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.35],
          'text-anchor': 'top',
          'text-max-width': 10,
          'text-optional': true,
        },
        paint: {
          'text-color': '#141c24',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.4,
        },
      });

      readyRef.current = true;
      applyCourses(map, coursesRef.current);
      onReadyRef.current?.();
    });

    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (typeof id === 'string' && id) onSelectRef.current(id);
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', LYR_HIT, onClick);
    map.on('click', LYR_CIRCLE, onClick);
    map.on('mouseenter', LYR_HIT, onEnter);
    map.on('mouseleave', LYR_HIT, onLeave);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    applyCourses(map, courses);
  }, [courses, lat, lon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    for (const c of courses) {
      try {
        map.setFeatureState(
          { source: SRC, id: c.id },
          { selected: c.id === selectedId },
        );
      } catch {
        // source may not have feature yet
      }
    }
  }, [courses, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !selectedId) return;
    const course = courses.find((c) => c.id === selectedId);
    if (!course) return;
    map.easeTo({
      center: [course.lon, course.lat],
      zoom: Math.max(map.getZoom(), 11.5),
      duration: 550,
    });
  }, [selectedId, courses]);

  return (
    <div
      className={`relative h-full min-h-0 w-full overflow-hidden ${className}`}
    >
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
