import { setWorkerUrl, setWorkerCount, setMaxParallelImageRequests } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// Bundle the v6 module worker and its imports explicitly; relative library URLs
// otherwise point at missing files after Vite optimization/build.
setWorkerUrl(workerUrl);
setWorkerCount(1);
setMaxParallelImageRequests(6);
