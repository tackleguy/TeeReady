/** Local-first driving range session storage. */

import type { RangeSession } from './types';

const SESSIONS_KEY = 'teeready-range-sessions-v1';
const ACTIVE_KEY = 'teeready-range-active-v1';
const MAX_SESSIONS = 20;

export const RANGE_HISTORY_EVENT = 'teeready-range-history-changed';

function notify(): void {
  window.dispatchEvent(new Event(RANGE_HISTORY_EVENT));
}

export function loadRangeSessions(): RangeSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RangeSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: RangeSession[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
    notify();
  } catch {
    // Quota — ignore.
  }
}

export function getActiveSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function setActiveSessionId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
    notify();
  } catch {
    // ignore
  }
}

export function getRangeSession(id: string): RangeSession | null {
  return loadRangeSessions().find((s) => s.id === id) ?? null;
}

export function getActiveSession(): RangeSession | null {
  const id = getActiveSessionId();
  if (!id) return null;
  const session = getRangeSession(id);
  if (!session || session.endedAt) {
    setActiveSessionId(null);
    return null;
  }
  return session;
}

export function startRangeSession(club: string): RangeSession {
  const activeId = getActiveSessionId();
  let sessions = loadRangeSessions();
  if (activeId) {
    sessions = sessions.map((s) =>
      s.id === activeId && !s.endedAt ? { ...s, endedAt: Date.now() } : s,
    );
  }

  const session: RangeSession = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    club,
    shotIds: [],
  };
  saveSessions([session, ...sessions]);
  setActiveSessionId(session.id);
  return session;
}

export function endRangeSession(id: string): void {
  const sessions = loadRangeSessions().map((s) =>
    s.id === id ? { ...s, endedAt: Date.now() } : s,
  );
  saveSessions(sessions);
  if (getActiveSessionId() === id) setActiveSessionId(null);
}

export function addShotToSession(sessionId: string, launchId: string): boolean {
  const sessions = loadRangeSessions();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) return false;
  const session = sessions[idx]!;
  if (session.endedAt) return false;
  if (session.shotIds.includes(launchId)) return true;
  sessions[idx] = { ...session, shotIds: [...session.shotIds, launchId] };
  saveSessions(sessions);
  return true;
}

/** Append to the active session if one is open. */
export function addShotToActiveSession(launchId: string): boolean {
  const active = getActiveSession();
  if (!active) return false;
  return addShotToSession(active.id, launchId);
}

export function deleteRangeSession(id: string): void {
  saveSessions(loadRangeSessions().filter((s) => s.id !== id));
  if (getActiveSessionId() === id) setActiveSessionId(null);
}
