/** Small, versioned list metadata ships with the UI; geometry stays on demand. */
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const read = async kind => JSON.parse(await readFile(`public/golf/${kind}/manifest.json`, 'utf8')).courses;
const [holes, greens] = await Promise.all([read('holes'), read('greens')]);
const valid = e => typeof e.slug === 'string' && typeof e.name === 'string' && Number.isFinite(e.lat) && Number.isFinite(e.lon) && (e.holes === 9 || e.holes === 18);
const tuple = e => [e.slug, e.name, Number(e.lat.toFixed(6)), Number(e.lon.toFixed(6)), e.holes];
const greenNames = new Set(greens.map(e => e.name.toLowerCase()));
const data = { courses: holes.filter(valid).map(e => [...tuple(e), greenNames.has(e.name.toLowerCase()) ? 1 : 0]), greens: greens.filter(valid).map(tuple) };
if (!data.courses.length) throw new Error('Course directory is empty');
const json = JSON.stringify(data) + '\n';
await writeFile('src/data/course-directory.json', json);
console.log(`Course directory: ${data.courses.length} courses, ${data.greens.length} 3D courses; ${(gzipSync(json).length / 1024).toFixed(0)} KiB gzip`);
