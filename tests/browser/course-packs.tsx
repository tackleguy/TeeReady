import '../../src/index.css';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Map as MapLibreMap } from 'maplibre-gl';
import { GolfView } from '../../src/routes/GolfView';
const maps: MapLibreMap[] = [];
(window as unknown as { testMaps: MapLibreMap[] }).testMaps = maps;
const addSource = MapLibreMap.prototype.addSource;
MapLibreMap.prototype.addSource = function (...args) {
  if (!maps.includes(this)) maps.push(this);
  return addSource.apply(this, args);
};
createRoot(document.getElementById('root')!).render(<BrowserRouter><div className="app-shell"><header style={{ height: 52 }}>TeeReady · Prep</header><div className="app-body"><main className="app-main rounds"><GolfView /></main></div></div></BrowserRouter>);
