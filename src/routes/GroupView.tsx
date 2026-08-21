import { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { formatHandicap } from '../lib/golfHandicap';
import {
  formatToPar,
  timeAgo,
  type MemberRow,
} from '../lib/multiplayer';

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
  onCreate: (name: string, course: string, format: string, pot: string) => void;
  onJoin: (code: string) => void;
}) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('Thursday Skins');
  const [course, setCourse] = useState('');
  const [format, setFormat] = useState('$10 skins · net');
  const [pot, setPot] = useState('');
  const [code, setCode] = useState('');

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
          Multiplayer
        </span>
        <h1 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-ink">
          Play with your group
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          Create a live skins board or join with an invite code. Chat and
          standings update in realtime.
        </p>
      </div>

      <div className="flex rounded-xl border border-line p-0.5">
        <button
          type="button"
          onClick={() => setMode('create')}
          className={
            mode === 'create'
              ? 'flex-1 rounded-lg bg-brand-soft py-2 text-[13px] font-semibold text-brand'
              : 'flex-1 rounded-lg py-2 text-[13px] font-medium text-muted'
          }
        >
          Create group
        </button>
        <button
          type="button"
          onClick={() => setMode('join')}
          className={
            mode === 'join'
              ? 'flex-1 rounded-lg bg-brand-soft py-2 text-[13px] font-semibold text-brand'
              : 'flex-1 rounded-lg py-2 text-[13px] font-medium text-muted'
          }
        >
          Join with code
        </button>
      </div>

      <section className="rounded-card bg-surface p-5 shadow-card">
        {mode === 'create' ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              onCreate(name, course, format, pot);
            }}
          >
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
                Group name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[14px] text-ink outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
                Course
              </span>
              <input
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="e.g. Rancho Park · Blue"
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[14px] text-ink outline-none focus:border-brand"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
                  Format
                </span>
                <input
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[14px] text-ink outline-none focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
                  Pot
                </span>
                <input
                  value={pot}
                  onChange={(e) => setPot(e.target.value)}
                  placeholder="$40"
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[14px] text-ink outline-none focus:border-brand"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="mt-2 rounded-xl bg-brand px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
            >
              {busy ? 'Creating…' : 'Create & go live'}
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
              <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
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

  const ranked = [...mp.members].sort((a, b) => {
    if (a.to_par !== b.to_par) return a.to_par - b.to_par;
    return b.thru - a.thru;
  });
  const me = ranked.find((m) => m.user_id === mp.user!.id);
  const pot =
    mp.group.pot_label ||
    (ranked.length ? `$${ranked.length * 10} on the table` : '—');

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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {mp.group.live ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-brand">
                <Radio className="h-3 w-3" aria-hidden />
                Live
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
              <Users className="h-3 w-3" />
              {ranked.length} player{ranked.length === 1 ? '' : 's'}
            </span>
          </div>
          <h1 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-ink">
            {mp.group.name}
          </h1>
          <p className="mt-1 text-[14px] text-muted">
            {[mp.group.course, mp.group.format].filter(Boolean).join(' · ') ||
              'Multiplayer skins'}
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
        {[
          { label: 'Pot', value: pot },
          { label: 'Your score', value: me ? formatToPar(me.to_par) : '—' },
          { label: 'Thru', value: me ? String(me.thru) : '—' },
          {
            label: 'Skins',
            value: me ? String(me.skins_won) : '0',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-line bg-surface px-3.5 py-3 shadow-card"
          >
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
              {stat.label}
            </div>
            <div className="mt-1 text-[16px] font-bold tabular text-ink">
              {stat.value}
            </div>
          </div>
        ))}
      </section>

      {/* Quick score bump for you */}
      {me ? (
        <section className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
          <span className="text-[13px] font-semibold text-ink">Update you</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void mp.onBumpScore(-1, 0)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink hover:bg-canvas"
              title="Better by 1"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-[3rem] text-center text-[15px] font-bold tabular text-ink">
              {formatToPar(me.to_par)}
            </span>
            <button
              type="button"
              onClick={() => void mp.onBumpScore(1, 0)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink hover:bg-canvas"
              title="Worse by 1"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void mp.onBumpScore(0, 1)}
              className="ml-2 rounded-lg border border-line px-3 py-2 text-[12px] font-semibold text-muted hover:text-ink"
            >
              +1 hole
            </button>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-card bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-bold text-ink">Standings</h2>
          <span className="text-[12px] text-muted">Realtime</span>
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
                        <span className="ml-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-brand">
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
                  {formatToPar(player.to_par)}
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
            className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand"
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
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft font-mono text-[10px] font-semibold text-brand">
                {item.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink">
                    {item.user_id === mp.user!.id ? 'You' : item.display_name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-faint">
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
