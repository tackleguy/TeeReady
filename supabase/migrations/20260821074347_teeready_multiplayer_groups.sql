-- TeeReady multiplayer groups + membership helper. Mirrors remote 20260821074347 / 20260821082332.

create schema if not exists private;

create or replace function private.teeready_is_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.teeready_group_members m
    where m.group_id = gid and m.user_id = auth.uid()
  );
$$;

revoke all on function private.teeready_is_member(uuid) from public;
grant execute on function private.teeready_is_member(uuid) to authenticated;

create table if not exists public.teeready_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  course text not null default '',
  format text not null default 'Skins',
  pot_label text not null default '',
  live boolean not null default true,
  hole_focus integer not null default 1,
  game_mode text not null default 'skins',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.teeready_group_members (
  group_id uuid not null references public.teeready_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default 'Golfer',
  initials text not null default '??',
  handicap double precision not null default 18,
  thru integer not null default 0,
  to_par integer not null default 0,
  status text not null default 'playing',
  skins_won integer not null default 0,
  points integer not null default 0,
  updated_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.teeready_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.teeready_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default 'Golfer',
  initials text not null default '??',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists teeready_group_messages_group_created_idx
  on public.teeready_group_messages (group_id, created_at desc);

alter table public.teeready_groups enable row level security;
alter table public.teeready_group_members enable row level security;
alter table public.teeready_group_messages enable row level security;

create policy teeready_groups_select
  on public.teeready_groups for select
  using (private.teeready_is_member(id) or created_by = auth.uid());

create policy teeready_groups_insert
  on public.teeready_groups for insert
  with check (created_by = auth.uid());

create policy teeready_groups_update
  on public.teeready_groups for update
  using (created_by = auth.uid() or private.teeready_is_member(id))
  with check (created_by = auth.uid() or private.teeready_is_member(id));

create policy teeready_members_select
  on public.teeready_group_members for select
  using (private.teeready_is_member(group_id));

create policy teeready_members_insert
  on public.teeready_group_members for insert
  with check (
    user_id = auth.uid()
    and (
      private.teeready_is_member(group_id)
      or exists (
        select 1 from public.teeready_groups g
        where g.id = teeready_group_members.group_id and g.created_by = auth.uid()
      )
    )
  );

create policy teeready_members_update
  on public.teeready_group_members for update
  using (user_id = auth.uid() and private.teeready_is_member(group_id))
  with check (user_id = auth.uid());

create policy teeready_members_delete
  on public.teeready_group_members for delete
  using (user_id = auth.uid());

create policy teeready_messages_select
  on public.teeready_group_messages for select
  using (private.teeready_is_member(group_id));

create policy teeready_messages_insert
  on public.teeready_group_messages for insert
  with check (user_id = auth.uid() and private.teeready_is_member(group_id));

create or replace function public.teeready_join_group(
  p_code text,
  p_display_name text default 'Golfer',
  p_initials text default '??',
  p_handicap double precision default 18
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  gid uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select id into gid
  from public.teeready_groups
  where upper(invite_code) = upper(trim(p_code))
  limit 1;

  if gid is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.teeready_group_members (
    group_id, user_id, display_name, initials, handicap, status
  ) values (
    gid, uid,
    coalesce(nullif(trim(p_display_name), ''), 'Golfer'),
    coalesce(nullif(trim(p_initials), ''), '??'),
    coalesce(p_handicap, 18),
    'playing'
  )
  on conflict (group_id, user_id) do update set
    display_name = excluded.display_name,
    initials = excluded.initials,
    handicap = excluded.handicap,
    updated_at = now();

  return gid;
end;
$$;

revoke all on function public.teeready_join_group(text, text, text, double precision) from public;
grant execute on function public.teeready_join_group(text, text, text, double precision) to authenticated;
