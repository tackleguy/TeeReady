/** Local golf activity feed — rounds, swings, and milestones on this device. */

import { loadRoundHistory, type SavedRound } from './roundHistory';
import { loadSwingHistory } from './swing';
import { roundScoreLabel } from './golfTracker';
import { formatHandicap } from './golfHandicap';
import { loadGolfProfile } from './golfProfile';
import { loadDisplayProfile } from './mock';

export type SocialFeedKind =
  | 'round'
  | 'swing'
  | 'achievement'
  | 'handicap';

export type SocialFeedItem = {
  id: string;
  kind: SocialFeedKind;
  at: number;
  title: string;
  body: string;
  href?: string;
};

function firstName(): string {
  const name = loadDisplayProfile().name.trim();
  return name.split(/\s+/)[0] || 'You';
}

function roundItem(r: SavedRound): SocialFeedItem {
  const you = firstName();
  const score = roundScoreLabel(r);
  return {
    id: `round-${r.id}`,
    kind: 'round',
    at: r.finishedAt,
    title: `${you} shot ${score} at ${r.courseName}`,
    body: r.inProgress
      ? 'Round in progress — tap to resume GPS.'
      : `${r.scores.length} holes · saved on this device`,
    href: r.inProgress ? '/rounds/gps' : '/stats',
  };
}

export function buildSocialFeed(limit = 12): SocialFeedItem[] {
  const you = firstName();
  const items: SocialFeedItem[] = [];
  const rounds = loadRoundHistory();
  const swings = loadSwingHistory();
  const profile = loadGolfProfile();

  for (const r of rounds.slice(0, 8)) {
    items.push(roundItem(r));
  }

  for (const s of swings.slice(0, 5)) {
    items.push({
      id: `swing-${s.id}`,
      kind: 'swing',
      at: s.createdAt,
      title: `${you} posted a new swing`,
      body:
        s.coach?.text?.split(/[.!\n]/)[0]?.trim() ||
        s.summary.split(/[.!\n]/)[0]?.trim() ||
        `${s.angle === 'dtl' ? 'Down-the-line' : 'Face-on'} · on-device analysis`,
      href: '/swing',
    });
  }

  const best = rounds
    .filter((r) => !r.inProgress && r.scores.length >= 9)
    .reduce<{ round: SavedRound; toPar: number } | null>((acc, r) => {
      const strokes = r.scores.reduce((n, s) => n + s.strokes, 0);
      const par = r.scores.reduce((n, s) => n + s.par, 0);
      const toPar = strokes - par;
      if (!acc || toPar < acc.toPar) return { round: r, toPar };
      return acc;
    }, null);

  if (best && best.toPar <= 0) {
    items.push({
      id: `achieve-best-${best.round.id}`,
      kind: 'achievement',
      at: best.round.finishedAt,
      title:
        best.toPar < 0
          ? `${you} went ${best.toPar} under at ${best.round.courseName}`
          : `${you} shot even par at ${best.round.courseName}`,
      body: 'Personal best on TeeReady',
      href: '/stats',
    });
  }

  if (profile) {
    items.push({
      id: 'handicap-current',
      kind: 'handicap',
      at: Date.now() - 60_000,
      title: `${you}'s handicap index is ${formatHandicap(profile.handicap)}`,
      body: profile.targetHandicap != null
        ? `Target ${formatHandicap(profile.targetHandicap)}`
        : 'Update anytime in Profile',
      href: '/profile',
    });
  }

  items.sort((a, b) => b.at - a.at);
  return items.slice(0, limit);
}
