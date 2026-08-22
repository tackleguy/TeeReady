import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import {
  DEFAULT_PROFILE,
  loadGolfProfile,
} from '../../lib/golfProfile';
import { coachTipForRound } from '../../lib/goalCoach';

export function GoalCoachBanner() {
  const profile = loadGolfProfile() ?? DEFAULT_PROFILE;
  const tip = coachTipForRound(profile);
  if (!tip) return null;

  return (
    <div className="pointer-events-auto mx-3 mt-3 flex items-start gap-2.5 rounded-xl border border-line bg-surface/95 px-3.5 py-2.5 shadow-card backdrop-blur-sm">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-snug text-ink">{tip}</p>
        <Link
          to="/today"
          className="mt-1 inline-block text-[11px] font-semibold text-brand"
        >
          Full plan on Today →
        </Link>
      </div>
    </div>
  );
}
