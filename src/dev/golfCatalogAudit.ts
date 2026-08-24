import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isVerifiedCatalogEntry,
  normalizeCourseName,
  scorecardFromCatalogEntry,
  validParForHoles,
  validYardageForHoles,
} from '../../api/golf/_lib/syntheticScorecard';
import { isClubSibling } from '../../api/golf/_lib/courseRelate';
import { searchUsCatalog } from '../../api/golf/_lib/usCatalogSearch';
import type { UsCatalogEntry } from '../../api/golf/_data/usCatalog';

type Finding = {
  severity: 'error' | 'warn';
  course: string;
  detail: string;
};

const catalog = JSON.parse(
  readFileSync(resolve('api/golf/_data/usCatalog.json'), 'utf8'),
) as UsCatalogEntry[];

const publicRows = JSON.parse(
  readFileSync(resolve('public/golf/catalog.us.json'), 'utf8'),
) as Array<{ n: string; la: number; lo: number; r?: string }>;

const findings: Finding[] = [];

function add(severity: Finding['severity'], course: string, detail: string) {
  findings.push({ severity, course, detail });
}

let verified = 0;
let scorecardsOk = 0;
const namesSeen = new Map<string, string[]>();
const coordGroups = new Map<string, UsCatalogEntry[]>();

for (const entry of catalog) {
  const name = entry.n;
  const regionKey = `${normalizeCourseName(name)}|${entry.st ?? ''}|${entry.ci ?? ''}`;
  const list = namesSeen.get(regionKey) ?? [];
  list.push(name);
  namesSeen.set(regionKey, list);

  const coordKey = `${entry.la.toFixed(4)},${entry.lo.toFixed(4)}`;
  const atCoord = coordGroups.get(coordKey) ?? [];
  atCoord.push(entry);
  coordGroups.set(coordKey, atCoord);

  if (!Number.isFinite(entry.la) || !Number.isFinite(entry.lo)) {
    add('error', name, 'missing coordinates');
    continue;
  }
  if (entry.la < 18 || entry.la > 72 || entry.lo < -180 || entry.lo > -60) {
    add('error', name, `coordinates out of US bounds (${entry.la}, ${entry.lo})`);
  }
  if (!entry.ci || !entry.st) {
    add('error', name, 'missing city or state');
  }
  if (entry.st && entry.st.length !== 2) {
    add('error', name, `invalid state code "${entry.st}"`);
  }
  if (entry.h != null && entry.h !== 9 && entry.h !== 18) {
    add('error', name, `invalid hole count ${entry.h}`);
  }
  if (entry.p != null && entry.h != null && !validParForHoles(entry.h, entry.p)) {
    add('error', name, `par ${entry.p} inconsistent with ${entry.h} holes`);
  }
  if (entry.y != null && entry.h != null && !validYardageForHoles(entry.h, entry.y)) {
    add('error', name, `yardage ${entry.y} out of range for ${entry.h} holes`);
  }
  if (entry.sc?.length && entry.h && entry.sc.length !== entry.h) {
    add('error', name, `partial scorecard length ${entry.sc.length} != ${entry.h}`);
  }

  if (entry.q !== 1) continue;
  verified += 1;

  if (!isVerifiedCatalogEntry(entry)) {
    add('error', name, 'marked verified but failed validation');
    continue;
  }

  const card = scorecardFromCatalogEntry(entry);
  if (!card) {
    add('error', name, 'scorecard synthesis failed');
    continue;
  }
  scorecardsOk += 1;

  if (card.holes.length !== entry.h) {
    add('error', name, `hole count ${card.holes.length} != ${entry.h}`);
  }
  const parSum = card.holes.reduce((sum, hole) => sum + hole.par, 0);
  if (parSum !== entry.p) {
    add('error', name, `scorecard par ${parSum} != declared ${entry.p}`);
  }
  if (!card.holes.every((hole, index) => hole.hole === index + 1)) {
    add('error', name, 'non-sequential hole numbers');
  }
  for (const hole of card.holes) {
    if (hole.par < 3 || hole.par > 6) {
      add('error', name, `hole ${hole.hole} has invalid par ${hole.par}`);
    }
    if (hole.hcp != null && (hole.hcp < 1 || hole.hcp > 18)) {
      add('error', name, `hole ${hole.hole} has invalid stroke index ${hole.hcp}`);
    }
  }
  if (entry.y != null) {
    const hasYards = card.holes.every((hole) => hole.back != null && hole.back > 0);
    if (!hasYards) {
      add('error', name, 'verified yardage missing on synthesized scorecard');
    }
  }
}

for (const [key, names] of namesSeen.entries()) {
  if (names.length < 2) continue;
  add('warn', names[0]!, `duplicate region key ${key}: ${names.join(' | ')}`);
}

function coordClusterAllowed(entries: UsCatalogEntry[]): boolean {
  if (entries.length < 2) return true;
  if (entries.every((entry) => entry.fac)) return true;
  const names = entries.map((entry) => entry.n);
  for (let i = 1; i < names.length; i += 1) {
    if (!isClubSibling(names[0]!, names[i]!)) return false;
  }
  return true;
}

for (const [coord, entries] of coordGroups.entries()) {
  if (entries.length < 2) continue;
  const unique = [...new Map(entries.map((entry) => [entry.n, entry])).values()];
  if (unique.length < 2) continue;
  if (coordClusterAllowed(unique)) continue;
  add(
    'warn',
    unique[0]!.n,
    `shared coordinates ${coord}: ${unique.map((entry) => entry.n).join(' | ')}`,
  );
}

if (publicRows.length !== catalog.length) {
  add('error', 'public catalog', `length ${publicRows.length} != server ${catalog.length}`);
}

for (let i = 0; i < catalog.length; i += 1) {
  const entry = catalog[i]!;
  const pub = publicRows[i];
  if (!pub || pub.n !== entry.n || pub.la !== entry.la || pub.lo !== entry.lo) {
    add('error', entry.n, 'public catalog row mismatch');
    break;
  }
  const region = [entry.ci, entry.st].filter(Boolean).join(', ');
  if ((pub.r ?? '') !== region) {
    add('error', entry.n, `public region "${pub.r ?? ''}" != "${region}"`);
  }
}

const searchChecks = [
  { q: 'Pebble Beach', expect: 'Pebble Beach Golf Links' },
  { q: 'Torrey Pines', expect: 'Torrey Pines' },
  { q: 'Bethpage Black', expect: 'Bethpage' },
  { q: 'Augusta National', expect: 'Augusta' },
  { q: 'Chambers Bay', expect: 'Chambers Bay' },
  { q: 'Whistling Straits', expect: 'Whistling Straits' },
  { q: 'TPC Sawgrass', expect: 'Sawgrass' },
];

for (const check of searchChecks) {
  const hits = searchUsCatalog(check.q, 36.57, -121.95, 5);
  if (!hits.length) {
    add('error', check.q, 'catalog search returned no results');
    continue;
  }
  if (!hits.some((hit) => hit.name.includes(check.expect))) {
    add('error', check.q, `search missing expected match "${check.expect}"`);
  }
}

const errors = findings.filter((f) => f.severity === 'error').length;
const warns = findings.filter((f) => f.severity === 'warn').length;
const missingCity = catalog.filter((e) => !e.ci || !e.st).length;

console.log(`Catalog entries: ${catalog.length}`);
console.log(`Verified (q=1): ${verified}`);
console.log(`Verified scorecards OK: ${scorecardsOk}`);
console.log(`Missing city/state: ${missingCity}`);
console.log(`Search smoke tests: ${searchChecks.length}`);
console.log(`Errors: ${errors}`);
console.log(`Warnings: ${warns}`);

if (findings.length) {
  console.log('');
  const errorsList = findings.filter((f) => f.severity === 'error');
  const warnsList = findings.filter((f) => f.severity === 'warn');
  for (const finding of errorsList) {
    console.log(`[${finding.severity}] ${finding.course}: ${finding.detail}`);
  }
  for (const finding of warnsList.slice(0, 50)) {
    console.log(`[${finding.severity}] ${finding.course}: ${finding.detail}`);
  }
  if (warnsList.length > 50) {
    console.log(`... ${warnsList.length - 50} more warnings`);
  }
}

if (verified < 4000) {
  console.error(`\nFAIL: expected at least 4000 verified courses, got ${verified}`);
  process.exitCode = 1;
}
if (scorecardsOk !== verified) {
  console.error(
    `\nFAIL: ${verified - scorecardsOk} verified courses lack valid scorecards`,
  );
  process.exitCode = 1;
}
if (missingCity > 0) {
  console.error(`\nFAIL: ${missingCity} courses still missing city or state`);
  process.exitCode = 1;
}
if (errors > 0) {
  process.exitCode = 1;
}
if (warns > 0) {
  console.error(`\nFAIL: ${warns} catalog warnings remain`);
  process.exitCode = 1;
}
