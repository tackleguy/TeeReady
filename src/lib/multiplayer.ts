/** TeeReady multiplayer groups — Supabase-backed social board. */

import { supabase } from './supabase';
import { loadDisplayProfile } from './mock';
import { loadGolfProfile, DEFAULT_PROFILE } from './golfProfile';
import { getGameMode, type GameModeId, isGameModeId } from './gameModes';

const ACTIVE_GROUP_KEY = 'teeready-active-group-v1';

export type GroupRow = {
  id: string;
  name: string;
  invite_code: string;
  course: string;
  format: string;
  pot_label: string;
  game_mode: GameModeId;
  live: boolean;
  hole_focus: number;
  created_by: string;
  created_at: string;
};

export type MemberRow = {
  group_id: string;
  user_id: string;
  display_name: string;
  initials: string;
  handicap: number;
  thru: number;
  to_par: number;
  status: 'playing' | 'finished' | 'away';
  skins_won: number;
  points: number;
  updated_at: string;
  joined_at: string;
};

export type MessageRow = {
  id: string;
  group_id: string;
  user_id: string;
  display_name: string;
  initials: string;
  body: string;
  created_at: string;
};

export function getActiveGroupId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_GROUP_KEY);
  } catch {
    return null;
  }
}

export function setActiveGroupId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_GROUP_KEY, id);
    else localStorage.removeItem(ACTIVE_GROUP_KEY);
  } catch {
    // ignore
  }
}

function randomInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return out;
}

export function playerIdentity() {
  const display = loadDisplayProfile();
  const golf = loadGolfProfile() ?? DEFAULT_PROFILE;
  return {
    display_name: display.name,
    initials: display.initials,
    handicap: golf.handicap,
  };
}

export async function fetchGroup(groupId: string): Promise<GroupRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('teeready_groups')
    .select('*')
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  const row = data as GroupRow | null;
  if (row && !isGameModeId(row.game_mode)) row.game_mode = 'skins';
  return row;
}

export async function fetchMembers(groupId: string): Promise<MemberRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('teeready_group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('to_par', { ascending: true })
    .order('thru', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as MemberRow[]).map((m) => ({
    ...m,
    points: Number.isFinite(m.points) ? m.points : 0,
  }));
}

export async function fetchMessages(
  groupId: string,
  limit = 40,
): Promise<MessageRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('teeready_group_messages')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as MessageRow[]).reverse();
}

export async function createGroup(input: {
  name: string;
  course?: string;
  format?: string;
  potLabel?: string;
  gameMode?: GameModeId;
  userId: string;
}): Promise<GroupRow> {
  if (!supabase) throw new Error('Supabase not configured');
  const identity = playerIdentity();
  const invite = randomInviteCode();
  const mode = input.gameMode && isGameModeId(input.gameMode)
    ? input.gameMode
    : 'skins';
  const modeMeta = getGameMode(mode);
  const { data: group, error } = await supabase
    .from('teeready_groups')
    .insert({
      name: input.name.trim() || modeMeta.defaultName,
      invite_code: invite,
      course: input.course?.trim() ?? '',
      format: input.format?.trim() || modeMeta.defaultFormat,
      pot_label: input.potLabel?.trim() ?? '',
      game_mode: mode,
      live: true,
      hole_focus: 1,
      created_by: input.userId,
    })
    .select('*')
    .single();
  if (error) throw error;

  const { error: memErr } = await supabase.from('teeready_group_members').insert({
    group_id: group.id,
    user_id: input.userId,
    display_name: identity.display_name,
    initials: identity.initials,
    handicap: identity.handicap,
    status: 'playing',
    thru: 0,
    to_par: 0,
    skins_won: 0,
    points: 0,
  });
  if (memErr) throw memErr;

  setActiveGroupId(group.id);
  const row = group as GroupRow;
  if (!isGameModeId(row.game_mode)) row.game_mode = 'skins';
  return row;
}

export async function joinGroup(code: string, userId: string): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured');
  const identity = playerIdentity();
  const { data, error } = await supabase.rpc('teeready_join_group', {
    p_code: code.trim().toUpperCase(),
    p_display_name: identity.display_name,
    p_initials: identity.initials,
    p_handicap: identity.handicap,
  });
  if (error) throw error;
  const gid = data as string;
  setActiveGroupId(gid);
  void userId;
  return gid;
}

export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('teeready_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
  if (getActiveGroupId() === groupId) setActiveGroupId(null);
}

export async function postMessage(
  groupId: string,
  userId: string,
  body: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');
  const identity = playerIdentity();
  const text = body.trim();
  if (!text) return;
  const { error } = await supabase.from('teeready_group_messages').insert({
    group_id: groupId,
    user_id: userId,
    display_name: identity.display_name,
    initials: identity.initials,
    body: text.slice(0, 500),
  });
  if (error) throw error;
}

export async function updateMyStanding(
  groupId: string,
  userId: string,
  patch: Partial<
    Pick<
      MemberRow,
      | 'thru'
      | 'to_par'
      | 'status'
      | 'skins_won'
      | 'points'
      | 'handicap'
      | 'display_name'
      | 'initials'
    >
  >,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('teeready_group_members')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
}

export function formatToPar(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : String(n);
}

export function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 45) return 'now';
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}
