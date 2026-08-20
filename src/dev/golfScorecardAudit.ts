import { IMPORTED_SCORECARDS } from '../../api/golf/_data/importedScorecards';
import { findScorecard } from '../../api/golf/_data/scorecards';

type ScorecardHole = {
  hole: number;
  par: number;
  back?: number;
  mid?: number;
  front?: number;
};

type Scorecard = {
  name: string;
  totalPar: number;
  loop?: string;
  osmIds?: number[];
  holes: ScorecardHole[];
};

type Finding = {
  severity: 'error' | 'warn';
  course: string;
  detail: string;
};

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsable(card: Scorecard): boolean {
  if (card.holes.length !== 9 && card.holes.length !== 18) return false;
  if (!card.holes.every((hole, index) => hole.hole === index + 1)) return false;
  const parSum = card.holes.reduce((sum, hole) => sum + hole.par, 0);
  if (parSum !== card.totalPar) return false;
  return card.holes.every(
    (hole) =>
      (hole.front == null || hole.mid == null || hole.front <= hole.mid) &&
      (hole.mid == null || hole.back == null || hole.mid <= hole.back) &&
      (hole.front == null || hole.back == null || hole.front <= hole.back),
  );
}

function addFinding(
  out: Finding[],
  severity: Finding['severity'],
  course: string,
  detail: string,
): void {
  out.push({ severity, course, detail });
}

function auditCard(card: Scorecard, findings: Finding[]): void {
  const course = card.loop ? `${card.name} (${card.loop})` : card.name;
  if (card.holes.length !== 9 && card.holes.length !== 18) {
    addFinding(findings, 'warn', course, `unexpected hole count ${card.holes.length}`);
  }
  const parSum = card.holes.reduce((sum, hole) => sum + hole.par, 0);
  if (parSum !== card.totalPar) {
    addFinding(findings, 'error', course, `totalPar ${card.totalPar} != hole sum ${parSum}`);
  }
  const numbers = card.holes.map((hole) => hole.hole);
  const unique = new Set(numbers);
  if (unique.size !== numbers.length) {
    addFinding(findings, 'error', course, 'duplicate hole numbers');
  }
  const expected = Array.from({ length: card.holes.length }, (_, i) => i + 1);
  if (numbers.some((n, i) => n !== expected[i])) {
    addFinding(findings, 'warn', course, `non-sequential holes: ${numbers.join(', ')}`);
  }
  for (const hole of card.holes) {
    if (hole.front && hole.mid && hole.front > hole.mid) {
      addFinding(
        findings,
        'error',
        course,
        `hole ${hole.hole} front ${hole.front} > mid ${hole.mid}`,
      );
    }
    if (hole.mid && hole.back && hole.mid > hole.back) {
      addFinding(
        findings,
        'error',
        course,
        `hole ${hole.hole} mid ${hole.mid} > back ${hole.back}`,
      );
    }
    if (hole.par < 3 || hole.par > 6) {
      addFinding(findings, 'warn', course, `hole ${hole.hole} unusual par ${hole.par}`);
    }
  }
  const lookedUp = findScorecard({ courseName: card.name, loop: card.loop });
  if (!lookedUp) {
    addFinding(findings, 'error', course, 'findScorecard failed for exact card name');
  }
}

function main(): void {
  const findings: Finding[] = [];
  const byName = new Map<string, Scorecard[]>();
  let usable = 0;
  let withYardages = 0;
  let eighteen = 0;

  for (const card of IMPORTED_SCORECARDS as Scorecard[]) {
    const key = normalize(card.name);
    const list = byName.get(key) ?? [];
    list.push(card);
    byName.set(key, list);
    if (isUsable(card)) usable += 1;
    if (card.holes.length === 18) eighteen += 1;
    if (
      card.holes.some(
        (hole) => hole.back != null || hole.mid != null || hole.front != null,
      )
    ) {
      withYardages += 1;
    }
    auditCard(card, findings);
  }

  for (const [key, cards] of byName.entries()) {
    if (cards.length < 2) continue;
    const labels = cards.map((card) => (card.loop ? `${card.name} (${card.loop})` : card.name));
    addFinding(findings, 'warn', key, `duplicate normalized course name: ${labels.join(' | ')}`);
  }

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warnCount = findings.filter((f) => f.severity === 'warn').length;
  console.log(`Imported scorecards: ${IMPORTED_SCORECARDS.length}`);
  console.log(`Usable after runtime guard: ${usable}`);
  console.log(`18-hole cards: ${eighteen}`);
  console.log(`Cards with yardages: ${withYardages}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Warnings: ${warnCount}`);
  console.log('');
  for (const finding of findings.slice(0, 200)) {
    console.log(`[${finding.severity}] ${finding.course}: ${finding.detail}`);
  }
  if (findings.length > 200) {
    console.log('');
    console.log(`... ${findings.length - 200} more findings omitted`);
  }
}

main();
