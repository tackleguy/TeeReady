/**
 * Derive hole packs from existing OSM backups (no Overpass / holes API).
 *
 * Run:
 *   npx tsx scripts/derive-holes-from-osm.ts
 *   npx tsx scripts/derive-holes-from-osm.ts --limit=50
 *   npx tsx scripts/derive-holes-from-osm.ts --only=abacoa-golf-club
 *   npx tsx scripts/derive-holes-from-osm.ts --cleanup-artifacts
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveHolesFromOsmElements } from '../api/golf/holes.ts';
import { isNineCombinationArtifact } from './lib/catalogFixes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OSM_DIR = join(ROOT, 'public/golf/osm');
const HOLES_DIR = join(ROOT, 'public/golf/holes');
const DATA_DIR = join(ROOT, 'data/osm-backup');

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const only: string[] = [];
  let limit = Infinity;
  for (const a of argv) {
    if (a === '--cleanup-artifacts') flags.add('cleanup-artifacts');
    else if (a.startsWith('--limit=')) limit = Number(a.slice(8)) || limit;
    else if (a.startsWith('--only=')) only.push(a.slice(7));
    else if (!a.startsWith('-')) only.push(a);
  }
  return { flags, only, limit };
}

function isCompleteLayout(holes: { number: number }[]): boolean {
  if (!holes.length) return false;
  const nums = holes.map((h) => h.number).filter((n) => Number.isFinite(n));
  if (nums.length !== 9 && nums.length !== 18) return false;
  const target = nums.length;
  for (let n = 1; n <= target; n += 1) {
    if (!nums.includes(n)) return false;
  }
  return true;
}

function compactHole(h: Record<string, unknown>) {
  const out: Record<string, unknown> = {
    number: h.number,
    yards: h.yards,
    bearingDeg: h.bearingDeg,
    tee: h.tee,
    green: h.green,
    source: h.source || 'hole-way',
  };
  if (h.name) out.name = h.name;
  if (h.par != null) out.par = h.par;
  if (h.loop) out.loop = h.loop;
  if (h.strokeIndex != null) out.strokeIndex = h.strokeIndex;
  if (h.provenance) out.provenance = h.provenance;
  if (Array.isArray(h.path) && h.path.length >= 2) out.path = h.path;
  if (Array.isArray(h.tees) && h.tees.length) out.tees = h.tees;
  return out;
}

function writeHolesManifest() {
  const files = readdirSync(HOLES_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'manifest.json',
  );
  const courses: Array<Record<string, unknown>> = [];
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(HOLES_DIR, f), 'utf8'));
      const holes = data.holes ?? [];
      if (!isCompleteLayout(holes)) continue;
      courses.push({
        slug: data.slug || f.replace(/\.json$/, ''),
        name: data.name,
        lat: data.lat,
        lon: data.lon,
        holes: holes.length,
        holeNumbers: holes.map((h: { number: number }) => h.number).sort(
          (a: number, b: number) => a - b,
        ),
        provenance: data.provenance ?? holes[0]?.provenance ?? 'geometric',
        hasScorecard: Boolean(
          data.hasScorecard ||
            holes.some(
              (h: { provenance?: string; strokeIndex?: number }) =>
                h.provenance === 'official' || h.strokeIndex != null,
            ),
        ),
        builtAt: data.builtAt,
      });
    } catch {
      /* skip */
    }
  }
  courses.sort((a, b) =>
    String(a.name).localeCompare(String(b.name)),
  );
  writeFileSync(
    join(HOLES_DIR, 'manifest.json'),
    JSON.stringify({
      version: 1,
      builtAt: new Date().toISOString(),
      count: courses.length,
      courses,
    }),
  );
  return courses.length;
}

function main() {
  const { flags, only, limit } = parseArgs(process.argv.slice(2));
  mkdirSync(HOLES_DIR, { recursive: true });

  const want = new Set(only.map((s) => s.toLowerCase()));
  const osmFiles = readdirSync(OSM_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'manifest.json',
  );

  let ok = 0;
  let incomplete = 0;
  let skipped = 0;
  let artifacts = 0;
  let processed = 0;

  for (const f of osmFiles) {
    if (processed >= limit) break;
    const slug = f.replace(/\.json$/, '');
    if (want.size && !want.has(slug.toLowerCase())) continue;

    const osmPath = join(OSM_DIR, f);
    const holePath = join(HOLES_DIR, `${slug}.json`);
    const pack = JSON.parse(readFileSync(osmPath, 'utf8'));
    const name = pack.name || slug;

    if (isNineCombinationArtifact(name)) {
      artifacts += 1;
      if (flags.has('cleanup-artifacts')) {
        unlinkSync(osmPath);
        if (existsSync(holePath)) unlinkSync(holePath);
        console.log(`artifact removed: ${slug}`);
      }
      continue;
    }

    if (existsSync(holePath)) {
      try {
        const existing = JSON.parse(readFileSync(holePath, 'utf8'));
        if (isCompleteLayout(existing.holes ?? [])) {
          skipped += 1;
          continue;
        }
      } catch {
        /* rewrite */
      }
    }

    processed += 1;
    const elements = pack.elements ?? [];
    if (!elements.length) {
      incomplete += 1;
      continue;
    }

    const holes = deriveHolesFromOsmElements(elements, { courseName: name });
    if (!isCompleteLayout(holes)) {
      incomplete += 1;
      console.log(
        `incomplete: ${slug} (${holes.length} holes, need complete 9/18)`,
      );
      continue;
    }

    const out = {
      version: 1,
      slug,
      name,
      lat: pack.lat,
      lon: pack.lon,
      holes: holes.map((h) => compactHole(h as Record<string, unknown>)),
      count: holes.length,
      provenance: holes[0]?.provenance ?? 'geometric',
      hasScorecard: holes.some(
        (h) => h.provenance === 'official' || h.strokeIndex != null,
      ),
      source: 'osm-backup',
      attribution: '© OpenStreetMap contributors (ODbL)',
      builtAt: new Date().toISOString(),
    };
    writeFileSync(holePath, JSON.stringify(out));
    ok += 1;
    console.log(`ok: ${slug} (${holes.length} holes)`);
  }

  const manifestCount = writeHolesManifest();
  mkdirSync(DATA_DIR, { recursive: true });
  copyFileSync(
    join(HOLES_DIR, 'manifest.json'),
    join(DATA_DIR, 'holes-manifest.json'),
  );
  if (existsSync(join(OSM_DIR, 'manifest.json'))) {
    const osmManifest = JSON.parse(
      readFileSync(join(OSM_DIR, 'manifest.json'), 'utf8'),
    );
    writeFileSync(
      join(DATA_DIR, 'manifest.json'),
      JSON.stringify({
        version: 1,
        builtAt: new Date().toISOString(),
        purpose:
          'Local OSM server-failure fallback. Runtime reads public/golf/osm + public/golf/holes.',
        osm: { dir: 'public/golf/osm', count: osmManifest.count ?? 0 },
        holes: { dir: 'public/golf/holes', count: manifestCount },
        reRun: 'node --import tsx scripts/backup-osm-data.mjs --skip-existing',
      }),
    );
  }
  console.log(
    `\nDerived ${ok} new hole packs (${incomplete} incomplete, ${skipped} already complete, ${artifacts} nine-combo artifacts)`,
  );
  console.log(`Holes manifest: ${manifestCount} complete layouts`);
}

main();
