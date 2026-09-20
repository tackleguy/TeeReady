import '../../src/index.css';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Map as MapLibreMap } from 'maplibre-gl';
import { GolfMap } from '../../src/components/golf/GolfMap';
import { CoursesLocatorMap } from '../../src/components/golf/CoursesLocatorMap';
import type { GolfHole } from '../../src/lib/golf';
import pack from '../../public/golf/holes/augusta-national-golf-club.json';

// Observe real worker-rendered features, without altering the component's layout.
const maps: MapLibreMap[] = [];
(window as unknown as { testMaps: MapLibreMap[] }).testMaps = maps;
const addSource = MapLibreMap.prototype.addSource;
MapLibreMap.prototype.addSource = function (...args) {
  if (!maps.includes(this)) maps.push(this);
  return addSource.apply(this, args);
};
const courses = [{ id: `holepack:${pack.slug}`, name: pack.name, lat: pack.lat, lon: pack.lon, osmType: 'node' as const, osmId: 0, holes: 18 }];

function Fixture() {
  const [kind, setKind] = useState('golf');
  const [ready, setReady] = useState(false);
  return <>
    <button onClick={() => { setReady(false); setKind(kind === 'golf' ? 'locator' : 'golf'); }}>Switch map</button>
    <p data-testid="status">{ready ? 'ready' : 'loading'}</p>
    <div style={{ height: 500, position: 'relative' }}>
      {kind === 'golf' ? <GolfMap lat={pack.lat} lon={pack.lon} holes={pack.holes as GolfHole[]} activeHole={null} courseName={pack.name} onReady={() => setReady(true)} />
        : <CoursesLocatorMap lat={pack.lat} lon={pack.lon} courses={courses} selectedId={null} onSelect={() => {}} onReady={() => setReady(true)} />}
    </div>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
