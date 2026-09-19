import '../../src/index.css';
import React, { lazy, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useGolfCourses } from '../../src/hooks/useGolf';
const GolfMap = lazy(() => import('../../src/components/golf/GolfMap').then(m => ({ default: m.GolfMap })));
const Green3DViewer = lazy(() => import('../../src/components/golf/Green3DViewer').then(m => ({ default: m.Green3DViewer })));
const mesh = { id: 'test', name: 'Test green', lat: 47.6, lon: -122.3, gridM: 1, greens: [{ hole: 1, lat: 47.6, lon: -122.3, baseElevM: 0, positions: [-10,0,-10, 10,1,-10, 10,0,10, -10,0,10], indices: [0,1,2, 0,2,3] }] };
function Fixture() {
  const { courses, loading } = useGolfCourses(47.6, -122.3);
  const [showMap, setShowMap] = useState(false);
  const [showGreen, setShowGreen] = useState(false);
  const [ready, setReady] = useState(false);
  return <>
    <p data-testid="courses">{loading ? 'loading' : `${courses.length} courses`}</p>
    <button onClick={() => { setReady(false); setShowMap(v => !v); }}>{showMap ? 'Close map' : 'Open map'}</button>
    <button onClick={() => setShowGreen(true)}>Open green</button>
    {showGreen && <Suspense fallback={<p>Loading green</p>}><Green3DViewer course={mesh} hole={1} onClose={() => setShowGreen(false)} /></Suspense>}
    <p data-testid="map-status">{ready ? 'ready' : 'waiting'}</p>
    {showMap && <Suspense fallback={<p>Loading map</p>}><div style={{ width: '100%', height: 420, position: 'relative' }}>
      <GolfMap lat={47.6} lon={-122.3} holes={[]} activeHole={null} courseName="Augusta National Golf Club" greens3d={false} onReady={() => setReady(true)} className="fixture-map" />
    </div></Suspense>}
    <style>{`.fixture-map {height: 420px; position:relative} .fixture-map > div:first-child {position:absolute; inset:0}`}</style>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
