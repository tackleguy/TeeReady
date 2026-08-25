/**
 * Phase A — course data quality audit (read-only).
 * Run: npm run audit:course-data
 */

import { createWriteStream, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isClubSibling } from '../../api/golf/_lib/courseRelate';
import { haversineYards } from '../../api/golf/_lib/geo';
import {
  normalizeCourseName,
  parTemplate,
  scorecardFromCatalogEntry,
  validParForHoles,
  validYardageForHoles,
} from '../../api/golf/_lib/syntheticScorecard';
import { findScorecard, type CourseScorecard } from '../../api/golf/_data/scorecards';
import type { UsCatalogEntry } from '../../api/golf/_data/usCatalog';
import { classifyCourseType } from '../../api/golf/_lib/courseType';
import { formatCatalogRegion } from '../../api/golf/_lib/catalogRegion';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isInUnitedStates, stateAtPoint, regionFromCoords } =
  require('../../scripts/lib/regionLookup.mjs') as {
    isInUnitedStates: (lat: number, lon: number) => boolean;
    stateAtPoint: (lat: number, lon: number) => string | null;
    regionFromCoords: (lat: number, lon: number) => {
      co: string | null;
      st?: string;
      pr?: string;
    };
  };
const { isValidUsStateCode } = require('../../scripts/lib/usStateLookup.mjs') as {
  isValidUsStateCode: (st: string) => boolean;
};

type Severity = 'error' | 'warn' | 'info';

type AuditFinding = {
  checkId: string;
  severity: Severity;
  course: string;
  lat: number;
  lon: number;
  region: string;
  detail: string;
  values?: Record<string, string | number | boolean | null>;
};

type PublicRow = {
  n: string;
  la: number;
  lo: number;
  r?: string;
  co?: string;
  h?: number;
  p?: number;
  typ?: string;
  q?: 1;
};

type CourseType = 'regulation' | 'executive' | 'par3' | 'unknown';

const KM_PER_MI = 1.609_344;

function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  return haversineYards(aLat, aLon, bLat, bLon) / 1760 / KM_PER_MI;
}

function regionOf(entry: UsCatalogEntry, pub?: PublicRow): string {
  if (pub?.r) return pub.r;
  return formatCatalogRegion(entry) ?? '';
}

function addFinding(
  out: AuditFinding[],
  checkId: string,
  severity: Severity,
  entry: UsCatalogEntry,
  pub: PublicRow | undefined,
  detail: string,
  values?: AuditFinding['values'],
): void {
  out.push({
    checkId,
    severity,
    course: entry.n,
    lat: entry.la,
    lon: entry.lo,
    region: regionOf(entry, pub),
    detail,
    values,
  });
}

export { classifyCourseType };

function isMangledName(name: string): string | null {
  if (/^\d/.test(name.trim())) return 'name-starts-with-digit';
  if (/^\d+\s+at\s+/i.test(name)) return 'name-num-at-club';
  if (/\bthe\s*$/i.test(name.trim())) return 'name-trailing-the';
  const norm = normalizeCourseName(name);
  const doubled = norm.match(/\b(\w{4,})\s+\1\b/);
  if (doubled) return 'name-doubled-token';
  return null;
}

function parYardageMismatch(par: number, yards: number): string | null {
  if (par === 3 && yards > 280) return 'par3-over-280y';
  if (par === 4 && (yards < 200 || yards > 520)) return 'par4-out-of-range';
  if (par === 5 && yards < 420) return 'par5-under-420y';
  return null;
}

function holeHasCardYardage(hole: { back?: number; mid?: number; front?: number }): boolean {
  return (hole.back ?? 0) > 0 || (hole.mid ?? 0) > 0 || (hole.front ?? 0) > 0;
}

function auditScorecardYardages(
  findings: AuditFinding[],
  entry: UsCatalogEntry,
  pub: PublicRow | undefined,
  card: CourseScorecard,
  checkPrefix: string,
): void {
  const cardYards = card.holes
    .map((h) => h.back ?? h.mid ?? h.front ?? 0)
    .filter((y) => y > 0);
  if (!cardYards.length) return;

  const sum = cardYards.reduce((a, b) => a + b, 0);
  if (entry.y != null && sum > 0) {
    const deltaPct = Math.abs(sum - entry.y) / entry.y;
    if (deltaPct > 0.03) {
      addFinding(
        findings,
        `${checkPrefix}-total-yardage-drift`,
        'warn',
        entry,
        pub,
        `hole yardage sum ${sum} differs from stated total ${entry.y} by ${(deltaPct * 100).toFixed(1)}%`,
        { sum, stated: entry.y, deltaPct: Math.round(deltaPct * 1000) / 10 },
      );
    }
  }

  for (const hole of card.holes) {
    const yards = hole.back ?? hole.mid ?? hole.front;
    if (yards == null || yards <= 0) continue;
    const mismatch = parYardageMismatch(hole.par, yards);
    if (mismatch) {
      addFinding(
        findings,
        `${checkPrefix}-par-yardage`,
        'warn',
        entry,
        pub,
        `hole ${hole.hole}: par ${hole.par} with ${yards}y (${mismatch})`,
        { hole: hole.hole, par: hole.par, yards },
      );
    }
  }
}

function coordClusterKind(names: string[]): 'legitimate-facility' | 'duplicate-artifact' | 'mixed' {
  if (names.length < 2) return 'legitimate-facility';
  let allSiblings = true;
  for (let i = 1; i < names.length; i += 1) {
    if (!isClubSibling(names[0]!, names[i]!)) {
      allSiblings = false;
      break;
    }
  }
  if (allSiblings) return 'legitimate-facility';
  const unique = new Set(names.map(normalizeCourseName));
  if (unique.size < names.length) return 'duplicate-artifact';
  return 'mixed';
}

async function main(): Promise<void> {
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outPath =
    outArg?.slice('--out='.length) ??
    resolve('reports/course-data-audit.ndjson');

  const catalog = JSON.parse(
    readFileSync(resolve('api/golf/_data/usCatalog.json'), 'utf8'),
  ) as UsCatalogEntry[];

  const publicRows = JSON.parse(
    readFileSync(resolve('public/golf/catalog.us.json'), 'utf8'),
  ) as PublicRow[];

  const pubByKey = new Map<string, PublicRow>();
  for (const row of publicRows) {
    pubByKey.set(`${row.n}|${row.la}|${row.lo}`, row);
  }

  const findings: AuditFinding[] = [];
  const courseTypes = new Map<CourseType, number>();

  // ── Baseline counters (reproduce user measurements) ──
  let missingBothHp = 0;
  let badPar18Band = 0;
  const exactNameGroups = new Map<string, UsCatalogEntry[]>();
  const coordGroups = new Map<string, UsCatalogEntry[]>();

  for (let i = 0; i < catalog.length; i += 1) {
    const entry = catalog[i]!;
    const pub = publicRows[i];

    if (entry.h == null && entry.p == null) missingBothHp += 1;

    if (entry.h === 18 && entry.p != null && (entry.p < 66 || entry.p > 76)) {
      badPar18Band += 1;
    }

    const nameList = exactNameGroups.get(entry.n) ?? [];
    nameList.push(entry);
    exactNameGroups.set(entry.n, nameList);

    const coordKey = `${entry.la.toFixed(5)},${entry.lo.toFixed(5)}`;
    const atCoord = coordGroups.get(coordKey) ?? [];
    atCoord.push(entry);
    coordGroups.set(coordKey, atCoord);

    const ctype = classifyCourseType(entry.h, entry.p);
    courseTypes.set(ctype, (courseTypes.get(ctype) ?? 0) + 1);

    // A1 — position
    if (!Number.isFinite(entry.la) || !Number.isFinite(entry.lo)) {
      addFinding(findings, 'A1-missing-coords', 'error', entry, pub, 'missing coordinates');
      continue;
    }

    if (entry.co === 'US' && !isInUnitedStates(entry.la, entry.lo)) {
      addFinding(
        findings,
        'A1-outside-us',
        'error',
        entry,
        pub,
        `catalog country US but coordinates (${entry.la}, ${entry.lo}) fall outside US state boundaries`,
        { lat: entry.la, lon: entry.lo, catalogState: entry.st ?? null },
      );
    } else if (!entry.co && !isInUnitedStates(entry.la, entry.lo)) {
      addFinding(
        findings,
        'A1-missing-country',
        'warn',
        entry,
        pub,
        `coordinates outside US with no country set`,
        { lat: entry.la, lon: entry.lo },
      );
    }

    const geoRegion = regionFromCoords(entry.la, entry.lo);
    if (
      entry.co === 'US' &&
      geoRegion.co === 'US' &&
      entry.st &&
      geoRegion.st &&
      entry.st.toUpperCase() !== geoRegion.st
    ) {
      addFinding(
        findings,
        'A1-state-mismatch',
        'error',
        entry,
        pub,
        `catalog state ${entry.st} disagrees with coordinate state ${geoRegion.st}`,
        { catalogState: entry.st, geoState: geoRegion.st, region: regionOf(entry, pub) },
      );
    }

    if (
      entry.co &&
      entry.co !== 'US' &&
      geoRegion.co &&
      geoRegion.co !== entry.co
    ) {
      addFinding(
        findings,
        'A1-country-mismatch',
        'error',
        entry,
        pub,
        `catalog country ${entry.co} disagrees with coordinate country ${geoRegion.co}`,
        { catalogCountry: entry.co, geoCountry: geoRegion.co },
      );
    }

    if (
      entry.co &&
      entry.co !== 'US' &&
      entry.pr &&
      geoRegion.pr &&
      geoRegion.pr !== entry.pr
    ) {
      addFinding(
        findings,
        'A1-province-mismatch',
        'warn',
        entry,
        pub,
        `catalog province ${entry.pr} disagrees with coordinate province ${geoRegion.pr}`,
        { catalogProvince: entry.pr, geoProvince: geoRegion.pr },
      );
    }

    if (entry.st && entry.co !== 'US') {
      addFinding(
        findings,
        'A1-us-state-on-intl',
        'warn',
        entry,
        pub,
        `US state code "${entry.st}" set on international entry (co=${entry.co ?? '?'})`,
      );
    }

    if (entry.st && entry.co === 'US' && !isValidUsStateCode(entry.st)) {
      addFinding(
        findings,
        'A1-invalid-state-code',
        'warn',
        entry,
        pub,
        `invalid or non-US state code "${entry.st}"`,
      );
    }

    // A3 — holes / par
    if (entry.h == null || entry.p == null) {
      addFinding(
        findings,
        'A3-missing-holes-or-par',
        entry.h == null && entry.p == null ? 'warn' : 'info',
        entry,
        pub,
        `missing ${entry.h == null ? 'hole count' : ''}${entry.h == null && entry.p == null ? ' and ' : ''}${entry.p == null ? 'par' : ''}`,
        { h: entry.h ?? null, p: entry.p ?? null },
      );
    }

    if (entry.h != null && entry.p != null && (entry.h === 9 || entry.h === 18)) {
      if (!validParForHoles(entry.h, entry.p)) {
        addFinding(
          findings,
          'A3-par-out-of-range',
          'warn',
          entry,
          pub,
          `par ${entry.p} outside valid range for ${entry.h} holes`,
          { h: entry.h, p: entry.p, type: ctype },
        );
      }

      const template = parTemplate(entry.h, entry.p);
      const templateSum = template.reduce((sum, par) => sum + par, 0);
      if (templateSum !== entry.p) {
        addFinding(
          findings,
          'A3-par-template-mismatch',
          'error',
          entry,
          pub,
          `parTemplate(${entry.h}, ${entry.p}) sums to ${templateSum}, not ${entry.p}`,
          { h: entry.h, p: entry.p, templateSum },
        );
      }
    }

    if (entry.h != null && entry.y != null && !validYardageForHoles(entry.h, entry.y)) {
      addFinding(
        findings,
        'A3-total-yardage-range',
        'warn',
        entry,
        pub,
        `total yardage ${entry.y} out of plausible range for ${entry.h} holes`,
        { h: entry.h, y: entry.y },
      );
    }

    // A2 — mangled names
    const mangled = isMangledName(entry.n);
    if (mangled) {
      addFinding(findings, 'A2-mangled-name', 'info', entry, pub, mangled, {
        pattern: mangled,
      });
    }

    // A4 — yardage (scorecard-level, no live OSM)
    const curated = findScorecard({
      courseName: entry.n,
      osmId: entry.o,
    });
    if (curated && curated.holes.some(holeHasCardYardage)) {
      auditScorecardYardages(findings, entry, pub, curated, 'A4-curated');
    }

    const synthesized = scorecardFromCatalogEntry(entry);
    if (synthesized && !curated) {
      auditScorecardYardages(findings, entry, pub, synthesized, 'A4-catalog');
    }
  }

  // A2 — exact duplicate names
  for (const [name, entries] of exactNameGroups.entries()) {
    if (entries.length < 2) continue;
    addFinding(
      findings,
      'A2-exact-duplicate-name',
      'warn',
      entries[0]!,
      pubByKey.get(`${entries[0]!.n}|${entries[0]!.la}|${entries[0]!.lo}`),
      `${entries.length} catalog entries share exact name "${name}"`,
      { count: entries.length, coords: entries.map((e) => `${e.la},${e.lo}`).join('; ') },
    );
  }

  // A1 — same name, far apart
  for (const [, entries] of exactNameGroups.entries()) {
    if (entries.length < 2) continue;
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i]!;
        const b = entries[j]!;
        const km = haversineKm(a.la, a.lo, b.la, b.lo);
        if (km > 2) {
          addFinding(
            findings,
            'A1-same-name-far-apart',
            'error',
            a,
            pubByKey.get(`${a.n}|${a.la}|${a.lo}`),
            `same name "${a.n}" also at (${b.la}, ${b.lo}) — ${km.toFixed(1)} km apart`,
            { otherLat: b.la, otherLon: b.lo, distanceKm: Math.round(km * 10) / 10 },
          );
        }
      }
    }
  }

  // A1 — coordinate clusters (3+)
  for (const [coord, entries] of coordGroups.entries()) {
    if (entries.length < 3) continue;
    const uniqueNames = [...new Set(entries.map((e) => e.n))];
    const kind = coordClusterKind(uniqueNames);
    const severity: Severity =
      kind === 'duplicate-artifact' ? 'error' : kind === 'mixed' ? 'warn' : 'info';
    addFinding(
      findings,
      'A1-coord-cluster',
      severity,
      entries[0]!,
      pubByKey.get(`${entries[0]!.n}|${entries[0]!.la}|${entries[0]!.lo}`),
      `${entries.length} entries at ${coord} — ${kind}`,
      {
        count: entries.length,
        kind,
        names: uniqueNames.slice(0, 8).join(' | ') + (uniqueNames.length > 8 ? ' …' : ''),
      },
    );
  }

  // A1 — shared coords (2+) summary aligned with baseline
  let sharedCoordClusters = 0;
  let sharedCoordCourses = 0;
  let worstCluster = 0;
  for (const [, entries] of coordGroups.entries()) {
    if (entries.length < 2) continue;
    sharedCoordClusters += 1;
    sharedCoordCourses += entries.length;
    worstCluster = Math.max(worstCluster, entries.length);
  }

  const exactDupGroups = [...exactNameGroups.values()].filter((g) => g.length > 1);
  const exactDupEntries = exactDupGroups.reduce((sum, g) => sum + g.length, 0);

  // Write NDJSON report
  await mkdir(resolve('reports'), { recursive: true });
  const stream = createWriteStream(outPath, 'utf8');
  for (const row of findings) {
    stream.write(`${JSON.stringify(row)}\n`);
  }
  stream.end();
  await new Promise<void>((done, err) => {
    stream.on('finish', done);
    stream.on('error', err);
  });

  const byCheck = new Map<string, number>();
  for (const f of findings) {
    byCheck.set(f.checkId, (byCheck.get(f.checkId) ?? 0) + 1);
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  const infos = findings.filter((f) => f.severity === 'info').length;

  console.log('=== Course Data Audit (Phase A — read-only) ===\n');
  console.log(`Catalog entries: ${catalog.length}`);
  console.log(`Public catalog entries: ${publicRows.length}`);
  console.log(`Report: ${outPath}`);
  console.log('');
  console.log('--- Baseline reproduction ---');
  console.log(`Missing both h and p: ${missingBothHp} (${((missingBothHp / catalog.length) * 100).toFixed(1)}%)`);
  console.log(
    `Exact duplicate name groups: ${exactDupGroups.length} (${exactDupEntries} entries in groups)`,
  );
  console.log(
    `User baseline note: 1,201 duplicate-name *entries* ≈ ${exactDupEntries - exactDupGroups.length} extras beyond first-in-group`,
  );
  console.log(
    `Shared coordinate clusters (2+): ${sharedCoordClusters} covering ${sharedCoordCourses} courses`,
  );
  console.log(`Worst coordinate cluster: ${worstCluster} entries on one point`);
  console.log(`18-hole par outside 66–76 band: ${badPar18Band}`);
  console.log(
    `Coordinates outside US state polygons: ${findings.filter((f) => f.checkId === 'A1-outside-us').length}`,
  );
  console.log(`State/region mismatches (A1-state-mismatch): ${byCheck.get('A1-state-mismatch') ?? 0}`);
  console.log('');
  console.log('--- Course type classification ---');
  for (const [type, count] of [...courseTypes.entries()].sort()) {
    console.log(`  ${type}: ${count}`);
  }
  console.log('');
  console.log('--- Findings by check ---');
  const sortedChecks = [...byCheck.entries()].sort((a, b) => b[1] - a[1]);
  for (const [id, count] of sortedChecks) {
    console.log(`  ${id}: ${count}`);
  }
  console.log('');
  console.log(`Total findings: ${findings.length} (${errors} errors, ${warns} warns, ${infos} info)`);
  console.log('');
  console.log('A4 geometry note: live OSM tee→green checks require network fetch;');
  console.log('this run validates scorecard/par-yardage rules on curated + catalog entries only.');

  const pheasant = catalog.filter((e) => e.n === 'Pheasant Glen Golf Resort');
  if (pheasant.length) {
    console.log('');
    console.log(`Pheasant Glen Golf Resort: ${pheasant.length} entries`);
    console.log(
      `  Sample region: ${regionOf(pheasant[0]!, publicRows[catalog.indexOf(pheasant[0]!)])}`,
    );
    console.log(
      `  Outside US: ${!isInUnitedStates(pheasant[0]!.la, pheasant[0]!.lo)}`,
    );
    console.log(`  Geo state: ${stateAtPoint(pheasant[0]!.la, pheasant[0]!.lo) ?? 'none'}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
