/**
 * Geographic accuracy audit for local hole packs.
 *
 * Run: npx tsx scripts/audit-geo-accuracy.ts
 *      npm run audit:geo-accuracy
 *
 * Writes src/dev/geo-qa-summary.json for the /dev/geo-qa dashboard.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  annotateHolesGeo,
  flagDuplicateCourses,
  inspectCourseLocation,
  inspectLayoutGeo,
  type GeoConfidence,
  type GeoIssue,
} from '../src/lib/geoAccuracy.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOLES_DIR = join(ROOT, 'public/golf/holes');
const OUT = join(ROOT, 'src/dev/geo-qa-summary.json');

type Pack = {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  holes: Array<{
    number: number;
    tee?: { lat: number; lon: number } | null;
    green?: { lat: number; lon: number } | null;
    path?: Array<{ lat: number; lon: number }>;
    source?: string;
  }>;
};

type CourseRow = {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  holeCount: number;
  completeLayout: boolean;
  confidence: GeoConfidence;
  issues: GeoIssue[];
  issueCodes: string[];
};

function isFiniteCoord(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon)
  );
}

function isCompleteLayout(
  holes: Array<{ number: number }>,
): boolean {
  const count = holes.length;
  if (count !== 9 && count !== 18) return false;
  const nums = holes.map((h) => h.number).filter(Number.isFinite);
  for (let n = 1; n <= count; n += 1) {
    if (!nums.includes(n)) return false;
  }
  return true;
}

function worstConfidence(holes: ReturnType<typeof annotateHolesGeo>): GeoConfidence {
  const rank: Record<GeoConfidence, number> = {
    UNVERIFIED: 0,
    NEEDS_REVIEW: 1,
    HIGH_CONFIDENCE: 2,
    VERIFIED: 3,
  };
  let worst: GeoConfidence = 'VERIFIED';
  for (const h of holes) {
    const c = h.geo?.confidence ?? 'UNVERIFIED';
    if (rank[c] < rank[worst]) worst = c;
  }
  return holes.length ? worst : 'UNVERIFIED';
}

function main() {
  const files = readdirSync(HOLES_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'manifest.json',
  );
  const rows: CourseRow[] = [];
  const issueCounts = new Map<string, number>();
  const confCounts: Record<GeoConfidence, number> = {
    VERIFIED: 0,
    HIGH_CONFIDENCE: 0,
    NEEDS_REVIEW: 0,
    UNVERIFIED: 0,
  };
  let fabricatedTeeHoles = 0;
  let fabricatedTeeCourses = 0;
  let complete9 = 0;
  let complete18 = 0;
  let incompleteLayouts = 0;
  let emptyPacks = 0;
  let missingGreenHoles = 0;
  let missingTeeHoles = 0;
  let identicalTeeGreenHoles = 0;
  let invalidCoordHoles = 0;
  let parseErrors = 0;
  const parseErrorFiles: string[] = [];
  const emptyPackFiles: string[] = [];

  const packs: Pack[] = [];
  const fileSlugs = new Map<string, string[]>();

  for (const f of files) {
    const fileSlug = f.replace(/\.json$/, '');
    const list = fileSlugs.get(fileSlug) ?? [];
    list.push(f);
    fileSlugs.set(fileSlug, list);

    try {
      const pack = JSON.parse(readFileSync(join(HOLES_DIR, f), 'utf8')) as Pack;
      if (!pack?.holes?.length) {
        emptyPacks += 1;
        emptyPackFiles.push(f);
        continue;
      }
      pack.slug = pack.slug || fileSlug;
      packs.push(pack);
    } catch (err) {
      parseErrors += 1;
      parseErrorFiles.push(
        `${f}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const duplicateSlugs = [...fileSlugs.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([slug, names]) => ({ slug, files: names }));

  const packSlugCounts = new Map<string, number>();
  for (const p of packs) {
    packSlugCounts.set(p.slug, (packSlugCounts.get(p.slug) ?? 0) + 1);
  }
  const duplicatePackSlugs = [...packSlugCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([slug, count]) => ({ slug, count }));

  const dupes = flagDuplicateCourses(
    packs.map((p) => ({
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      slug: p.slug,
    })),
  );

  // Duplicate course pin coords (exact lat/lon match across different slugs)
  const pinKey = (lat: number, lon: number) =>
    `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
  const pinGroups = new Map<string, string[]>();
  for (const p of packs) {
    if (!isFiniteCoord(p.lat, p.lon)) continue;
    const k = pinKey(p.lat, p.lon);
    const g = pinGroups.get(k) ?? [];
    g.push(p.slug);
    pinGroups.set(k, g);
  }
  const duplicatePins = [...pinGroups.entries()]
    .filter(([, slugs]) => new Set(slugs).size > 1)
    .map(([coords, slugs]) => ({ coords, slugs: [...new Set(slugs)] }));

  for (const pack of packs) {
    // Pre-check missing / invalid coords before annotate (annotate expects coords)
    let packHasFabricated = false;
    for (const h of pack.holes) {
      const teeOk = h.tee && isFiniteCoord(h.tee.lat, h.tee.lon);
      const greenOk = h.green && isFiniteCoord(h.green.lat, h.green.lon);
      if (!teeOk) missingTeeHoles += 1;
      if (!greenOk) missingGreenHoles += 1;
      if (!teeOk || !greenOk) invalidCoordHoles += 1;
      else if (
        Math.abs(h.tee!.lat - h.green!.lat) < 1e-7 &&
        Math.abs(h.tee!.lon - h.green!.lon) < 1e-7
      ) {
        identicalTeeGreenHoles += 1;
      }
    }

    const holesForAnnotate = pack.holes.filter(
      (h) =>
        h.tee &&
        h.green &&
        isFiniteCoord(h.tee.lat, h.tee.lon) &&
        isFiniteCoord(h.green.lat, h.green.lon),
    ) as Array<{
      number: number;
      tee: { lat: number; lon: number };
      green: { lat: number; lon: number };
      path?: Array<{ lat: number; lon: number }>;
      source?: string;
    }>;

    const holes = annotateHolesGeo(holesForAnnotate);
    const issues: GeoIssue[] = [
      ...inspectCourseLocation({
        lat: pack.lat,
        lon: pack.lon,
        holes,
      }),
      ...inspectLayoutGeo(holes),
    ];

    if (!isFiniteCoord(pack.lat, pack.lon)) {
      issues.push({
        code: 'WATER_OR_NULL_ISLAND',
        detail: 'Course pack lat/lon is not finite.',
      });
    }

    for (const h of pack.holes) {
      if (!h.tee || !h.green) {
        issues.push({
          code: 'MISSING_TEE',
          detail: `Hole ${h.number} missing tee or green.`,
        });
      } else if (
        !isFiniteCoord(h.tee.lat, h.tee.lon) ||
        !isFiniteCoord(h.green.lat, h.green.lon)
      ) {
        issues.push({
          code: 'WATER_OR_NULL_ISLAND',
          detail: `Hole ${h.number} has non-finite coordinates.`,
        });
      }
    }

    for (const h of holes) {
      if (h.geo?.issues?.length) issues.push(...h.geo.issues);
      if (h.geo?.issues.some((i) => i.code === 'FABRICATED_TEE')) {
        fabricatedTeeHoles += 1;
        packHasFabricated = true;
      }
    }
    if (packHasFabricated) fabricatedTeeCourses += 1;

    const complete = isCompleteLayout(pack.holes);
    if (complete && pack.holes.length === 9) complete9 += 1;
    else if (complete && pack.holes.length === 18) complete18 += 1;
    else incompleteLayouts += 1;

    const confidence = issues.some((i) => i.code === 'FABRICATED_TEE')
      ? 'UNVERIFIED'
      : worstConfidence(holes);
    confCounts[confidence] += 1;
    for (const i of issues) {
      issueCounts.set(i.code, (issueCounts.get(i.code) ?? 0) + 1);
    }
    const issueCodes = [...new Set(issues.map((i) => i.code))];
    rows.push({
      slug: pack.slug,
      name: pack.name,
      lat: pack.lat,
      lon: pack.lon,
      holeCount: pack.holes.length,
      completeLayout: complete,
      confidence,
      issues,
      issueCodes,
    });
  }

  const inventory = {
    fileCount: files.length,
    packCount: packs.length,
    emptyPacks,
    parseErrors,
    layouts: {
      complete9,
      complete18,
      completeTotal: complete9 + complete18,
      incomplete: incompleteLayouts,
    },
    fabricatedTeeHoles,
    fabricatedTeeCourses,
    missingTeeHoles,
    missingGreenHoles,
    identicalTeeGreenHoles,
    invalidCoordHoles,
    duplicateFileSlugs: duplicateSlugs.length,
    duplicatePackSlugs: duplicatePackSlugs.length,
    duplicatePinGroups: duplicatePins.length,
    duplicateCourseNameFlags: dupes.length,
  };

  const worstOffenders = [...rows]
    .sort((a, b) => {
      const score = (r: CourseRow) =>
        r.issues.length * 10 +
        (r.confidence === 'UNVERIFIED' ? 100 : 0) +
        (r.completeLayout ? 0 : 50);
      return score(b) - score(a);
    })
    .slice(0, 10)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      holeCount: r.holeCount,
      completeLayout: r.completeLayout,
      confidence: r.confidence,
      issueCount: r.issues.length,
      topCodes: r.issueCodes.slice(0, 5),
    }));

  const summary = {
    builtAt: new Date().toISOString(),
    packCount: packs.length,
    fabricatedTeeHoles,
    confidence: confCounts,
    issueCounts: Object.fromEntries(
      [...issueCounts.entries()].sort((a, b) => b[1] - a[1]),
    ),
    inventory,
    duplicateFlags: dupes,
    duplicatePins: duplicatePins.slice(0, 50),
    duplicatePackSlugs,
    parseErrorFiles: parseErrorFiles.slice(0, 50),
    emptyPackFiles: emptyPackFiles.slice(0, 50),
    worstOffenders,
    needsQueue: rows
      .filter(
        (r) =>
          r.confidence === 'UNVERIFIED' ||
          r.confidence === 'NEEDS_REVIEW' ||
          r.issues.length > 0,
      )
      .sort((a, b) => b.issues.length - a.issues.length)
      .slice(0, 400),
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(summary, null, 2));

  console.log('=== Hole pack inventory audit ===');
  console.log(`Files scanned: ${files.length}`);
  console.log(`Packs with holes: ${packs.length}`);
  console.log(`Empty packs: ${emptyPacks}`);
  console.log(`Parse errors: ${parseErrors}`);
  console.log(
    `Complete layouts: 9-hole=${complete9}, 18-hole=${complete18}, incomplete=${incompleteLayouts}`,
  );
  console.log(
    `Fabricated-tee: ${fabricatedTeeHoles} holes across ${fabricatedTeeCourses} courses`,
  );
  console.log(
    `Missing tee/green: tee=${missingTeeHoles}, green=${missingGreenHoles}; identical tee=green=${identicalTeeGreenHoles}; invalid coords=${invalidCoordHoles}`,
  );
  console.log('Confidence:', confCounts);
  console.log('Top issue codes:', Object.fromEntries(
    [...issueCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
  ));
  console.log(
    `Duplicates: file-slugs=${duplicateSlugs.length}, pack-slugs=${duplicatePackSlugs.length}, pin-groups=${duplicatePins.length}, name-proximity=${dupes.length}`,
  );
  console.log('Worst offenders:');
  for (const w of worstOffenders) {
    console.log(
      `  - ${w.slug} (${w.holeCount}h, ${w.confidence}, ${w.issueCount} issues): ${w.topCodes.join(', ')}`,
    );
  }
  console.log(`Wrote ${OUT}`);
}

main();
