import '../../src/index.css';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {GolfView} from '../../src/routes/GolfView';
createRoot(document.getElementById('root')!).render(<BrowserRouter><div className="app-shell"><header style={{height:52,padding:'12px 20px',borderBottom:'1px solid var(--line)',flexShrink:0}}>TeeReady · Prep</header><div className="app-body"><main className="app-main rounds"><GolfView/></main></div></div></BrowserRouter>);
