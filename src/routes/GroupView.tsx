import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check,
  Copy,
  LogOut,
  MessageCircle,
  Minus,
  Plus,
  Radio,
  Users,
} from 'lucide-react';
import { useMultiplayerGroup } from '../hooks/useMultiplayerGroup';
import {
  formatPrimaryStat,
  GAME_MODES,
  getGameMode,
  primaryStatLabel,
  sortMembersForMode,
  type GameModeId,
} from '../lib/gameModes';
import { formatHandicap } from '../lib/golfHandicap';
import { formatToPar, timeAgo, type MemberRow } from '../lib/multiplayer';
import {
  CourseSearchSelect,
  courseLabel,
} from '../components/golf/CourseSearchSelect';
import type { GolfCourseSummary } from '../lib/golf';
import { loadGolfProfile } from '../lib/golfProfile';
import { stashPendingCourse } from '../lib/pendingCourse';

function statusDot(status: MemberRow['status']) {
  if (status === 'playing') return 'bg-brand';
  if (status === 'finished') return 'bg-faint';
  return 'bg-warn';
}

function Lobby({
  busy,
  error,
  onCreate,
  onJoin,
}: {
  busy: boolean;
  error: string | null;
  onCreate: (
    name: string,
    course: string,
    format: string,
    pot: string,
    gameMode: GameModeId,
  ) => Promise<boolean>;
  onJoin: (code: string) => void;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [gameMode, setGameMode] = useState<GameModeId>('skins');
  const modeMeta = getGameMode(gameMode);
  const [name, setName] = useState(modeMeta.defaultName);
  const [selectedCourse, setSelectedCourse] =
    useState<GolfCourseSummary | null>(null);
  const [format, setFormat] = useState(modeMeta.defaultFormat);
  const [pot, setPot] = useState('');
  const [code, setCode] = useState('');
  const courseHint = loadGolfProfile()?.commonCourses[0] ?? '';

  const pickMode = (id: GameModeId) => {
    const next = getGameMode(id);
    setGameMode(id);
    setName(next.defaultName);
    setFormat(next.defaultFormat);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
          Multiplayer
        </span>
        <h1 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-ink">
          Pick a game mode
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          Skins, stroke, match, scramble, or Stableford — then invite your
          group with a code.
        </p>
      </div>

      <div className="flex rounded-xl border border-line p-0.5">
        <button
          type="button"
          onClick={() => setTab('create')}
          className={
            tab === 'create'
              ? 'flex-1 rounded-lg bg-brand-soft py-2 text-[13px] font-semibold text-brand'
              : 'flex-1 rounded-lg py-2 text-[13px] font-medium text-muted'
          }
        >
          Create group
        </button>
        <button
          type="button"
          onClick={() => setTab('join')}
          className={
            tab === 'join'
              ? 'flex-1 rounded-lg bg-brand-soft py-2 text-[13px] font-semibold text-brand'
              : 'flex-1 rounded-lg py-2 text-[13px] font-medium text-muted'
          }
        >
          Join with code
        </button>
      </div>

      <section className="rounded-card bg-surface p-5 shadow-card">
        {tab === 'create' ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selectedCourse) return;
              const ok = await onCreate(
                name,
                courseLabel(selectedCourse),
                format,
                pot,
                gameMode,
              );
              if (ok) {
                stashPendingCourse(selectedCourse);
                navigate('/rounds/gps');
              }
            }}
          >
            <div>
              <span className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                Game mode
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                {GAME_MODES.map((m) => {
                  const on = m.id === gameMode;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => pickMode(m.id)}
                      className={
                        on
                          ? 'rounded-xl border border-brand bg-brand-soft p-3 text-left ring-1 ring-[color-mix(in_srgb,var(--brand)_28%,transparent)]'
                          : 'rounded-xl border border-line bg-canvas p-3 text-left hover:border-[color-mix(in_srgb,var(--brand)_35%,var(--line))]'
                      }
                    >
                      <div className="text-[13px] font-bold text-ink">
                        {m.label}
                      </div>
                      <p className="mt-1 text-[12px] leading-snug text-muted">
                        {m.blurb}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                Group name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-base text-ink outline-none focus:border-brand"
              />
            </label>
            <div className="block">
              <span className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                Course
              </span>
              <CourseSearchSelect
                value={selectedCourse}
                onChange={setSelectedCourse}
                initialQuery={courseHint}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                  Stakes / notes
                </span>
                <input
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-base text-ink outline-none focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                  Pot
                </span>
                <input
                  value={pot}
                  onChange={(e) => setPot(e.target.value)}
                  placeholder={gameMode === 'skins' ? '$40' : 'Optional'}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-base text-ink outline-none focus:border-brand"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy || !name.trim() || !selectedCourse}
              className="mt-1 rounded-xl bg-brand px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
            >
              {busy ? 'Creating…' : `Start ${modeMeta.short} & open GPS`}
            </button>
          </form>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              onJoin(code);
            }}
          >
            <label className="block">
              <span className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                Invite code
              </span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                minLength={4}
                placeholder="ABC123"
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-mono text-[16px] tracking-[0.2em] text-ink outline-none focus:border-brand"
              />
            </label>
            <button
              type="submit"
              disabled={busy || code.trim().length < 4}
              className="mt-2 rounded-xl bg-brand px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
            >
              {busy ? 'Joining…' : 'Join group'}
            </button>
          </form>
        )}
        {error ? <p className="mt-3 text-[12px] text-bad">{error}</p> : null}
      </section>
    </div>
  );
}

function ModeControls({
  modeId,
  me,
  onBumpScore,
  onBumpSkins,
  onBumpPoints,
  onBumpMatch,
}: {
  modeId: GameModeId;
  me: MemberRow;
  onBumpScore: (d: number, thru?: number) => void;
  onBumpSkins: (d: number) => void;
  onBumpPoints: (d: number) => void;
  onBumpMatch: (d: number) => void;
}) {
  const mode = getGameMode(modeId);

  if (mode.primary === 'points') {
    return (
      <section className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
        <span className="text-[13px] font-semibold text-ink">Your points</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onBumpPoints(-1)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[3rem] text-center text-[15px] font-bold tabular">
            {me.points ?? 0}
          </span>
          <button
            type="button"
            onClick={() => onBumpPoints(1)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onBumpScore(0, 1)}
            className="ml-2 rounded-lg border border-line px-3 py-2 text-[12px] font-semibold text-muted"
          >
            +1 hole
          </button>
        </div>
      </section>
    );
  }

  if (mode.primary === 'skins') {
    return (
      <section className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
        <span className="text-[13px] font-semibold text-ink">Update you</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-faint">Score</span>
          <button
            type="button"
            onClick={() => onBumpScore(-1, 0)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[2.5rem] text-center text-[14px] font-bold tabular">
            {formatToPar(me.to_par)}
          </span>
          <button
            type="button"
            onClick={() => onBumpScore(1, 0)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line"
          >
            <Plus className="h-4 w-4" />
          </button>
          <span className="ml-2 mr-1 text-[11px] text-faint">Skins</span>
          <button
            type="button"
            onClick={() => onBumpSkins(-1)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[2rem] text-center text-[14px] font-bold tabular">
            {me.skins_won}
          </span>
          <button
            type="button"
            onClick={() => onBumpSkins(1)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onBumpScore(0, 1)}
            className="ml-1 rounded-lg border border-line px-3 py-2 text-[12px] font-semibold text-muted"
          >
            +1 hole
          </button>
        </div>
      </section>
    );
  }

  if (mode.primary === 'match') {
    return (
      <section className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
        <span className="text-[13px] font-semibold text-ink">Holes up/down</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onBumpMatch(-1)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line"
            title="One down"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[3.5rem] text-center text-[15px] font-bold tabular">
            {formatPrimaryStat('match', me, formatToPar)}
          </span>
          <button
            type="button"
            onClick={() => onBumpMatch(1)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line"
            title="One up"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onBumpScore(0, 1)}
            className="ml-2 rounded-lg border border-line px-3 py-2 text-[12px] font-semibold text-muted"
          >
            +1 hole
          </button>
        </div>
      </section>
    );
  }

  // stroke / scramble
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
      <span className="text-[13px] font-semibold text-ink">
        {modeId === 'scramble' ? 'Team score' : 'Your score'}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onBumpScore(-1, 0)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-line"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[3rem] text-center text-[15px] font-bold tabular">
          {formatToPar(me.to_par)}
        </span>
        <button
          type="button"
          onClick={() => onBumpScore(1, 0)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-line"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onBumpScore(0, 1)}
          className="ml-2 rounded-lg border border-line px-3 py-2 text-[12px] font-semibold text-muted"
        >
          +1 hole
        </button>
      </div>
    </section>
  );
}

export function GroupView() {
  const mp = useMultiplayerGroup();
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState('');

  if (!mp.configured) {
    return (
      <div className="mx-auto max-w-lg text-[14px] text-muted">
        Multiplayer needs Supabase env vars configured.
      </div>
    );
  }

  if (!mp.user) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-ink">
          Social
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          Sign in to create or join a live multiplayer group.
        </p>
        <Link
          to="/"
          className="mt-4 inline-flex rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (mp.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[14px] text-muted">
        Loading group…
      </div>
    );
  }

  if (!mp.group) {
    return (
      <Lobby
        busy={mp.busy}
        error={mp.error}
        onCreate={mp.onCreate}
        onJoin={mp.onJoin}
      />
    );
  }

  const modeId = mp.group.game_mode ?? 'skins';
  const mode = getGameMode(modeId);
  const ranked = sortMembersForMode(mp.members, modeId);
  const me = ranked.find((m) => m.user_id === mp.user!.id);
  const pot =
    mp.group.pot_label ||
    (modeId === 'skins' && ranked.length
      ? `$${ranked.length * 10} on the table`
      : '—');

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(mp.group!.invite_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const send = () => {
    const t = note.trim();
    if (!t) return;
    void mp.onSend(t);
    setNote('');
  };

  const snapshot = [
    { label: 'Mode', value: mode.short },
    {
      label: modeId === 'skins' ? 'Pot' : 'Format',
      value: modeId === 'skins' ? pot : mode.label,
    },
    {
      label: `Your ${primaryStatLabel(modeId).toLowerCase()}`,
      value: me ? formatPrimaryStat(modeId, me, formatToPar) : '—',
    },
    { label: 'Thru', value: me ? String(me.thru) : '—' },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {mp.group.live ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                <Radio className="h-3 w-3" aria-hidden />
                Live
              </span>
            ) : null}
            <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
              {mode.label}
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
              <Users className="h-3 w-3" />
              {ranked.length} player{ranked.length === 1 ? '' : 's'}
            </span>
          </div>
          <h1 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-ink">
            {mp.group.name}
          </h1>
          <p className="mt-1 text-[14px] text-muted">
            {[mp.group.course, mp.group.format || mode.defaultFormat]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copyInvite()}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-semibold text-muted hover:text-ink"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-brand" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? 'Copied' : mp.group.invite_code}
          </button>
          <Link
            to="/rounds/gps"
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2.5 text-[13px] font-bold text-white"
          >
            Open GPS
          </Link>
          <button
            type="button"
            onClick={() => void mp.onLeave()}
            title="Leave group"
            className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-[13px] font-semibold text-muted hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" />
            Leave
          </button>
        </div>
      </header>

      {mp.error ? (
        <p className="rounded-xl border border-bad/30 bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] px-4 py-3 text-[13px] text-bad">
          {mp.error}
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {snapshot.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-line bg-surface px-3.5 py-3 shadow-card"
          >
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
              {stat.label}
            </div>
            <div className="mt-1 text-[16px] font-bold tabular text-ink">
              {stat.value}
            </div>
          </div>
        ))}
      </section>

      {me ? (
        <ModeControls
          modeId={modeId}
          me={me}
          onBumpScore={(d, t) => void mp.onBumpScore(d, t)}
          onBumpSkins={(d) => void mp.onBumpSkins(d)}
          onBumpPoints={(d) => void mp.onBumpPoints(d)}
          onBumpMatch={(d) => void mp.onBumpMatch(d)}
        />
      ) : null}

      <section className="overflow-hidden rounded-card bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-bold text-ink">Standings</h2>
          <span className="text-[12px] text-muted">{mode.blurb}</span>
        </div>
        <ul>
          {ranked.map((player, idx) => {
            const isYou = player.user_id === mp.user!.id;
            const lead = idx === 0;
            return (
              <li
                key={player.user_id}
                className={`grid grid-cols-[48px_1fr_auto] items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0 sm:grid-cols-[56px_1fr_64px_72px_72px] ${
                  isYou ? 'bg-brand-soft/40' : ''
                }`}
              >
                <span
                  className={`font-mono text-[13px] font-bold ${
                    lead ? 'text-brand' : 'text-faint'
                  }`}
                >
                  {lead ? '1st' : `${idx + 1}`}
                </span>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft font-mono text-[11px] font-semibold text-brand">
                      {player.initials}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${statusDot(player.status)}`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-ink">
                      {player.display_name}
                      {isYou ? (
                        <span className="ml-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-brand">
                          You
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-faint sm:hidden">
                      Thru {player.thru} · HCP{' '}
                      {formatHandicap(player.handicap)}
                    </div>
                  </div>
                </div>
                <span className="hidden text-right text-[13px] tabular text-muted sm:block">
                  {player.thru}
                </span>
                <span className="hidden text-right text-[13px] tabular text-muted sm:block">
                  {formatHandicap(player.handicap)}
                </span>
                <span className="text-right text-[15px] font-bold tabular text-ink">
                  {formatPrimaryStat(modeId, player, formatToPar)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-card bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="inline-flex items-center gap-2 text-[15px] font-bold text-ink">
            <MessageCircle className="h-4 w-4 text-brand" aria-hidden />
            Group chat
          </h2>
          <button
            type="button"
            onClick={() => void copyInvite()}
            className="text-[12px] font-semibold text-muted hover:text-ink"
          >
            Share {mp.group.invite_code}
          </button>
        </div>

        <div className="flex gap-2 border-b border-line px-5 py-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            placeholder="Message the group…"
            aria-label="Message the group"
            className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2.5 text-base text-ink outline-none placeholder:text-faint focus:border-brand focus-visible:ring-2 focus-visible:ring-brand"
          />
          <button
            type="button"
            onClick={send}
            disabled={!note.trim()}
            className="rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>

        <ul className="max-h-[320px] divide-y divide-line overflow-y-auto">
          {[...mp.messages].reverse().map((item) => (
            <li key={item.id} className="flex gap-3 px-5 py-3.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft font-mono text-[11px] font-semibold text-brand">
                {item.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink">
                    {item.user_id === mp.user!.id ? 'You' : item.display_name}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-faint">
                    {timeAgo(item.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
          {!mp.messages.length ? (
            <li className="px-5 py-8 text-center text-[13px] text-faint">
              No messages yet — say hey when your buddies join.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
