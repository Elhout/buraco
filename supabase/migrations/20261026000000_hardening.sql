-- Hardening from the phase 2-4 security review.

-- ================================================================ input bounds

alter table public.clubs
  add constraint clubs_target_score_max check (target_score <= 100000),
  add constraint clubs_cut_bonus_max check (cut_bonus <= 1000);
alter table public.tournaments add constraint tournaments_target_score_max check (target_score <= 100000);
alter table public.profiles
  add constraint profiles_avatar_url_https check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500));
alter table public.tournament_matches
  add constraint tournament_matches_points_bound check (abs(coalesce(points_a, 0)) <= 1000000 and abs(coalesce(points_b, 0)) <= 1000000);

-- ================================================================ spam limits

-- At most 5 unfinished casual games per host (tournament matches are created by the organizer).
create function public.limit_active_games() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tournament_match_id is null and (
    select count(*) from public.games
    where host_id = new.host_id and tournament_match_id is null and status in ('draft', 'inviting', 'live')
  ) >= 5 then
    raise exception 'too many games in progress' using errcode = 'invalid_parameter_value';
  end if;
  return new;
end $$;

create trigger games_limit_active
  before insert on public.games
  for each row execute function public.limit_active_games();

-- Tournaments are organized by club owners/admins, with at most 64 entrants.
create or replace function public.assert_can_organize(p_club_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_club_admin(p_club_id) then
    raise exception 'only club owners and admins can organize tournaments' using errcode = 'insufficient_privilege';
  end if;
end $$;

create function public.limit_tournament_create() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_can_organize(new.club_id);
  return new;
end $$;

create trigger tournaments_organizer_is_admin
  before insert on public.tournaments
  for each row execute function public.limit_tournament_create();

create function public.limit_entries() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.tournament_entries where tournament_id = new.tournament_id) >= 64 then
    raise exception 'a tournament can have at most 64 entrants' using errcode = 'invalid_parameter_value';
  end if;
  return new;
end $$;

create trigger tournament_entries_limit
  before insert on public.tournament_entries
  for each row execute function public.limit_entries();

-- ================================================================ invite-code guessing

create table public.club_join_failures (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index club_join_failures_user_idx on public.club_join_failures (user_id, created_at);
alter table public.club_join_failures enable row level security;
revoke all on public.club_join_failures from anon, authenticated;

-- Returns null for an unknown code (instead of raising) so the failure is recorded;
-- 10 failures within an hour block further attempts.
create or replace function public.join_club(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := (select auth.uid());
  v_club_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.club_join_failures where user_id = v_uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too many invite code attempts, try again later' using errcode = 'insufficient_privilege';
  end if;
  select id into v_club_id from public.clubs where invite_code = upper(btrim(p_code));
  if not found then
    insert into public.club_join_failures (user_id) values (v_uid);
    return null;
  end if;
  insert into public.club_members (club_id, user_id) values (v_club_id, v_uid) on conflict do nothing;
  return v_club_id;
end $$;

-- ================================================================ ghost stats

-- A ghost game only counts once at least two real members played it (a member plus three
-- guests cannot verify themselves into the rankings).
create or replace view public.v_player_games with (security_invoker = true) as
select g.id as game_id,
       g.club_id,
       g.finished_at,
       g.tournament_match_id is not null as is_tournament,
       s.user_id,
       s.team,
       case when g.winner_team is null then 'draw'
            when g.winner_team = s.team then 'win'
            else 'loss' end as outcome,
       case when s.team = 'A' then t.team_a_total else t.team_b_total end as points_for,
       case when s.team = 'A' then t.team_b_total else t.team_a_total end as points_against,
       t.rounds_played,
       (select count(*) from public.round_lines l join public.rounds r on r.id = l.round_id
        where r.game_id = g.id and r.status = 'confirmed' and l.seat = s.seat)::integer as cuts,
       (select p.user_id from public.game_seats p
        where p.game_id = g.id and p.team = s.team and p.seat <> s.seat) as partner_id,
       array(select o.user_id from public.game_seats o
             where o.game_id = g.id and o.team <> s.team and o.user_id is not null
             order by o.user_id) as opponent_ids
from public.games g
join public.v_game_totals t on t.game_id = g.id
join public.game_seats s on s.game_id = g.id and s.user_id is not null
where g.status = 'finished' and g.verified
  and (g.mode = 'normal' or (select count(*) from public.game_seats m where m.game_id = g.id and m.user_id is not null) >= 2);

-- ================================================================ remove_cut race

create or replace function public.remove_cut(p_line_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_game_id  uuid;
  v_round_id uuid;
  r          public.rounds;
  g          public.games;
begin
  select r2.game_id, r2.id into v_game_id, v_round_id
  from public.round_lines l join public.rounds r2 on r2.id = l.round_id where l.id = p_line_id;
  if not found then
    raise exception 'bonus not found' using errcode = 'no_data_found';
  end if;
  g := public.lock_game(v_game_id);
  perform public.assert_live(g);
  perform public.actor_seat(g, true);
  select * into r from public.rounds where id = v_round_id for update; -- re-read under the game lock
  if r.status <> 'open' then
    raise exception 'only bonuses in the round being played can be removed' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.round_lines where id = p_line_id;
  delete from public.rounds
  where id = r.id and team_a_score is null and not exists (select 1 from public.round_lines where round_id = r.id);
end $$;

-- ================================================================ push claims

alter table public.notification_queue add column claimed_at timestamptz;

create or replace function public.claim_notifications(p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rows jsonb;
begin
  -- A dispatcher that crashed mid-batch: retry, or give up after 3 attempts.
  update public.notification_queue
  set status = case when attempts < 3 then 'queued' else 'failed' end,
      error = case when attempts < 3 then error else coalesce(error, 'abandoned while sending') end
  where status = 'sending' and claimed_at < now() - interval '5 minutes';

  with batch as (
    select q.id from public.notification_queue q
    where q.status = 'queued'
    order by q.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.notification_queue q
    set status = 'sending', attempts = q.attempts + 1, claimed_at = now()
    from batch where q.id = batch.id
    returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'event', c.event, 'payload', c.payload, 'deep_link', c.deep_link,
           'attempts', c.attempts,
           'lang', p.lang,
           'tokens', coalesce((
             select jsonb_agg(d.expo_push_token) from public.devices d
             where d.user_id = c.user_id
               and (c.game_id is null or d.active_game_id is distinct from c.game_id or d.app_state <> 'active')
           ), '[]'::jsonb))), '[]'::jsonb)
    into v_rows
  from claimed c join public.profiles p on p.id = c.user_id;
  return v_rows;
end $$;

-- ================================================================ devices

-- Keep at most 10 devices per user (oldest seen are dropped).
create function public.limit_devices() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.devices
  where id in (
    select id from public.devices where user_id = new.user_id
    order by last_seen desc offset 10
  );
  return new;
end $$;

create trigger devices_limit
  after insert or update of user_id on public.devices
  for each row execute function public.limit_devices();

-- ================================================================ tournaments

create or replace function public.entry_name(p_entry_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(p.display_name, e.guest_name)
  from public.tournament_entries e left join public.profiles p on p.id = e.user_id
  where e.id = p_entry_id and public.can_read_tournament(e.tournament_id)
$$;

-- A round is done once every match has a result or its game ended without one (expired or
-- abandoned); the organizer can still enter those results with edit_match_result.
create or replace function public.close_round_if_done(p_round_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.tournament_rounds set status = 'finished'
  where id = p_round_id and status = 'live'
    and not exists (
      select 1 from public.tournament_matches m
      left join public.games g on g.id = m.game_id
      where m.tournament_round_id = p_round_id and m.result is null
        and coalesce(g.status::text, 'live') not in ('abandoned', 'expired')
    )
$$;

create function public.close_round_on_dead_game() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.close_round_if_done((select tournament_round_id from public.tournament_matches where id = new.tournament_match_id));
  return new;
end $$;

create trigger games_close_round_on_dead_game
  after update of status on public.games
  for each row
  when (new.status in ('abandoned', 'expired') and old.status <> new.status and new.tournament_match_id is not null)
  execute function public.close_round_on_dead_game();

create or replace function public.assert_tournament_open(t public.tournaments) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if t.status not in ('draft', 'running') then
    raise exception 'the tournament is closed' using errcode = 'invalid_parameter_value';
  end if;
end $$;

create or replace function public.substitute_entry(p_entry_id uuid, p_user_id uuid) returns void
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
  perform public.assert_tournament_open(t);
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

create or replace function public.edit_match_result(
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
  perform public.assert_tournament_open(t);
  if p_result is null or p_points_a is null or p_points_b is null then
    raise exception 'result and points are required' using errcode = 'invalid_parameter_value';
  end if;
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

-- ================================================================ grants

revoke execute on function
  public.limit_active_games(),
  public.assert_can_organize(uuid),
  public.limit_tournament_create(),
  public.limit_entries(),
  public.limit_devices(),
  public.close_round_on_dead_game(),
  public.assert_tournament_open(public.tournaments),
  public.close_round_if_done(uuid),
  public.claim_notifications(integer)
from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
revoke execute on function public.join_club(text), public.remove_cut(uuid), public.substitute_entry(uuid, uuid),
  public.edit_match_result(uuid, public.match_result, integer, integer, text) from public, anon;
revoke execute on function public.entry_name(uuid) from public, anon;
grant execute on function public.entry_name(uuid) to authenticated;
