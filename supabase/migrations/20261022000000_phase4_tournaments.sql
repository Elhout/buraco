-- Phase 4: tournaments. A tournament schedules ordinary normal games (PIN invites, live screen,
-- confirmations and history are reused unchanged). Pairings come from the pure TypeScript engine
-- in packages/shared, run on the organizer's phone; start_round validates them here.

create type public.tournament_format as enum ('round_robin', 'swiss', 'knockout');
create type public.tournament_pairing as enum ('fixed', 'rotating');
create type public.tournament_status as enum ('draft', 'running', 'finished', 'cancelled');
create type public.tournament_round_status as enum ('live', 'finished');
create type public.match_result as enum ('a', 'b', 'draw');

create table public.tournaments (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.clubs (id) on delete cascade,
  organizer_id  uuid not null references public.profiles (id),
  name          text not null check (char_length(name) between 1 and 80),
  starts_on     date not null default current_date,
  format        public.tournament_format not null,
  pairing       public.tournament_pairing not null,
  round_minutes integer not null default 45 check (round_minutes between 5 and 240),
  target_score  integer not null check (target_score > 0),
  status        public.tournament_status not null default 'draft',
  season_id     uuid,
  created_at    timestamptz not null default now()
);
create index tournaments_club_idx on public.tournaments (club_id, status);

create table public.tournament_entries (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id       uuid references public.profiles (id),
  guest_name    text check (char_length(guest_name) between 1 and 40), -- ghost seat to fill a table
  pair_id       uuid, -- shared by the two entries of a fixed pair
  seed          integer,
  created_at    timestamptz not null default now(),
  unique (tournament_id, user_id),
  constraint tournament_entries_one_occupant check (num_nonnulls(user_id, guest_name) = 1)
);
create index tournament_entries_tournament_idx on public.tournament_entries (tournament_id);

create table public.tournament_rounds (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments (id) on delete cascade,
  round_no         integer not null check (round_no > 0),
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz not null,
  status           public.tournament_round_status not null default 'live',
  byes             uuid[] not null default '{}', -- unit ids: pair_id (fixed) or entry id (rotating)
  clock_warned_at  timestamptz,
  clock_expired_at timestamptz,
  created_at       timestamptz not null default now(),
  unique (tournament_id, round_no)
);
create unique index tournament_rounds_one_live on public.tournament_rounds (tournament_id) where status = 'live';

create table public.tournament_matches (
  id                  uuid primary key default gen_random_uuid(),
  tournament_round_id uuid not null references public.tournament_rounds (id) on delete cascade,
  table_no            integer not null check (table_no > 0),
  team_a_entries      uuid[] not null check (cardinality(team_a_entries) = 2),
  team_b_entries      uuid[] not null check (cardinality(team_b_entries) = 2),
  game_id             uuid references public.games (id) on delete set null,
  result              public.match_result,
  points_a            integer,
  points_b            integer,
  edited_reason       text,
  created_at          timestamptz not null default now(),
  unique (tournament_round_id, table_no)
);

create table public.tournament_events (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  type          text not null,
  actor_id      uuid references public.profiles (id),
  payload       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index tournament_events_tournament_idx on public.tournament_events (tournament_id);

-- ================================================================ games: draws, clock, target

alter table public.games
  add constraint games_tournament_match_fk foreign key (tournament_match_id) references public.tournament_matches (id) on delete set null,
  add column clock_expired_at timestamptz,
  drop constraint games_winner_iff_finished,
  add constraint games_winner_only_when_finished check (winner_team is null or status = 'finished'),
  -- A finished game has a winner, except a tournament match stopped by the clock on equal totals.
  add constraint games_finished_has_winner check (status <> 'finished' or winner_team is not null or tournament_match_id is not null);

create or replace function public.snapshot_game_config() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'draft' then
    raise exception 'games must be created as draft' using errcode = 'check_violation';
  end if;
  select jsonb_build_object(
           'target_score', coalesce(t.target_score, c.target_score),
           'cut_bonus', c.cut_bonus,
           'allow_negative', c.allow_negative)
    into new.config_snapshot
  from public.clubs c
  left join public.tournament_matches m on m.id = new.tournament_match_id
  left join public.tournament_rounds r on r.id = m.tournament_round_id
  left join public.tournaments t on t.id = r.tournament_id
  where c.id = new.club_id;
  return new;
end $$;

-- Target reached with unequal totals, or the tournament clock has run out: propose the result.
-- After the clock, equal totals are a draw, except in knockout where the next round decides.
create or replace function public.propose_result_if_over(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g          public.games;
  t          record;
  v_target   integer;
  v_winner   public.team;
  v_knockout boolean;
begin
  select * into g from public.games where id = p_game_id;
  select * into t from public.v_game_totals where game_id = p_game_id;
  v_target := (g.config_snapshot ->> 'target_score')::integer;
  v_knockout := exists (
    select 1 from public.tournament_matches m
    join public.tournament_rounds r on r.id = m.tournament_round_id
    join public.tournaments tt on tt.id = r.tournament_id
    where m.id = g.tournament_match_id and tt.format = 'knockout');

  if g.clock_expired_at is null
     and not ((t.team_a_total >= v_target or t.team_b_total >= v_target) and t.team_a_total <> t.team_b_total) then
    return;
  end if;
  if t.team_a_total = t.team_b_total and (g.clock_expired_at is null or v_knockout) then
    return;
  end if;
  if t.team_a_total <> t.team_b_total then
    v_winner := (case when t.team_a_total > t.team_b_total then 'A' else 'B' end)::public.team;
  end if;

  update public.games
  set proposed_winner = v_winner, result_proposed_at = now(), result_confirmed_teams = '{}'
  where id = p_game_id;
  perform public.log_game_event(p_game_id, 'result_proposed', null,
    jsonb_build_object('winner', v_winner, 'a', t.team_a_total, 'b', t.team_b_total, 'clock', g.clock_expired_at is not null));
  if g.mode = 'normal' then
    perform public.enqueue_notification(
      array(select user_id from public.game_seats where game_id = p_game_id and is_scorekeeper),
      'result_to_confirm', '/game/' || p_game_id || '/result',
      jsonb_build_object('winner', v_winner, 'a', t.team_a_total, 'b', t.team_b_total),
      p_game_id);
  end if;
end $$;

-- A finished match game writes its result to the match; a round ends when all its matches have.
create function public.record_match_result() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  select * into t from public.v_game_totals where game_id = new.id;
  update public.tournament_matches
  set result = case new.winner_team when 'A' then 'a' when 'B' then 'b' else 'draw' end::public.match_result,
      points_a = t.team_a_total,
      points_b = t.team_b_total
  where id = new.tournament_match_id and result is null;
  perform public.close_round_if_done((select tournament_round_id from public.tournament_matches where id = new.tournament_match_id));
  return new;
end $$;

create function public.close_round_if_done(p_round_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.tournament_rounds set status = 'finished'
  where id = p_round_id and status = 'live'
    and not exists (select 1 from public.tournament_matches where tournament_round_id = p_round_id and result is null)
$$;

create trigger games_record_match_result
  after update of status on public.games
  for each row
  when (new.status = 'finished' and old.status <> 'finished' and new.tournament_match_id is not null)
  execute function public.record_match_result();

-- ================================================================ helpers

create function public.log_tournament_event(p_tournament_id uuid, p_type text, p_payload jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into public.tournament_events (tournament_id, type, actor_id, payload)
  values (p_tournament_id, p_type, (select auth.uid()), p_payload)
$$;

create function public.lock_tournament_as_organizer(p_tournament_id uuid) returns public.tournaments
language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments;
begin
  select * into t from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'tournament not found' using errcode = 'no_data_found';
  end if;
  if t.organizer_id is distinct from (select auth.uid()) or not public.is_club_member(t.club_id) then
    raise exception 'only the organizer can do this' using errcode = 'insufficient_privilege';
  end if;
  return t;
end $$;

create function public.entry_name(p_entry_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(p.display_name, e.guest_name)
  from public.tournament_entries e left join public.profiles p on p.id = e.user_id
  where e.id = p_entry_id
$$;

create function public.can_read_tournament(p_tournament_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tournaments t where t.id = p_tournament_id and public.is_club_member(t.club_id))
$$;

-- ================================================================ organizer RPCs

create function public.create_tournament(
  p_club_id       uuid,
  p_name          text,
  p_format        public.tournament_format,
  p_pairing       public.tournament_pairing,
  p_round_minutes integer default 45,
  p_target_score  integer default null,
  p_starts_on     date default current_date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.is_club_member(p_club_id) then
    raise exception 'not a member of this club' using errcode = 'insufficient_privilege';
  end if;
  insert into public.tournaments (club_id, organizer_id, name, format, pairing, round_minutes, target_score, starts_on)
  values (p_club_id, (select auth.uid()), btrim(p_name), p_format, p_pairing, p_round_minutes,
          coalesce(p_target_score, (select target_score from public.clubs where id = p_club_id)), p_starts_on)
  returning id into v_id;
  perform public.log_tournament_event(v_id, 'created');
  return v_id;
end $$;

-- p_entries: [{"user_id": "…"} | {"guest_name": "…"}, optional "pair": <key shared by 2 entries>, "seed": n]
-- Fixed pairs need an even count with every entry in a pair of two; rotating needs a multiple of 4.
create function public.set_entries(p_tournament_id uuid, p_entries jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t       public.tournaments;
  v_count integer;
begin
  t := public.lock_tournament_as_organizer(p_tournament_id);
  if t.status <> 'draft' then
    raise exception 'entries are locked once the tournament starts' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'entries must be an array' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.tournament_entries where tournament_id = p_tournament_id;

  with raw as (
    select nullif(e ->> 'user_id', '')::uuid as user_id,
           nullif(btrim(e ->> 'guest_name'), '') as guest_name,
           e ->> 'pair' as pair_key,
           (e ->> 'seed')::integer as seed
    from jsonb_array_elements(p_entries) e
  ), pairs as (
    select pair_key, gen_random_uuid() as pair_id from raw where pair_key is not null group by pair_key
  )
  insert into public.tournament_entries (tournament_id, user_id, guest_name, pair_id, seed)
  select p_tournament_id, r.user_id, r.guest_name, p.pair_id, r.seed
  from raw r left join pairs p on p.pair_key = r.pair_key;

  select count(*) into v_count from public.tournament_entries where tournament_id = p_tournament_id;
  if exists (
    select 1 from public.tournament_entries e
    where e.tournament_id = p_tournament_id and e.user_id is not null
      and not exists (select 1 from public.club_members m where m.club_id = t.club_id and m.user_id = e.user_id)
  ) then
    raise exception 'every entrant must belong to the club' using errcode = 'invalid_parameter_value';
  end if;
  if t.pairing = 'fixed' then
    if v_count < 4 or v_count % 2 <> 0
       or exists (select 1 from public.tournament_entries where tournament_id = p_tournament_id and pair_id is null)
       or exists (select 1 from public.tournament_entries where tournament_id = p_tournament_id
                  group by pair_id having count(*) <> 2) then
      raise exception 'fixed pairs need an even number of entrants, each in a pair of two' using errcode = 'invalid_parameter_value';
    end if;
  elsif v_count < 4 or v_count % 4 <> 0 then
    raise exception 'rotating partners need a multiple of 4 entrants (add a ghost seat to fill a table)' using errcode = 'invalid_parameter_value';
  end if;
  perform public.log_tournament_event(p_tournament_id, 'entries_set', jsonb_build_object('count', v_count));
end $$;

create function public.start_tournament(p_tournament_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments;
begin
  t := public.lock_tournament_as_organizer(p_tournament_id);
  if t.status <> 'draft' then
    raise exception 'tournament already started' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.tournament_entries where tournament_id = p_tournament_id) then
    raise exception 'add entrants first' using errcode = 'invalid_parameter_value';
  end if;
  update public.tournaments set status = 'running' where id = p_tournament_id;
  perform public.log_tournament_event(p_tournament_id, 'started');
end $$;

-- Creates one round. p_matches: [{"table_no":1,"team_a":[entry,entry],"team_b":[entry,entry]}, …].
-- p_byes: unit ids sitting out. Every entrant is either at exactly one table or in a bye unit.
create function public.start_round(p_tournament_id uuid, p_matches jsonb, p_byes uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t          public.tournaments;
  v_round_id uuid;
  v_round_no integer;
  v_ends_at  timestamptz;
  m          jsonb;
  v_match_id uuid;
  v_game_id  uuid;
  v_a        uuid[];
  v_b        uuid[];
  v_seat     smallint;
  v_entry    public.tournament_entries;
begin
  t := public.lock_tournament_as_organizer(p_tournament_id);
  if t.status <> 'running' then
    raise exception 'tournament is not running' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.tournament_rounds where tournament_id = p_tournament_id and status = 'live') then
    raise exception 'the current round is still being played' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_matches) is distinct from 'array' or jsonb_array_length(p_matches) = 0 then
    raise exception 'a round needs at least one table' using errcode = 'invalid_parameter_value';
  end if;
  p_byes := coalesce(p_byes, '{}');

  -- Validate the draw before writing anything.
  drop table if exists pg_temp._seated;
  create temp table _seated on commit drop as
  select (mm ->> 'table_no')::integer as table_no, side, entry_id::uuid as entry_id
  from jsonb_array_elements(p_matches) mm,
       lateral (select 'A' as side, x from jsonb_array_elements_text(mm -> 'team_a') x
                union all
                select 'B', x from jsonb_array_elements_text(mm -> 'team_b') x) s (side, entry_id);

  if exists (select 1 from pg_temp._seated group by table_no, side having count(*) <> 2)
     or (select count(distinct table_no) from pg_temp._seated) <> jsonb_array_length(p_matches) then
    raise exception 'every table needs two players per team and a distinct table number' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from pg_temp._seated group by entry_id having count(*) > 1) then
    raise exception 'an entrant is seated twice' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from pg_temp._seated s where not exists (
       select 1 from public.tournament_entries e where e.id = s.entry_id and e.tournament_id = p_tournament_id)) then
    raise exception 'unknown entrant in the draw' using errcode = 'invalid_parameter_value';
  end if;
  if t.pairing = 'fixed' and exists (
       select 1 from pg_temp._seated s join public.tournament_entries e on e.id = s.entry_id
       group by s.table_no, s.side having count(distinct e.pair_id) <> 1) then
    raise exception 'fixed pairs must stay together' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
       select 1 from public.tournament_entries e
       where e.tournament_id = p_tournament_id
         and not exists (select 1 from pg_temp._seated s where s.entry_id = e.id)
         and not (coalesce(e.pair_id, e.id) = any (p_byes))) then
    raise exception 'every entrant must be seated or have a bye' using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(max(round_no), 0) + 1 into v_round_no from public.tournament_rounds where tournament_id = p_tournament_id;
  v_ends_at := now() + make_interval(mins => t.round_minutes);
  insert into public.tournament_rounds (tournament_id, round_no, ends_at, byes)
  values (p_tournament_id, v_round_no, v_ends_at, p_byes)
  returning id into v_round_id;

  for m in select * from jsonb_array_elements(p_matches) loop
    select array_agg(entry_id order by entry_id) into v_a from pg_temp._seated where table_no = (m ->> 'table_no')::integer and side = 'A';
    select array_agg(entry_id order by entry_id) into v_b from pg_temp._seated where table_no = (m ->> 'table_no')::integer and side = 'B';
    insert into public.tournament_matches (tournament_round_id, table_no, team_a_entries, team_b_entries)
    values (v_round_id, (m ->> 'table_no')::integer, v_a, v_b)
    returning id into v_match_id;

    insert into public.games (club_id, host_id, mode, tournament_match_id)
    values (t.club_id, t.organizer_id, 'normal', v_match_id)
    returning id into v_game_id;
    update public.tournament_matches set game_id = v_game_id where id = v_match_id;

    -- Team A on seats 1 and 3, team B on 2 and 4. Ghost seats count as confirmed.
    v_seat := 0;
    for v_entry in select * from public.tournament_entries where id = any (v_a || v_b)
             order by (id = any (v_b)), id loop
      v_seat := v_seat + 1;
      insert into public.game_seats (game_id, seat, team, user_id, guest_name, invite_status, confirmed_at)
      values (v_game_id,
              case v_seat when 1 then 1 when 2 then 3 when 3 then 2 else 4 end,
              case when v_seat <= 2 then 'A' else 'B' end::public.team,
              v_entry.user_id, v_entry.guest_name,
              case when v_entry.user_id is null then 'confirmed' else 'invited' end::public.invite_status,
              case when v_entry.user_id is null then now() end);
    end loop;

    update public.games set status = 'inviting', invite_expires_at = v_ends_at where id = v_game_id;
    perform public.log_game_event(v_game_id, 'created', null, jsonb_build_object('mode', 'tournament', 'match_id', v_match_id));

    perform public.enqueue_notification(
      array[s.user_id], 'tournament_table', '/tournaments/' || p_tournament_id,
      jsonb_build_object(
        'round_no', v_round_no,
        'table_no', (m ->> 'table_no')::integer,
        'partner', (select public.seat_name(v_game_id, o.seat) from public.game_seats o
                    where o.game_id = v_game_id and o.team = s.team and o.seat <> s.seat),
        'opponents', public.team_names(v_game_id, public.other_team(s.team))),
      v_game_id, p_tournament_id)
    from public.game_seats s where s.game_id = v_game_id and s.user_id is not null;
  end loop;

  drop table pg_temp._seated;
  perform public.log_tournament_event(p_tournament_id, 'round_started',
    jsonb_build_object('round_no', v_round_no, 'tables', jsonb_array_length(p_matches)));
  return v_round_id;
end $$;

-- Late arrival: a member takes over an entry (also in any game of the live round still inviting).
create function public.substitute_entry(p_entry_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.tournament_entries;
  t public.tournaments;
  s record;
begin
  select * into e from public.tournament_entries where id = p_entry_id;
  if not found then
    raise exception 'entry not found' using errcode = 'no_data_found';
  end if;
  t := public.lock_tournament_as_organizer(e.tournament_id);
  if not exists (select 1 from public.club_members where club_id = t.club_id and user_id = p_user_id) then
    raise exception 'every entrant must belong to the club' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.tournament_entries where tournament_id = t.id and user_id = p_user_id) then
    raise exception 'this member is already entered' using errcode = 'invalid_parameter_value';
  end if;
  update public.tournament_entries set user_id = p_user_id, guest_name = null where id = p_entry_id;

  for s in
    select gs.game_id, gs.seat from public.game_seats gs
    join public.games g on g.id = gs.game_id
    join public.tournament_matches m on m.id = g.tournament_match_id
    join public.tournament_rounds r on r.id = m.tournament_round_id
    where r.tournament_id = t.id and r.status = 'live' and g.status = 'inviting'
      and p_entry_id = any (m.team_a_entries || m.team_b_entries)
      and gs.user_id is not distinct from e.user_id and gs.guest_name is not distinct from e.guest_name
  loop
    update public.game_seats
    set user_id = p_user_id, guest_name = null, invite_status = 'invited', confirmed_at = null, is_scorekeeper = false
    where game_id = s.game_id and seat = s.seat;
    perform public.ensure_scorekeepers(s.game_id);
    perform public.notify_invite(s.game_id, s.seat);
  end loop;
  perform public.log_tournament_event(t.id, 'substituted',
    jsonb_build_object('entry_id', p_entry_id, 'from', coalesce(e.user_id::text, e.guest_name), 'to', p_user_id));
end $$;

create function public.edit_match_result(
  p_match_id uuid,
  p_result   public.match_result,
  p_points_a integer,
  p_points_b integer,
  p_reason   text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.tournament_matches;
  t public.tournaments;
begin
  select * into m from public.tournament_matches where id = p_match_id;
  if not found then
    raise exception 'match not found' using errcode = 'no_data_found';
  end if;
  t := public.lock_tournament_as_organizer((select tournament_id from public.tournament_rounds where id = m.tournament_round_id));
  if nullif(btrim(p_reason), '') is null then
    raise exception 'a reason is required to edit a result' using errcode = 'invalid_parameter_value';
  end if;
  if p_result = 'draw' and t.format = 'knockout' then
    raise exception 'knockout matches cannot be drawn' using errcode = 'invalid_parameter_value';
  end if;
  update public.tournament_matches
  set result = p_result, points_a = p_points_a, points_b = p_points_b, edited_reason = btrim(p_reason)
  where id = p_match_id;
  perform public.log_tournament_event(t.id, 'result_edited', jsonb_build_object(
    'match_id', p_match_id, 'reason', btrim(p_reason),
    'from', jsonb_build_object('result', m.result, 'a', m.points_a, 'b', m.points_b),
    'to', jsonb_build_object('result', p_result, 'a', p_points_a, 'b', p_points_b)));
  perform public.close_round_if_done(m.tournament_round_id);
end $$;

create function public.finish_tournament(p_tournament_id uuid, p_cancel boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments;
begin
  t := public.lock_tournament_as_organizer(p_tournament_id);
  if t.status in ('finished', 'cancelled') then
    raise exception 'tournament is already closed' using errcode = 'invalid_parameter_value';
  end if;
  if not p_cancel and exists (select 1 from public.tournament_rounds where tournament_id = p_tournament_id and status = 'live') then
    raise exception 'the current round is still being played' using errcode = 'invalid_parameter_value';
  end if;
  update public.tournaments set status = case when p_cancel then 'cancelled' else 'finished' end::public.tournament_status
  where id = p_tournament_id;
  perform public.log_tournament_event(p_tournament_id, case when p_cancel then 'cancelled' else 'finished' end);
end $$;

-- Cron (service role), every minute: 5-minute warning, then stop the clock. When the clock stops,
-- each live match plays out the deal in progress; a match between deals is scored right away.
create function public.tournament_clock_tick() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r       public.tournament_rounds;
  g       public.games;
  v_count integer := 0;
begin
  for r in
    update public.tournament_rounds set clock_warned_at = now()
    where status = 'live' and clock_warned_at is null and ends_at <= now() + interval '5 minutes' and ends_at > now()
    returning *
  loop
    perform public.enqueue_notification(
      array(select e.user_id from public.tournament_entries e where e.tournament_id = r.tournament_id and e.user_id is not null),
      'tournament_clock', '/tournaments/' || r.tournament_id,
      jsonb_build_object('round_no', r.round_no, 'minutes_left', 5), null, r.tournament_id);
    v_count := v_count + 1;
  end loop;

  for r in
    update public.tournament_rounds set clock_expired_at = now()
    where status = 'live' and clock_expired_at is null and ends_at <= now()
    returning *
  loop
    for g in
      update public.games ga set clock_expired_at = now()
      from public.tournament_matches m
      where m.tournament_round_id = r.id and ga.id = m.game_id and ga.status = 'live'
      returning ga.*
    loop
      if g.result_proposed_at is null and (public.active_round(g.id)).id is null then
        perform public.propose_result_if_over(g.id);
      end if;
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ================================================================ views

create view public.v_tournament_matches with (security_invoker = true) as
select m.id as match_id,
       r.tournament_id,
       r.id as round_id,
       r.round_no,
       r.status as round_status,
       r.ends_at,
       m.table_no,
       m.team_a_entries,
       m.team_b_entries,
       array(select public.entry_name(x) from unnest(m.team_a_entries) x) as team_a_names,
       array(select public.entry_name(x) from unnest(m.team_b_entries) x) as team_b_names,
       m.result,
       m.points_a,
       m.points_b,
       m.edited_reason,
       m.game_id,
       g.status as game_status,
       t.team_a_total as live_a,
       t.team_b_total as live_b
from public.tournament_matches m
join public.tournament_rounds r on r.id = m.tournament_round_id
left join public.games g on g.id = m.game_id
left join public.v_game_totals t on t.game_id = m.game_id;

-- Simple per-unit table (match points, capped differential). The full tiebreak order, including
-- head-to-head, is applied by computeStandings in packages/shared.
create view public.v_tournament_standings with (security_invoker = true) as
with sides as (
  select r.tournament_id, unnest(m.team_a_entries) as entry_id, m.result,
         case m.result when 'a' then 2 when 'draw' then 1 else 0 end as mp,
         greatest(-1000, least(1000, m.points_a - m.points_b)) as diff, m.points_a as pf
  from public.tournament_matches m join public.tournament_rounds r on r.id = m.tournament_round_id
  where m.result is not null
  union all
  select r.tournament_id, unnest(m.team_b_entries), m.result,
         case m.result when 'b' then 2 when 'draw' then 1 else 0 end,
         greatest(-1000, least(1000, m.points_b - m.points_a)), m.points_b
  from public.tournament_matches m join public.tournament_rounds r on r.id = m.tournament_round_id
  where m.result is not null
)
select e.tournament_id,
       coalesce(e.pair_id, e.id) as unit_id,
       array_agg(distinct e.id) as entry_ids,
       count(s.entry_id) / count(distinct e.id) as played,
       coalesce(sum(s.mp), 0) / count(distinct e.id) as match_points,
       coalesce(sum(s.diff), 0) / count(distinct e.id) as differential,
       coalesce(sum(s.pf), 0) / count(distinct e.id) as points_for
from public.tournament_entries e
left join sides s on s.entry_id = e.id
group by e.tournament_id, coalesce(e.pair_id, e.id);

-- ================================================================ RLS

alter table public.tournaments        enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_rounds  enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.tournament_events  enable row level security;

create policy tournaments_select on public.tournaments for select to authenticated
  using (public.is_club_member(club_id));
create policy tournament_entries_select on public.tournament_entries for select to authenticated
  using (public.can_read_tournament(tournament_id));
create policy tournament_rounds_select on public.tournament_rounds for select to authenticated
  using (public.can_read_tournament(tournament_id));
create policy tournament_matches_select on public.tournament_matches for select to authenticated
  using (exists (select 1 from public.tournament_rounds r where r.id = tournament_round_id and public.can_read_tournament(r.tournament_id)));
create policy tournament_events_select on public.tournament_events for select to authenticated
  using (public.can_read_tournament(tournament_id));

revoke insert, update, delete on
  public.tournaments, public.tournament_entries, public.tournament_rounds, public.tournament_matches, public.tournament_events
from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tournaments, public.tournament_rounds, public.tournament_matches;
  end if;
end $$;

-- ================================================================ grants

revoke execute on function
  public.record_match_result(),
  public.close_round_if_done(uuid),
  public.log_tournament_event(uuid, text, jsonb),
  public.lock_tournament_as_organizer(uuid),
  public.tournament_clock_tick()
from public, anon, authenticated;
grant execute on function public.tournament_clock_tick() to service_role;

revoke execute on function public.entry_name(uuid), public.can_read_tournament(uuid) from public, anon;
grant execute on function public.entry_name(uuid), public.can_read_tournament(uuid) to authenticated;

revoke execute on function
  public.create_tournament(uuid, text, public.tournament_format, public.tournament_pairing, integer, integer, date),
  public.set_entries(uuid, jsonb),
  public.start_tournament(uuid),
  public.start_round(uuid, jsonb, uuid[]),
  public.substitute_entry(uuid, uuid),
  public.edit_match_result(uuid, public.match_result, integer, integer, text),
  public.finish_tournament(uuid, boolean)
from public, anon;
