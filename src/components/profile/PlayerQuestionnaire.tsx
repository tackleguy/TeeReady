import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { CourseSearchMultiSelect } from '../golf/CourseSearchMultiSelect';
import { courseLabel } from '../golf/CourseSearchSelect';
import { GoalPicker } from '../coach/GoalPicker';
import { CitySearchField } from './CitySearchField';
import type { GolfCourseSummary } from '../../lib/golf';
import type { GeocodeResult } from '../../hooks/useGeocode';
import {
  bagFromStocks,
  DEFAULT_PROFILE,
  loadGolfProfile,
  missLabel,
  saveGolfProfile,
  type GolfPlayerProfile,
  type MissBias,
} from '../../lib/golfProfile';
import { getGoal, hasAnyGoals, type GoalId } from '../../lib/goals';
import {
  defaultTargetHandicap,
  formatHandicap,
  MAX_HANDICAP,
  MIN_HANDICAP,
} from '../../lib/golfHandicap';
import type {
  BiggestLeak,
  CompetitiveLevel,
  PracticeFocus,
  TeeTimePref,
  TransportPref,
} from '../../lib/questionnaire';
import { defaultSearchLoc } from '../../lib/searchLoc';

const STEPS = [
  { id: 'game', title: 'Your game', subtitle: 'Handicap, carry & miss' },
  { id: 'city', title: 'Home city', subtitle: 'Where TeeReady looks for courses' },
  { id: 'courses', title: 'Courses', subtitle: 'Where you play' },
  { id: 'goals', title: 'Goals', subtitle: 'What you want' },
  { id: 'rhythm', title: 'Rhythm', subtitle: 'How often you play' },
  { id: 'leaks', title: 'Leaks', subtitle: 'Where strokes hide' },
  { id: 'motivation', title: 'Why you play', subtitle: 'What keeps you coming back' },
  { id: 'review', title: 'Review', subtitle: 'Confirm & finish' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
      {children}
    </span>
  );
}

function inputClassName() {
  return 'w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand';
}

function ChipPick<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string; hint?: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            className={
              on
                ? 'rounded-xl bg-brand-soft px-3 py-2 text-[13px] font-semibold text-brand ring-1 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)]'
                : 'rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] font-medium text-muted hover:text-ink'
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 px-4 py-2.5">
      <dt className="w-28 shrink-0 font-medium text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{value}</dd>
    </div>
  );
}

type Props = {
  /** Start at a specific step (e.g. rhythm after signup). */
  initialStep?: StepId;
  onComplete?: (profile: GolfPlayerProfile) => void;
  onCancel?: () => void;
};

export function PlayerQuestionnaire({
  initialStep = 'game',
  onComplete,
  onCancel,
}: Props) {
  const startIdx = Math.max(
    0,
    STEPS.findIndex((s) => s.id === initialStep),
  );
  const [step, setStep] = useState(startIdx);
  const [localError, setLocalError] = useState<string | null>(null);

  const [handicap, setHandicap] = useState(DEFAULT_PROFILE.handicap);
  const [miss, setMiss] = useState<MissBias>(DEFAULT_PROFILE.miss);
  const [sevenIronYards, setSevenIronYards] = useState(
    DEFAULT_PROFILE.sevenIronYards,
  );
  const [driverYards, setDriverYards] = useState(DEFAULT_PROFILE.driverYards);
  const [courses, setCourses] = useState<GolfCourseSummary[]>([]);
  const [goals, setGoals] = useState<GoalId[]>([]);
  const [customGoals, setCustomGoals] = useState<string[]>([]);
  const [targetHandicap, setTargetHandicap] = useState(12);
  const [roundsPerMonthGoal, setRoundsPerMonthGoal] = useState(2);
  const [preferredTeeTime, setPreferredTeeTime] = useState<TeeTimePref>('morning');
  const [transport, setTransport] = useState<TransportPref>('either');
  const [biggestLeak, setBiggestLeak] = useState<BiggestLeak>('approach');
  const [practiceFocus, setPracticeFocus] = useState<PracticeFocus>('course');
  const [competitiveLevel, setCompetitiveLevel] =
    useState<CompetitiveLevel>('casual');
  const [motivation, setMotivation] = useState('');
  const [dreamCourse, setDreamCourse] = useState('');
  const [homeCity, setHomeCity] = useState<GeocodeResult | null>(null);

  useEffect(() => {
    const saved = loadGolfProfile();
    const loc = defaultSearchLoc();
    if (
      saved?.homeCity &&
      saved.homeCityLat != null &&
      saved.homeCityLon != null
    ) {
      setHomeCity({
        label: saved.homeCity,
        lat: saved.homeCityLat,
        lon: saved.homeCityLon,
      });
    } else if (loc.name) {
      setHomeCity({
        label: loc.name,
        lat: loc.lat,
        lon: loc.lon,
      });
    }
    if (!saved) return;
    setHandicap(saved.handicap);
    setMiss(saved.miss);
    setSevenIronYards(saved.sevenIronYards);
    setDriverYards(saved.driverYards);
    setGoals(saved.goals);
    setCustomGoals(saved.customGoals);
    setTargetHandicap(
      saved.targetHandicap ?? defaultTargetHandicap(saved.handicap),
    );
    setRoundsPerMonthGoal(saved.roundsPerMonthGoal);
    setPreferredTeeTime(saved.preferredTeeTime);
    setTransport(saved.transport);
    setBiggestLeak(saved.biggestLeak);
    setPracticeFocus(saved.practiceFocus);
    setCompetitiveLevel(saved.competitiveLevel);
    setMotivation(saved.motivation);
    setDreamCourse(saved.dreamCourse);
    if (saved.commonCourses.length) {
      setCourses(
        saved.commonCourses.map((name, i) => ({
          id: `saved-${i}-${name}`,
          osmType: 'node' as const,
          osmId: i,
          name,
          lat: 0,
          lon: 0,
        })),
      );
    }
  }, []);

  const bagPreview = useMemo(
    () => bagFromStocks(driverYards, sevenIronYards),
    [driverYards, sevenIronYards],
  );

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  const validateStep = (): string | null => {
    switch (current.id) {
      case 'game':
        if (!Number.isFinite(handicap)) return 'Enter a valid handicap.';
        if (!Number.isFinite(sevenIronYards) || !Number.isFinite(driverYards)) {
          return 'Enter your 7-iron and driver carry distances.';
        }
        if (driverYards <= sevenIronYards + 15) {
          return 'Driver carry should be at least ~20 yards longer than 7-iron.';
        }
        return null;
      case 'city':
        if (!homeCity?.label.trim()) return 'Pick your home city.';
        return null;
      case 'courses':
        if (courses.length === 0) return 'Add at least one course.';
        return null;
      case 'goals':
        if (!hasAnyGoals(goals, customGoals)) {
          return 'Pick a preset goal or type your own.';
        }
        return null;
      case 'motivation':
        if (!motivation.trim()) return 'Tell us why you play — even one sentence.';
        return null;
      default:
        return null;
    }
  };

  const goNext = () => {
    const msg = validateStep();
    if (msg) {
      setLocalError(msg);
      return;
    }
    setLocalError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setLocalError(null);
    if (step === startIdx && onCancel) {
      onCancel();
      return;
    }
    setStep((s) => Math.max(startIdx, s - 1));
  };

  const finish = () => {
    const msg = validateStep();
    if (msg) {
      setLocalError(msg);
      return;
    }
    setLocalError(null);
    const profile = saveGolfProfile({
      ...DEFAULT_PROFILE,
      ...(loadGolfProfile() ?? {}),
      handicap,
      miss,
      sevenIronYards,
      driverYards,
      commonCourses: courses.map(courseLabel),
      goals,
      customGoals,
      targetHandicap: goals.includes('lower-handicap')
        ? targetHandicap
        : undefined,
      roundsPerMonthGoal,
      preferredTeeTime,
      transport,
      biggestLeak,
      practiceFocus,
      competitiveLevel,
      motivation: motivation.trim(),
      dreamCourse: dreamCourse.trim(),
      homeCity: (homeCity?.label.split(',')[0]?.trim() || homeCity?.label || '').trim(),
      homeCityLat: homeCity?.lat ?? null,
      homeCityLon: homeCity?.lon ?? null,
      questionnaireCompleted: true,
    });
    onComplete?.(profile);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" strokeWidth={2} />
            <span className="text-[12px] font-semibold text-brand">
              Player profile · step {step + 1} of {STEPS.length}
            </span>
          </div>
          <h2 className="mt-1 text-[20px] font-bold tracking-[-0.02em] text-ink">
            {current.title}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">{current.subtitle}</p>
        </div>
      </div>

      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`h-1 flex-1 rounded-full ${
              i <= step ? 'bg-brand' : 'bg-line'
            }`}
          />
        ))}
      </div>

      {localError ? (
        <p className="rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">
          {localError}
        </p>
      ) : null}

      {current.id === 'game' ? (
        <div className="rounded-card bg-surface p-4 shadow-card">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <FieldLabel>Handicap</FieldLabel>
              <input
                type="number"
                min={MIN_HANDICAP}
                max={MAX_HANDICAP}
                step={0.1}
                value={Number.isFinite(handicap) ? handicap : ''}
                onChange={(e) =>
                  setHandicap(
                    e.target.value === '' ? Number.NaN : Number(e.target.value),
                  )
                }
                className={`${inputClassName()} tabular`}
              />
              <span className="mt-1 block text-[11px] text-muted">
                Plus handicaps: enter negative (e.g. −2 for +2).
              </span>
            </label>
            <div>
              <FieldLabel>Typical miss</FieldLabel>
              <ChipPick
                value={miss}
                onChange={setMiss}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                  { value: 'both', label: 'Both' },
                  { value: 'straight', label: 'Straight' },
                ]}
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <FieldLabel>7-iron carry</FieldLabel>
              <div className="relative">
                <input
                  type="number"
                  min={80}
                  max={220}
                  value={sevenIronYards}
                  onChange={(e) => setSevenIronYards(Number(e.target.value))}
                  className={`${inputClassName()} pr-10 tabular`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-faint">
                  yd
                </span>
              </div>
            </label>
            <label className="block">
              <FieldLabel>Driver carry</FieldLabel>
              <div className="relative">
                <input
                  type="number"
                  min={140}
                  max={360}
                  value={driverYards}
                  onChange={(e) => setDriverYards(Number(e.target.value))}
                  className={`${inputClassName()} pr-10 tabular`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-faint">
                  yd
                </span>
              </div>
            </label>
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Used for club picks and yardage rings in Rounds — same as Profile.
          </p>
          <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {bagPreview.slice(0, 6).map((c) => (
              <div
                key={c.key}
                className="rounded-lg border border-line bg-canvas px-1.5 py-1 text-center"
              >
                <div className="text-[9px] uppercase tracking-wide text-faint">
                  {c.label}
                </div>
                <div className="text-[12px] font-semibold tabular text-ink">
                  {c.yards}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {current.id === 'city' ? (
        <div className="rounded-card bg-surface p-4 shadow-card">
          <FieldLabel>What city do you play around?</FieldLabel>
          <CitySearchField value={homeCity} onChange={setHomeCity} />
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            Saved to your profile and used for Courses, Map, and nearby
            course search.
          </p>
        </div>
      ) : null}

      {current.id === 'courses' ? (
        <div className="rounded-card bg-surface p-4 shadow-card">
          <FieldLabel>Where do you play most?</FieldLabel>
          <CourseSearchMultiSelect value={courses} onChange={setCourses} max={5} />
        </div>
      ) : null}

      {current.id === 'goals' ? (
        <div className="rounded-card bg-surface p-4 shadow-card">
          <GoalPicker
            value={goals}
            onChange={setGoals}
            customGoals={customGoals}
            onCustomGoalsChange={setCustomGoals}
            max={3}
            maxCustom={3}
          />
          {goals.includes('lower-handicap') ? (
            <label className="mt-4 block">
              <FieldLabel>Target handicap</FieldLabel>
              <input
                type="number"
                step={0.1}
                min={MIN_HANDICAP}
                max={MAX_HANDICAP}
                value={targetHandicap}
                onChange={(e) => setTargetHandicap(Number(e.target.value))}
                className={`${inputClassName()} tabular`}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {current.id === 'rhythm' ? (
        <div className="rounded-card bg-surface p-4 shadow-card space-y-5">
          <div>
            <FieldLabel>Rounds per month goal</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 6, 8].map((n) => {
                const on = roundsPerMonthGoal === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRoundsPerMonthGoal(n)}
                    className={
                      on
                        ? 'rounded-xl bg-brand-soft px-3 py-2 text-[13px] font-semibold text-brand ring-1 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)]'
                        : 'rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] font-medium text-muted hover:text-ink'
                    }
                  >
                    {n === 8 ? '8+' : n}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <FieldLabel>Preferred tee time</FieldLabel>
            <ChipPick
              value={preferredTeeTime}
              onChange={setPreferredTeeTime}
              options={[
                { value: 'morning', label: 'Morning', hint: 'Dew & calm air' },
                { value: 'midday', label: 'Midday', hint: 'Flexible schedule' },
                { value: 'twilight', label: 'Twilight', hint: 'After work' },
              ]}
            />
          </div>
          <div>
            <FieldLabel>Walk or ride?</FieldLabel>
            <ChipPick
              value={transport}
              onChange={setTransport}
              options={[
                { value: 'walk', label: 'Walk' },
                { value: 'cart', label: 'Cart' },
                { value: 'either', label: 'Either' },
              ]}
            />
          </div>
        </div>
      ) : null}

      {current.id === 'leaks' ? (
        <div className="rounded-card bg-surface p-4 shadow-card space-y-5">
          <div>
            <FieldLabel>Biggest leak right now</FieldLabel>
            <ChipPick
              value={biggestLeak}
              onChange={setBiggestLeak}
              options={[
                { value: 'putting', label: 'Putting' },
                { value: 'driving', label: 'Driving' },
                { value: 'approach', label: 'Approach' },
                { value: 'short-game', label: 'Short game' },
                { value: 'mental', label: 'Course management' },
              ]}
            />
          </div>
          <div>
            <FieldLabel>Where you actually practice</FieldLabel>
            <ChipPick
              value={practiceFocus}
              onChange={setPracticeFocus}
              options={[
                { value: 'range', label: 'Range' },
                { value: 'short-game', label: 'Short game area' },
                { value: 'putting', label: 'Putting green' },
                { value: 'course', label: 'On course only' },
              ]}
            />
          </div>
          <div>
            <FieldLabel>Competitive level</FieldLabel>
            <ChipPick
              value={competitiveLevel}
              onChange={setCompetitiveLevel}
              options={[
                { value: 'casual', label: 'Casual' },
                { value: 'league', label: 'League / skins' },
                { value: 'tournament', label: 'Tournament' },
              ]}
            />
          </div>
        </div>
      ) : null}

      {current.id === 'motivation' ? (
        <div className="rounded-card bg-surface p-4 shadow-card space-y-4">
          <label className="block">
            <FieldLabel>Why do you play?</FieldLabel>
            <textarea
              value={motivation}
              onChange={(e) => setMotivation(e.target.value.slice(0, 280))}
              rows={3}
              placeholder="e.g. Stress relief, beating my buddies, chasing a single-digit handicap…"
              className={inputClassName()}
            />
            <span className="mt-1 block text-[11px] text-faint">
              {motivation.length}/280 — powers your coach on Today
            </span>
          </label>
          <label className="block">
            <FieldLabel>Dream course (optional)</FieldLabel>
            <input
              value={dreamCourse}
              onChange={(e) => setDreamCourse(e.target.value.slice(0, 120))}
              placeholder="e.g. Pebble Beach, St Andrews…"
              className={inputClassName()}
            />
          </label>
        </div>
      ) : null}

      {current.id === 'review' ? (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <dl className="divide-y divide-line text-[13px]">
            <ReviewRow
              label="Handicap"
              value={`${formatHandicap(handicap)} · ${missLabel(miss)}`}
            />
            <ReviewRow
              label="Carry"
              value={`7i ${sevenIronYards} yd · Driver ${driverYards} yd`}
            />
            <ReviewRow
              label="Home city"
              value={
                homeCity
                  ? homeCity.label.split(',')[0]?.trim() || homeCity.label
                  : '—'
              }
            />
            <ReviewRow
              label="Courses"
              value={courses.map(courseLabel).join(', ') || '—'}
            />
            <ReviewRow
              label="Goals"
              value={
                [
                  ...goals.map((g) => getGoal(g)?.label ?? g),
                  ...customGoals,
                ].join(', ') || '—'
              }
            />
            <ReviewRow
              label="Rhythm"
              value={`${roundsPerMonthGoal}+ rounds/mo · ${preferredTeeTime} · ${transport}`}
            />
            <ReviewRow
              label="Focus"
              value={`${biggestLeak.replace('-', ' ')} · ${practiceFocus} · ${competitiveLevel}`}
            />
            <ReviewRow label="Why" value={motivation.trim() || '—'} />
            {dreamCourse.trim() ? (
              <ReviewRow label="Dream" value={dreamCourse.trim()} />
            ) : null}
          </dl>
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center justify-center gap-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={finish}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white"
          >
            Finish profile
            <Check className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export { STEPS as QUESTIONNAIRE_STEPS };
