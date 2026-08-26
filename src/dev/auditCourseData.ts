/**
 * Phase A — course data quality audit (read-only).
 *
 * Run: `node scripts/audit-course-data.mjs`
 * Hand-off: add `"audit:course-data": "node scripts/audit-course-data.mjs"` to package.json
 *   (this agent must not edit package.json when shared).
 *
 * Emits NDJSON under reports/ (gitignored) plus committed summaries at
 * scripts/course-data-audit-report.md and scripts/course-data-audit-summary.json
 * (mirrored under src/dev/ for convenience).
 */

import { createWriteStream, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isClubSibling } from '../../api/golf/_lib/courseRelate';
import { haversineYards } from '../../api/golf/_lib/geo';
import {
  isVerifiedCatalogEntry,
  normalizeCourseName,
  parTemplate,
  validParForHoles,
  validYardageForHoles,
} from '../../api/golf/_lib/syntheticScorecard';
import { findScorecard, type CourseScorecard } from '../../api/golf/_data/scorecards';
import type { UsCatalogEntry } from '../../api/golf/_data/usCatalog';
import { classifyCourseType } from '../../api/golf/_lib/courseType';
import { formatCatalogRegion } from '../../api/golf/_lib/catalogRegion';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isInUnitedStates, stateAtPoint, regionFromCoords, US_STATES } =
  require('../../scripts/lib/regionLookup.mjs') as {
    isInUnitedStates: (lat: number, lon: number) => boolean;
    stateAtPoint: (lat: number, lon: number) => string | null;
    regionFromCoords: (lat: number, lon: number) => {
      co: string | null;
      st?: string;
      pr?: string;
    };
    US_STATES: Set<string>;
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

type GreenPack = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  greens: Array<{ hole: number; lat: number; lon: number }>;
};

const KM_PER_MI = 1.609_344;
const YARDS_PER_KM = 1760 * KM_PER_MI;
const HOLE_CENTROID_LIMIT_KM = 1.5;
const TEE_GREEN_OVERAGE = 0.05;

/** USPS abbrev → full name (for parsing "City, New York" style regions). */
const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
};

const STATE_NAME_TO_CODE = new Map(
  Object.entries(US_STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code]),
);

function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  return haversineYards(aLat, aLon, bLat, bLon) / YARDS_PER_KM;
}

function regionOf(entry: UsCatalogEntry, pub?: PublicRow): string {
  if (pub?.r) return pub.r;
  return formatCatalogRegion(entry) ?? '';
}

/**
 * Parse a trailing US state from a region string like "Qualicum Beach, NY"
 * or "Qualicum Beach, New York". Returns null when no US state token found.
 */
function parseUsStateFromRegion(region: string): string | null {
  const trimmed = region.trim();
  if (!trimmed) return null;

  const abbrev = trimmed.match(/,\s*([A-Za-z]{2})\s*$/);
  if (abbrev) {
    const code = abbrev[1]!.toUpperCase();
    if (US_STATES.has(code)) return code;
  }

  const full = trimmed.match(/,\s*([A-Za-z .]+?)\s*$/);
  if (full) {
    const code = STATE_NAME_TO_CODE.get(full[1]!.trim().toLowerCase());
    if (code) return code;
  }

  return null;
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

export { classifyCourseType, parseUsStateFromRegion };

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

function holeHasCardYardage(hole: {
  back?: number;
  mid?: number;
  front?: number;
}): boolean {
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

/**
 * Classify a shared-coordinate cluster via isClubSibling.
 * Legitimate multi-course facilities share a club stem; identical names are
 * duplicate artifacts; mixed means unrelated courses on one point.
 */
function coordClusterKind(
  names: string[],
): 'legitimate-facility' | 'duplicate-artifact' | 'mixed' {
  if (names.length < 2) return 'legitimate-facility';

  let allSiblings = true;
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      if (!isClubSibling(names[i]!, names[j]!)) {
        allSiblings = false;
        break;
      }
    }
    if (!allSiblings) break;
  }
  if (allSiblings) return 'legitimate-facility';

  const unique = new Set(names.map(normalizeCourseName));
  if (unique.size < names.length) return 'duplicate-artifact';
  return 'mixed';
}

function loadGreenPacks(): GreenPack[] {
  const dir = resolve('public/golf/greens');
  const packs: GreenPack[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file === 'manifest.json') continue;
    try {
      const raw = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as GreenPack;
      if (
        Number.isFinite(raw.lat) &&
        Number.isFinite(raw.lon) &&
        Array.isArray(raw.greens)
      ) {
        packs.push(raw);
      }
    } catch {
      // skip unreadable packs — audit must not fail the whole catalog run
    }
  }
  return packs;
}

function findCatalogForPack(
  pack: GreenPack,
  catalog: UsCatalogEntry[],
): UsCatalogEntry | undefined {
  const byCoord = catalog.find(
    (e) =>
      Math.abs(e.la - pack.lat) < 1e-4 && Math.abs(e.lo - pack.lon) < 1e-4,
  );
  if (byCoord) return byCoord;

  const target = normalizeCourseName(pack.name);
  return catalog.find((e) => normalizeCourseName(e.n) === target);
}

function writeMarkdownReport(args: {
  catalogLen: number;
  publicLen: number;
  findings: AuditFinding[];
  byCheck: Map<string, number>;
  baseline: Record<string, number | string>;
  courseTypes: Map<CourseType, number>;
  geometry: Record<string, number | string>;
  pheasantNote: string;
  outNdjson: string;
}): void {
  const {
    catalogLen,
    publicLen,
    findings,
    byCheck,
    baseline,
    courseTypes,
    geometry,
    pheasantNote,
    outNdjson,
  } = args;

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  const infos = findings.filter((f) => f.severity === 'info').length;

  const checkRows = [...byCheck.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => `| ${id} | ${count} |`)
    .join('\n');

  const typeRows = [...courseTypes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, n]) => `| ${t} | ${n} |`)
    .join('\n');

  const md = `# Course data audit report (Phase A)

Generated by \`npm run audit:course-data\`. Read-only — no catalog/scorecard data modified.

## Catalog snapshot

| Metric | Value |
| --- | ---: |
| Catalog entries (\`usCatalog.json\`) | ${catalogLen} |
| Public catalog entries | ${publicLen} |
| NDJSON report (gitignored) | \`${outNdjson}\` |
| Total findings | ${findings.length} |
| Errors | ${errors} |
| Warns | ${warns} |
| Info | ${infos} |

## Baseline reproduction vs prompt (14,441)

| Finding | Prompt baseline | This catalog |
| --- | ---: | ---: |
| Total courses | 14,441 | ${baseline.total} |
| Missing both \`h\` and \`p\` | 1,511 (10.5%) | ${baseline.missingBoth} (${baseline.missingBothPct}%) |
| Missing \`h\` or \`p\` (either) | — | ${baseline.missingEither} |
| Exact duplicate name groups | — | ${baseline.exactDupGroups} |
| Exact duplicate extras (entries beyond first) | 1,201 | ${baseline.exactDupExtras} |
| Courses sharing a coordinate (2+) | 1,231 across 506 | ${baseline.sharedCoordCourses} across ${baseline.sharedCoordClusters} |
| Worst coordinate cluster | 26 | ${baseline.worstCluster} |
| 18-hole par outside 66–76 | 372 | ${baseline.badPar18} |

### Baseline diffs explained

${baseline.diffNotes}

### Pheasant Glen

${pheasantNote}

## Course type classification

| Type | Count |
| --- | ---: |
${typeRows}

## Geometry check status

| Item | Status |
| --- | --- |
| Local green packs scanned | ${geometry.packsScanned} |
| Greens checked vs course centroid | ${geometry.greensChecked} |
| Greens > ${HOLE_CENTROID_LIMIT_KM} km from centroid (\`A4-green-far-from-centroid\`) | ${geometry.greensFar} |
| Tee→green vs card yardage (live OSM) | ${geometry.teeGreenStatus} |
| Curated/catalog scorecard par–yardage rules | ${geometry.scorecardYardageStatus} |

## Findings by check

| Check ID | Count |
| --- | ---: |
${checkRows}

## Unverified / open items

- Full tee→green geometry for ~14k courses is not in-repo; live Overpass for the whole catalog is intentionally skipped (rate limits / runtime). Invariant (straight-line ≤ card × 1.05) not evaluated at catalog scale.
- Imported OpenGolf scorecards carry par/handicap only — no per-hole yardages — so A4 card invariants apply only to curated official-yardage cards.
- Coastal courses just outside the 10m state polygons (e.g. peninsula clubs) may flag \`A1-outside-us\` / region-string mismatch even when \`st\` is correct.

## Hand-off

If \`package.json\` is shared/locked: add \`"audit:course-data": "node scripts/audit-course-data.mjs"\`.
`;

  writeFileSync(resolve('scripts/course-data-audit-report.md'), md, 'utf8');
  writeFileSync(resolve('src/dev/course-data-audit-report.md'), md, 'utf8');
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

  let missingBothHp = 0;
  let missingEitherHp = 0;
  let badPar18Band = 0;
  let verifiedCount = 0;
  const exactNameGroups = new Map<string, UsCatalogEntry[]>();
  const coordGroups = new Map<string, UsCatalogEntry[]>();

  for (let i = 0; i < catalog.length; i += 1) {
    const entry = catalog[i]!;
    const pub = publicRows[i];

    if (entry.h == null && entry.p == null) missingBothHp += 1;
    if (entry.h == null || entry.p == null) missingEitherHp += 1;

    if (entry.h === 18 && entry.p != null && (entry.p < 66 || entry.p > 76)) {
      badPar18Band += 1;
    }

    if (isVerifiedCatalogEntry(entry)) verifiedCount += 1;

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
        {
          catalogState: entry.st,
          geoState: geoRegion.st,
          region: regionOf(entry, pub),
        },
      );
    }

    // Region *string* (pub.r / formatted region) vs polygon state — catches
    // Pheasant Glen–style "Qualicum Beach, NY" on BC coordinates.
    const regionStr = regionOf(entry, pub);
    const claimedFromRegion = parseUsStateFromRegion(regionStr);
    if (claimedFromRegion) {
      const geoSt = stateAtPoint(entry.la, entry.lo);
      const inUs = isInUnitedStates(entry.la, entry.lo);
      if (!inUs || !geoSt) {
        addFinding(
          findings,
          'A1-region-string-mismatch',
          'error',
          entry,
          pub,
          `region string "${regionStr}" claims ${claimedFromRegion} but coordinates fall outside US state polygons`,
          {
            claimedState: claimedFromRegion,
            geoState: geoSt,
            catalogState: entry.st ?? null,
            catalogCountry: entry.co ?? null,
          },
        );
      } else if (geoSt !== claimedFromRegion) {
        addFinding(
          findings,
          'A1-region-string-mismatch',
          'error',
          entry,
          pub,
          `region string "${regionStr}" claims ${claimedFromRegion} but coordinates fall in ${geoSt}`,
          {
            claimedState: claimedFromRegion,
            geoState: geoSt,
            catalogState: entry.st ?? null,
          },
        );
      }
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

    // A4 — official curated cards only (avoid fuzzy findScorecard on 14k rows)
    if (
      /pebble\s*beach|torrey\s*pines|bethpage.*black|augusta\s*national|pinehurst.*(?:no\.?\s*2|#\s*2)|tpc\s*sawgrass|sawgrass.*stadium|whistling\s*straits|kiawah.*ocean|pacific\s*dunes|spyglass\s*hill|tpc\s*scottsdale|scottsdale.*stadium/i.test(
        entry.n,
      )
    ) {
      const curated = findScorecard({
        courseName: entry.n,
        osmId: entry.o,
      });
      if (curated && curated.holes.some(holeHasCardYardage)) {
        auditScorecardYardages(findings, entry, pub, curated, 'A4-curated');
      }
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
      {
        count: entries.length,
        coords: entries.map((e) => `${e.la},${e.lo}`).join('; '),
      },
    );
  }

  // A1 — same name, far apart (>2 km)
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
            {
              otherLat: b.la,
              otherLon: b.lo,
              distanceKm: Math.round(km * 10) / 10,
            },
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
        names:
          uniqueNames.slice(0, 8).join(' | ') +
          (uniqueNames.length > 8 ? ' …' : ''),
      },
    );
  }

  // A4 — local green geometry: hole green >1.5 km from course centroid
  const greenPacks = loadGreenPacks();
  let greensChecked = 0;
  let greensFar = 0;
  for (const pack of greenPacks) {
    const entry = findCatalogForPack(pack, catalog);
    const pub = entry
      ? pubByKey.get(`${entry.n}|${entry.la}|${entry.lo}`)
      : undefined;
    const syntheticEntry: UsCatalogEntry = entry ?? {
      n: pack.name,
      la: pack.lat,
      lo: pack.lon,
    };

    for (const green of pack.greens) {
      if (!Number.isFinite(green.lat) || !Number.isFinite(green.lon)) continue;
      greensChecked += 1;
      const km = haversineKm(pack.lat, pack.lon, green.lat, green.lon);
      if (km > HOLE_CENTROID_LIMIT_KM) {
        greensFar += 1;
        addFinding(
          findings,
          'A4-green-far-from-centroid',
          'warn',
          syntheticEntry,
          pub,
          `green pack ${pack.id} hole ${green.hole}: green is ${km.toFixed(2)} km from course point (limit ${HOLE_CENTROID_LIMIT_KM} km)`,
          {
            hole: green.hole,
            distanceKm: Math.round(km * 100) / 100,
            packId: pack.id,
          },
        );
      }
    }
  }

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
  const exactDupExtras = exactDupEntries - exactDupGroups.length;

  const diffNotes = [
    `Catalog size ${catalog.length} vs prompt 14,441 (Δ ${catalog.length - 14_441}) — later catalog rebuilds (standard 9/18-hole filter / dedupe) changed the set.`,
    missingBothHp === 0
      ? `Missing both h+p is now 0 (prompt 1,511); ${missingEitherHp} entries still lack par (\`p\`) with holes present.`
      : `Missing both h+p: ${missingBothHp}.`,
    `Duplicate-name "1,201" in the prompt matches extras-beyond-first; this run has ${exactDupExtras} extras across ${exactDupGroups.length} groups.`,
    `Shared-coord / worst-cluster dropped (${sharedCoordCourses}/${sharedCoordClusters}, worst ${worstCluster}) after duplicate collapse — Pheasant Glen 26-on-a-point cluster is gone.`,
  ].join(' ');

  const pheasant = catalog.filter((e) => /pheasant\s+glen/i.test(e.n));
  const pheasantNote =
    pheasant.length === 0
      ? 'No "Pheasant Glen" entries remain in the current catalog (prompt baseline had 39 BC-mis-tagged rows). Region-string + US polygon checks would have caught them (`A1-outside-us` / `A1-region-string-mismatch`).'
      : pheasant
          .map((e) => {
            const pub = pubByKey.get(`${e.n}|${e.la}|${e.lo}`);
            return `- ${e.n} @ ${e.la},${e.lo} region="${regionOf(e, pub)}" st=${e.st ?? '—'} co=${e.co ?? '—'} inUS=${isInUnitedStates(e.la, e.lo)} geo=${stateAtPoint(e.la, e.lo) ?? 'none'}`;
          })
          .join('\n');

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

  const geometry = {
    packsScanned: greenPacks.length,
    greensChecked,
    greensFar,
    teeGreenStatus: `SKIPPED for full catalog — no in-repo tee→green geometry; live OSM Overpass for ${catalog.length} courses is too heavy. Invariant (straight-line ≤ card × ${1 + TEE_GREEN_OVERAGE}) not evaluated at scale.`,
    scorecardYardageStatus:
      'Strict curated official-yardage cards only (no fuzzy imported / synthetic matches).',
  };

  writeMarkdownReport({
    catalogLen: catalog.length,
    publicLen: publicRows.length,
    findings,
    byCheck,
    baseline: {
      total: catalog.length,
      missingBoth: missingBothHp,
      missingBothPct: ((missingBothHp / catalog.length) * 100).toFixed(1),
      missingEither: missingEitherHp,
      exactDupGroups: exactDupGroups.length,
      exactDupExtras,
      sharedCoordClusters,
      sharedCoordCourses,
      worstCluster,
      badPar18: badPar18Band,
      diffNotes,
    },
    courseTypes,
    geometry,
    pheasantNote,
    outNdjson: outPath,
  });

  const summaryJson = `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      catalogEntries: catalog.length,
      publicEntries: publicRows.length,
      verifiedEntries: verifiedCount,
      findings: findings.length,
      errors,
      warns,
      infos,
      baseline: {
        missingBothHp,
        missingEitherHp,
        exactDupGroups: exactDupGroups.length,
        exactDupExtras,
        sharedCoordClusters,
        sharedCoordCourses,
        worstCluster,
        badPar18Band,
      },
      courseTypes: Object.fromEntries(courseTypes),
      byCheck: Object.fromEntries(byCheck),
      geometry: {
        greenPacks: greenPacks.length,
        greensChecked,
        greensFarFromCentroid: greensFar,
        teeGreenVsCard: 'skipped-no-local-tee-geometry',
      },
    },
    null,
    2,
  )}\n`;
  writeFileSync(resolve('scripts/course-data-audit-summary.json'), summaryJson, 'utf8');
  writeFileSync(resolve('src/dev/course-data-audit-summary.json'), summaryJson, 'utf8');

  console.log('=== Course Data Audit (Phase A — read-only) ===\n');
  console.log(`Catalog entries: ${catalog.length}`);
  console.log(`Public catalog entries: ${publicRows.length}`);
  console.log(`Verified (isVerifiedCatalogEntry): ${verifiedCount}`);
  console.log(`Report NDJSON: ${outPath}`);
  console.log(`Report markdown: scripts/course-data-audit-report.md`);
  console.log(`Report summary JSON: scripts/course-data-audit-summary.json`);
  console.log('');
  console.log('--- Baseline reproduction ---');
  console.log(
    `Missing both h and p: ${missingBothHp} (${((missingBothHp / catalog.length) * 100).toFixed(1)}%)`,
  );
  console.log(`Missing h or p (either): ${missingEitherHp}`);
  console.log(
    `Exact duplicate name groups: ${exactDupGroups.length} (${exactDupEntries} entries; ${exactDupExtras} extras beyond first)`,
  );
  console.log(
    `Shared coordinate clusters (2+): ${sharedCoordClusters} covering ${sharedCoordCourses} courses`,
  );
  console.log(`Worst coordinate cluster: ${worstCluster} entries on one point`);
  console.log(`18-hole par outside 66–76 band: ${badPar18Band}`);
  console.log(
    `Outside US polygons (A1-outside-us): ${byCheck.get('A1-outside-us') ?? 0}`,
  );
  console.log(
    `Region-string mismatches (A1-region-string-mismatch): ${byCheck.get('A1-region-string-mismatch') ?? 0}`,
  );
  console.log(
    `Catalog state mismatches (A1-state-mismatch): ${byCheck.get('A1-state-mismatch') ?? 0}`,
  );
  console.log('');
  console.log('--- Course type classification ---');
  for (const [type, count] of [...courseTypes.entries()].sort()) {
    console.log(`  ${type}: ${count}`);
  }
  console.log('');
  console.log('--- Geometry ---');
  console.log(`  Green packs: ${greenPacks.length}`);
  console.log(`  Greens checked: ${greensChecked}`);
  console.log(`  Greens >${HOLE_CENTROID_LIMIT_KM} km from centroid: ${greensFar}`);
  console.log(
    '  Tee→green vs card: skipped (no local tee geometry; live OSM too heavy for full catalog)',
  );
  console.log('');
  console.log('--- Findings by check ---');
  for (const [id, count] of [...byCheck.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id}: ${count}`);
  }
  console.log('');
  console.log(
    `Total findings: ${findings.length} (${errors} errors, ${warns} warns, ${infos} info)`,
  );

  if (pheasant.length) {
    console.log('');
    console.log(`Pheasant Glen matches: ${pheasant.length}`);
    for (const e of pheasant.slice(0, 5)) {
      console.log(
        `  ${e.n} @ ${e.la},${e.lo} region=${regionOf(e, pubByKey.get(`${e.n}|${e.la}|${e.lo}`))} inUS=${isInUnitedStates(e.la, e.lo)}`,
      );
    }
  } else {
    console.log('');
    console.log(
      'Pheasant Glen: not present in current catalog (baseline cluster removed).',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
