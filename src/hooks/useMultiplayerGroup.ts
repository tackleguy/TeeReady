import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import {
  createGroup,
  fetchGroup,
  fetchMembers,
  fetchMessages,
  getActiveGroupId,
  joinGroup,
  leaveGroup,
  playerIdentity,
  postMessage,
  setActiveGroupId,
  updateMyStanding,
  type GroupRow,
  type MemberRow,
  type MessageRow,
} from '../lib/multiplayer';
import type { GameModeId } from '../lib/gameModes';

export function useMultiplayerGroup() {
  const { user, configured } = useAuth();
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (groupId: string) => {
    const [g, m, msgs] = await Promise.all([
      fetchGroup(groupId),
      fetchMembers(groupId),
      fetchMessages(groupId),
    ]);
    if (!g) {
      setActiveGroupId(null);
      setGroup(null);
      setMembers([]);
      setMessages([]);
      return;
    }
    setGroup(g);
    setMembers(m);
    setMessages(msgs);
  }, []);

  // Load active group + sync my profile into membership
  useEffect(() => {
    if (!configured || !user || !supabase) {
      setLoading(false);
      setGroup(null);
      setMembers([]);
      setMessages([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const id = getActiveGroupId();
        if (!id) {
          if (!cancelled) {
            setGroup(null);
            setMembers([]);
            setMessages([]);
          }
          return;
        }
        await refresh(id);
        const identity = playerIdentity();
        await updateMyStanding(id, user.id, {
          display_name: identity.display_name,
          initials: identity.initials,
          handicap: identity.handicap,
        });
        if (!cancelled) await refresh(id);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load group');
          setActiveGroupId(null);
          setGroup(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [configured, user, refresh]);

  // Realtime
  useEffect(() => {
    const client = supabase;
    if (!client || !group?.id || !user) return;
    const channel = client
      .channel(`teeready-group-${group.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teeready_group_members',
          filter: `group_id=eq.${group.id}`,
        },
        () => {
          void fetchMembers(group.id).then(setMembers);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'teeready_group_messages',
          filter: `group_id=eq.${group.id}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row],
          );
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [group?.id, user]);

  // Presence heartbeat — mark playing while Social is open
  useEffect(() => {
    if (!group?.id || !user) return;
    const tick = () => {
      void updateMyStanding(group.id, user.id, { status: 'playing' });
    };
    tick();
    const id = window.setInterval(tick, 45_000);
    return () => {
      window.clearInterval(id);
      void updateMyStanding(group.id, user.id, { status: 'away' });
    };
  }, [group?.id, user]);

  const onCreate = useCallback(
    async (
      name: string,
      course: string,
      format: string,
      pot: string,
      gameMode: GameModeId,
    ) => {
      if (!user) return false;
      setBusy(true);
      setError(null);
      try {
        const g = await createGroup({
          name,
          course,
          format,
          potLabel: pot,
          gameMode,
          userId: user.id,
        });
        await refresh(g.id);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create group');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [user, refresh],
  );

  const onJoin = useCallback(
    async (code: string) => {
      if (!user) return;
      setBusy(true);
      setError(null);
      try {
        const gid = await joinGroup(code, user.id);
        await refresh(gid);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not join group');
      } finally {
        setBusy(false);
      }
    },
    [user, refresh],
  );

  const onLeave = useCallback(async () => {
    if (!user || !group) return;
    setBusy(true);
    setError(null);
    try {
      await leaveGroup(group.id, user.id);
      setGroup(null);
      setMembers([]);
      setMessages([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not leave group');
    } finally {
      setBusy(false);
    }
  }, [user, group]);

  const onSend = useCallback(
    async (body: string) => {
      if (!user || !group) return;
      setError(null);
      try {
        await postMessage(group.id, user.id, body);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not send message');
      }
    },
    [user, group],
  );

  const onBumpScore = useCallback(
    async (deltaPar: number, thruDelta = 0) => {
      if (!user || !group) return;
      const me = members.find((m) => m.user_id === user.id);
      if (!me) return;
      try {
        await updateMyStanding(group.id, user.id, {
          to_par: me.to_par + deltaPar,
          thru: Math.min(18, Math.max(0, me.thru + thruDelta)),
          status: 'playing',
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update score');
      }
    },
    [user, group, members],
  );

  const onBumpSkins = useCallback(
    async (delta: number) => {
      if (!user || !group) return;
      const me = members.find((m) => m.user_id === user.id);
      if (!me) return;
      try {
        await updateMyStanding(group.id, user.id, {
          skins_won: Math.max(0, me.skins_won + delta),
          status: 'playing',
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update skins');
      }
    },
    [user, group, members],
  );

  const onBumpPoints = useCallback(
    async (delta: number) => {
      if (!user || !group) return;
      const me = members.find((m) => m.user_id === user.id);
      if (!me) return;
      try {
        await updateMyStanding(group.id, user.id, {
          points: Math.max(0, (me.points ?? 0) + delta),
          status: 'playing',
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update points');
      }
    },
    [user, group, members],
  );

  const onBumpMatch = useCallback(
    async (delta: number) => {
      if (!user || !group) return;
      const me = members.find((m) => m.user_id === user.id);
      if (!me) return;
      try {
        // skins_won stores holes up (can go negative for down)
        await updateMyStanding(group.id, user.id, {
          skins_won: me.skins_won + delta,
          status: 'playing',
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update match');
      }
    },
    [user, group, members],
  );

  return {
    configured,
    user,
    group,
    members,
    messages,
    loading,
    busy,
    error,
    onCreate,
    onJoin,
    onLeave,
    onSend,
    onBumpScore,
    onBumpSkins,
    onBumpPoints,
    onBumpMatch,
    clearError: () => setError(null),
  };
}
