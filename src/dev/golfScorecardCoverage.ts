/**
 * Report how much of the OpenGolf bulk catalog is covered by curated scorecards.
 * Run: npm run audit:golf-coverage
 */

import { createGunzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { findScorecard } from '../../api/golf/_data/scorecards';
import { IMPORTED_SCORECARDS } from '../../api/golf/_data/importedScorecards';

const BULK_CACHE = resolve('scripts/.cache/opengolfapi-us.ndjson.gz');

type BulkCourse = {
  name: string;
  osmId?: number;
  par?: number;
  holes?: number;
};

async function readBulk(): Promise<BulkCourse[]> {
  const out: BulkCourse[] = [];
  const input = createReadStream(BULK_CACHE).pipe(createGunzip());
  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const props = JSON.parse(line).properties ?? {};
    out.push({
      name: String(props.name ?? ''),
      osmId: Number.isFinite(Number(props.osm_id)) ? Number(props.osm_id) : undefined,
      par: Number.isFinite(Number(props.par)) ? Number(props.par) : undefined,
      holes: Number.isFinite(Number(props.holes)) ? Number(props.holes) : undefined,
    });
  }
  return out;
}

async function main(): Promise<void> {
  const bulk = await readBulk();
  let nameHits = 0;
  let osmHits = 0;
  let bothHits = 0;
  const misses: string[] = [];

  for (const course of bulk) {
    if (!course.name) continue;
    const byName = findScorecard({ courseName: course.name });
    const byOsm =
      course.osmId != null ? findScorecard({ osmId: course.osmId }) : null;
    if (byName) nameHits += 1;
    if (byOsm) osmHits += 1;
    if (byName || byOsm) {
      if (byName && byOsm) bothHits += 1;
      continue;
    }
    if ((course.par ?? 0) >= 68 && misses.length < 25) {
      misses.push(`${course.name} (osm ${course.osmId ?? '?'})`);
    }
  }

  const importedOsm = new Set(
    IMPORTED_SCORECARDS.flatMap((card) => card.osmIds ?? []),
  );

  console.log(`Bulk catalog courses: ${bulk.length}`);
  console.log(`Imported scorecards: ${IMPORTED_SCORECARDS.length}`);
  console.log(`Imported with osmId: ${importedOsm.size}`);
  console.log(`Bulk matched by name: ${nameHits}`);
  console.log(`Bulk matched by osmId: ${osmHits}`);
  console.log(`Bulk matched by either: ${nameHits + osmHits - bothHits}`);
  console.log('');
  console.log('Sample unmatched 18+ par courses:');
  for (const line of misses) console.log(`  - ${line}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
