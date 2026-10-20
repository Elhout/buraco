-- Phase 1: core scoring schema (clubs, games, seats, rounds, round lines, audit log).
-- Accounts/PIN (pins, devices) arrive in phase 2, tournaments in phase 4.
-- Clients only read tables (RLS-scoped to their clubs); every game write goes through an RPC.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- enums

create type public.club_role as enum ('owner', 'admin', 'member');
create type public.game_mode as enum ('normal', 'ghost');
create type public.game_status as enum ('draft', 'inviting', 'live', 'finished', 'abandoned', 'expired');
create type public.team as enum ('A', 'B');
create type public.invite_status as enum ('invited', 'confirmed', 'declined');
create type public.round_status as enum ('pending', 'confirmed', 'voided');
create type public.round_line_type as enum ('cut_bonus');

-- ---------------------------------------------------------------- helpers

-- 6 chars from a 32-symbol alphabet (no I/O/0/1); 256 % 32 = 0 so there is no modulo bias.
create function public.generate_invite_code() returns text
language sql volatile security definer set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(r.bytes, i) % 32) + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(6) as bytes) r, generate_series(0, 5) i
$$;

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url   text,
  lang         text not null default 'en' check (lang in ('en', 'ar')),
  created_at   timestamptz not null default now()
);

create table public.clubs (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 60),
  owner_id       uuid not null references public.profiles (id),
  invite_code    text not null unique default public.generate_invite_code(),
  target_score   integer not null default 2000 check (target_score > 0),
  cut_bonus      integer not null default 100 check (cut_bonus >= 0),
  allow_negative boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.club_members (
  club_id    uuid not null references public.clubs (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.club_role not null default 'member',
  joined_at  timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_id_idx on public.club_members (user_id);

create table public.games (
  id                  uuid primary key default gen_random_uuid(),
  club_id             uuid not null references public.clubs (id) on delete cascade,
  host_id             uuid not null references public.profiles (id),
  mode                public.game_mode not null,
  status              public.game_status not null default 'draft',
  -- Filled from the club on insert and immutable afterwards (see trigger).
  config_snapshot     jsonb not null,
  verified            boolean not null default false,
  winner_team         public.team,
  started_at          timestamptz,
  finished_at         timestamptz,
  tournament_match_id uuid, -- FK added with tournaments in phase 4
  created_at          timestamptz not null default now(),
  constraint games_winner_iff_finished check ((status = 'finished') = (winner_team is not null))
);
create index games_club_status_idx on public.games (club_id, status);

create table public.game_seats (
  game_id        uuid not null references public.games (id) on delete cascade,
  seat           smallint not null check (seat between 1 and 4),
  team           public.team not null,
  user_id        uuid references public.profiles (id),
  guest_name     text check (char_length(guest_name) between 1 and 40),
  invite_status  public.invite_status not null default 'invited',
  confirmed_at   timestamptz,
  is_scorekeeper boolean not null default false,
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  primary key (game_id, seat),
  unique (game_id, user_id),
  constraint game_seats_one_occupant check (num_nonnulls(user_id, guest_name) = 1)
);
create index game_seats_user_id_idx on public.game_seats (user_id);
create unique index game_seats_one_scorekeeper_per_team on public.game_seats (game_id, team) where is_scorekeeper;

create table public.rounds (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null references public.games (id) on delete cascade,
  round_no          integer not null check (round_no > 0),
  team_a_score      integer not null,
  team_b_score      integer not null,
  entered_by_seat   smallint not null,
  status            public.round_status not null default 'pending',
  confirmed_by_seat smallint,
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (game_id, round_no),
  foreign key (game_id, entered_by_seat) references public.game_seats (game_id, seat),
  foreign key (game_id, confirmed_by_seat) references public.game_seats (game_id, seat)
);
create unique index rounds_one_pending_per_game on public.rounds (game_id) where status = 'pending';

create table public.round_lines (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references public.rounds (id) on delete cascade,
  type       public.round_line_type not null default 'cut_bonus',
  seat       smallint not null check (seat between 1 and 4),
  points     integer not null,
  created_at timestamptz not null default now()
);
create index round_lines_round_id_idx on public.round_lines (round_id);

create table public.game_events (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games (id) on delete cascade,
  type       text not null,
  actor_seat smallint,
  actor_id   uuid references public.profiles (id), -- the host of a ghost game may not be seated
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index game_events_game_id_idx on public.game_events (game_id);

-- ---------------------------------------------------------------- views

create view public.v_game_totals with (security_invoker = true) as
with contrib as (
  select r.game_id, r.team_a_score as a, r.team_b_score as b
  from public.rounds r
  where r.status = 'confirmed'
  union all
  select r.game_id,
         case when s.team = 'A' then l.points else 0 end,
         case when s.team = 'B' then l.points else 0 end
  from public.round_lines l
  join public.rounds r on r.id = l.round_id and r.status = 'confirmed'
  join public.game_seats s on s.game_id = r.game_id and s.seat = l.seat
)
select g.id as game_id,
       coalesce(sum(c.a), 0)::integer as team_a_total,
       coalesce(sum(c.b), 0)::integer as team_b_total,
       (select count(*) from public.rounds r where r.game_id = g.id and r.status = 'confirmed')::integer as rounds_played
from public.games g
left join contrib c on c.game_id = g.id
group by g.id;

-- ---------------------------------------------------------------- triggers

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Player'), 40));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.add_club_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.club_members (club_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;

create trigger clubs_add_owner
  after insert on public.clubs
  for each row execute function public.add_club_owner();

create function public.snapshot_game_config() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'draft' then
    raise exception 'games must be created as draft' using errcode = 'check_violation';
  end if;
  select jsonb_build_object(
           'target_score', c.target_score,
           'cut_bonus', c.cut_bonus,
           'allow_negative', c.allow_negative)
    into new.config_snapshot
  from public.clubs c
  where c.id = new.club_id;
  return new;
end $$;

create trigger games_snapshot_config
  before insert on public.games
  for each row execute function public.snapshot_game_config();

-- Only the paths in the lifecycle diagram (docs/SPEC.md) are allowed.
create function public.enforce_game_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.config_snapshot is distinct from old.config_snapshot or new.club_id <> old.club_id then
    raise exception 'config_snapshot and club_id are immutable' using errcode = 'check_violation';
  end if;
  -- A terminal game's result is history; only ghost retro-verification (verified false -> true) may touch it.
  if old.status in ('finished', 'abandoned', 'expired') then
    if (to_jsonb(new) - 'verified') is distinct from (to_jsonb(old) - 'verified')
       or (old.verified and not new.verified) then
      raise exception 'a % game is frozen', old.status using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.status = old.status then
    return new;
  end if;
  if not (
    (old.status::text, new.status::text) in (
      ('draft', 'inviting'), ('draft', 'abandoned'),
      ('inviting', 'live'), ('inviting', 'expired'), ('inviting', 'abandoned'),
      ('live', 'finished'), ('live', 'abandoned'))
    or (old.status = 'draft' and new.status = 'live' and new.mode = 'ghost')
  ) then
    raise exception 'illegal game transition % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  if new.status = 'live' then
    new.started_at := coalesce(new.started_at, now());
  elsif new.status in ('finished', 'abandoned', 'expired') then
    new.finished_at := coalesce(new.finished_at, now());
  end if;
  return new;
end $$;

create trigger games_enforce_transition
  before update on public.games
  for each row execute function public.enforce_game_transition();

-- ---------------------------------------------------------------- RLS

-- security definer so policies on club_members do not recurse into themselves.
create function public.is_club_member(p_club_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = (select auth.uid())
  )
$$;

create function public.is_club_admin(p_club_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = (select auth.uid()) and role in ('owner', 'admin')
  )
$$;

create function public.shares_club_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.club_members mine
    join public.club_members theirs on theirs.club_id = mine.club_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  )
$$;

create function public.can_read_game(p_game_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id and public.is_club_member(g.club_id)
  )
$$;

alter table public.profiles     enable row level security;
alter table public.clubs        enable row level security;
alter table public.club_members enable row level security;
alter table public.games        enable row level security;
alter table public.game_seats   enable row level security;
alter table public.rounds       enable row level security;
alter table public.round_lines  enable row level security;
alter table public.game_events  enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_club_with(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- owner_id check lets INSERT ... RETURNING see the row before the owner membership exists.
create policy clubs_select on public.clubs for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_club_member(id));
create policy clubs_insert on public.clubs for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy clubs_update_admin on public.clubs for update to authenticated
  using (public.is_club_admin(id)) with check (public.is_club_admin(id));

create policy club_members_select on public.club_members for select to authenticated
  using (public.is_club_member(club_id));
create policy club_members_leave on public.club_members for delete to authenticated
  using (user_id = (select auth.uid()) and role <> 'owner');

create policy games_select on public.games for select to authenticated
  using (public.is_club_member(club_id));
create policy game_seats_select on public.game_seats for select to authenticated
  using (public.can_read_game(game_id));
create policy rounds_select on public.rounds for select to authenticated
  using (public.can_read_game(game_id));
create policy round_lines_select on public.round_lines for select to authenticated
  using (exists (select 1 from public.rounds r where r.id = round_id and public.can_read_game(r.game_id)));
create policy game_events_select on public.game_events for select to authenticated
  using (public.can_read_game(game_id));

-- ---------------------------------------------------------------- RPCs (ghost mode, phase 1)

-- Locks a live ghost game hosted by the caller. Normal-mode games get PIN-checked RPCs in phase 2.
create function public.lock_ghost_game(p_game_id uuid) returns public.games
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game not found' using errcode = 'no_data_found';
  end if;
  if g.host_id is distinct from (select auth.uid()) or not public.is_club_member(g.club_id) then
    raise exception 'only the host can score a ghost game' using errcode = 'insufficient_privilege';
  end if;
  if g.mode <> 'ghost' then
    raise exception 'normal games require PIN confirmation' using errcode = 'feature_not_supported';
  end if;
  if g.status <> 'live' then
    raise exception 'game is not live' using errcode = 'invalid_parameter_value';
  end if;
  return g;
end $$;

-- In a ghost game the host scores for both sides: their own team "enters" (team A if the host is
-- not seated) and the other team's scorekeeper "confirms". p_entering picks which of the two.
create function public.ghost_scorekeeper_seat(g public.games, p_entering boolean) returns smallint
language sql stable security definer set search_path = '' as $$
  with entering as (
    select coalesce((select team from public.game_seats where game_id = g.id and user_id = g.host_id), 'A') as team
  )
  select s.seat
  from public.game_seats s, entering e
  where s.game_id = g.id
    and s.is_scorekeeper
    and (s.team = e.team) = p_entering
$$;

-- p_seats: [{"seat":1,"team":"A","user_id":"…"} | {"seat":2,"team":"B","guest_name":"Ali"}, …] × 4
create function public.create_ghost_game(p_club_id uuid, p_seats jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := (select auth.uid());
  v_game_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_club_member(p_club_id) then
    raise exception 'not a member of this club' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_seats) is distinct from 'array' or jsonb_array_length(p_seats) <> 4 then
    raise exception 'exactly 4 seats are required' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.games (club_id, host_id, mode)
  values (p_club_id, v_uid, 'ghost')
  returning id into v_game_id;

  insert into public.game_seats (game_id, seat, team, user_id, guest_name)
  select v_game_id,
         (s ->> 'seat')::smallint,
         (s ->> 'team')::public.team,
         nullif(s ->> 'user_id', '')::uuid,
         nullif(btrim(s ->> 'guest_name'), '')
  from jsonb_array_elements(p_seats) s;

  if (select count(*) from public.game_seats where game_id = v_game_id and team = 'A') <> 2 then
    raise exception 'each team needs exactly 2 players' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from public.game_seats s
    where s.game_id = v_game_id
      and s.user_id is not null
      and not exists (select 1 from public.club_members m where m.club_id = p_club_id and m.user_id = s.user_id)
  ) then
    raise exception 'every seated member must belong to the club' using errcode = 'invalid_parameter_value';
  end if;

  -- One scorekeeper per team: the host's own seat if seated there, otherwise the lowest seat.
  update public.game_seats s set is_scorekeeper = true
  where s.game_id = v_game_id
    and s.seat in (
      select distinct on (team) seat
      from public.game_seats
      where game_id = v_game_id
      order by team, (user_id = v_uid) desc nulls last, seat
    );

  update public.games set status = 'live' where id = v_game_id;

  insert into public.game_events (game_id, type, actor_id, payload)
  values (v_game_id, 'created', v_uid, jsonb_build_object('mode', 'ghost'));

  return v_game_id;
end $$;

create function public.submit_round(
  p_game_id   uuid,
  p_team_a    integer,
  p_team_b    integer,
  p_cut_seats smallint[] default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  g          public.games;
  v_round_id uuid;
  v_round_no integer;
begin
  g := public.lock_ghost_game(p_game_id);

  if p_team_a is null or p_team_b is null then
    raise exception 'both team scores are required' using errcode = 'invalid_parameter_value';
  end if;
  if abs(p_team_a) > 99999 or abs(p_team_b) > 99999 then
    raise exception 'round score out of range' using errcode = 'invalid_parameter_value';
  end if;
  if not (g.config_snapshot ->> 'allow_negative')::boolean and (p_team_a < 0 or p_team_b < 0) then
    raise exception 'negative round scores are not allowed in this club' using errcode = 'invalid_parameter_value';
  end if;
  p_cut_seats := coalesce(p_cut_seats, '{}');
  if cardinality(p_cut_seats) > 4
     or array_position(p_cut_seats, null) is not null
     or exists (select 1 from unnest(p_cut_seats) c where c not between 1 and 4)
     or (select count(distinct c) from unnest(p_cut_seats) c) <> cardinality(p_cut_seats) then
    raise exception 'cut seats must be distinct seats 1-4' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.rounds where game_id = p_game_id and status = 'pending') then
    raise exception 'a round is already waiting for confirmation' using errcode = 'unique_violation';
  end if;

  select coalesce(max(round_no), 0) + 1 into v_round_no from public.rounds where game_id = p_game_id;

  insert into public.rounds (game_id, round_no, team_a_score, team_b_score, entered_by_seat)
  values (p_game_id, v_round_no, p_team_a, p_team_b, public.ghost_scorekeeper_seat(g, true))
  returning id into v_round_id;

  insert into public.round_lines (round_id, type, seat, points)
  select v_round_id, 'cut_bonus', c, (g.config_snapshot ->> 'cut_bonus')::integer
  from unnest(p_cut_seats) c;

  return v_round_id;
end $$;

-- Confirms the pending round and finishes the game when a team is at/over target with unequal totals.
create function public.confirm_round(p_round_id uuid) returns public.games
language plpgsql security definer set search_path = '' as $$
declare
  v_game_id uuid;
  g         public.games;
  r         public.rounds;
  t         record;
  v_target  integer;
begin
  select game_id into v_game_id from public.rounds where id = p_round_id;
  if not found then
    raise exception 'round not found' using errcode = 'no_data_found';
  end if;

  g := public.lock_ghost_game(v_game_id);

  select * into r from public.rounds where id = p_round_id for update;
  if r.status <> 'pending' then
    raise exception 'round is not pending' using errcode = 'invalid_parameter_value';
  end if;

  update public.rounds
  set status = 'confirmed',
      confirmed_at = now(),
      confirmed_by_seat = public.ghost_scorekeeper_seat(g, false)
  where id = p_round_id;

  select * into t from public.v_game_totals where game_id = v_game_id;
  v_target := (g.config_snapshot ->> 'target_score')::integer;

  if (t.team_a_total >= v_target or t.team_b_total >= v_target) and t.team_a_total <> t.team_b_total then
    update public.games
    set status = 'finished',
        winner_team = (case when t.team_a_total > t.team_b_total then 'A' else 'B' end)::public.team
    where id = v_game_id
    returning * into g;
  end if;

  return g;
end $$;

-- ---------------------------------------------------------------- grants

-- Supabase grants every new public function to anon and authenticated directly, so revoking
-- from PUBLIC alone is not enough.

-- Clients may only set these club columns; owner transfer and invite rotation get RPCs.
revoke insert, update on public.clubs from anon, authenticated;
grant insert (name, owner_id, target_score, cut_bonus, allow_negative) on public.clubs to authenticated;
grant update (name, target_score, cut_bonus, allow_negative) on public.clubs to authenticated;

-- Internal: triggers and RPC building blocks.
revoke execute on function
  public.lock_ghost_game(uuid),
  public.ghost_scorekeeper_seat(public.games, boolean),
  public.handle_new_user(),
  public.add_club_owner(),
  public.snapshot_game_config(),
  public.enforce_game_transition()
from public, anon, authenticated;

-- Needed by RLS policies and column defaults evaluated as the signed-in caller.
revoke execute on function
  public.is_club_member(uuid),
  public.is_club_admin(uuid),
  public.shares_club_with(uuid),
  public.can_read_game(uuid),
  public.generate_invite_code()
from public, anon;
grant execute on function
  public.is_club_member(uuid),
  public.is_club_admin(uuid),
  public.shares_club_with(uuid),
  public.can_read_game(uuid),
  public.generate_invite_code()
to authenticated;

revoke execute on function public.create_ghost_game(uuid, jsonb) from public, anon;
revoke execute on function public.submit_round(uuid, integer, integer, smallint[]) from public, anon;
revoke execute on function public.confirm_round(uuid) from public, anon;
grant execute on function public.create_ghost_game(uuid, jsonb) to authenticated;
grant execute on function public.submit_round(uuid, integer, integer, smallint[]) to authenticated;
grant execute on function public.confirm_round(uuid) to authenticated;
