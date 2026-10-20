-- No PIN, no invites. Tournament matches start as live "start now" (ghost) games, like casual
-- games: everyone is seated at once and the first seated member at the table (team A first,
-- by seat) scores on their phone; a table of guests only is scored by the organizer.
-- Ghost play already needs no PIN anywhere (submit/confirm round, confirm result, undo, abandon,
-- cuts), so only the tournament functions change. Finished matches count like any trusted
-- start-now game (config_snapshot.trust_ghost), and record_match_result does not look at
-- games.verified.

create or replace function public.start_round(p_tournament_id uuid, p_matches jsonb, p_byes uuid[] default '{}') returns uuid
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
  v_host     uuid;
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

    -- Start now: a live ghost game. The organizer hosts until the seats exist; then the first
    -- seated member (team A first, by seat) takes over scoring on their phone.
    insert into public.games (club_id, host_id, mode, tournament_match_id)
    values (t.club_id, t.organizer_id, 'ghost', v_match_id)
    returning id into v_game_id;
    update public.tournament_matches set game_id = v_game_id where id = v_match_id;

    -- Team A on seats 1 and 3, team B on 2 and 4. Everyone is seated straight away (no invites).
    v_seat := 0;
    for v_entry in select * from public.tournament_entries where id = any (v_a || v_b)
             order by (id = any (v_b)), id loop
      v_seat := v_seat + 1;
      insert into public.game_seats (game_id, seat, team, user_id, guest_name, invite_status, confirmed_at)
      values (v_game_id,
              case v_seat when 1 then 1 when 2 then 3 when 3 then 2 else 4 end,
              case when v_seat <= 2 then 'A' else 'B' end::public.team,
              v_entry.user_id, v_entry.guest_name, 'confirmed', now());
    end loop;

    select user_id into v_host from public.game_seats
    where game_id = v_game_id and user_id is not null
    order by team, seat limit 1;
    v_host := coalesce(v_host, t.organizer_id);
    -- One scorekeeper per team, as create_game does for a ghost game: the host's seat or the lowest.
    update public.games set host_id = v_host where id = v_game_id;
    update public.game_seats s set is_scorekeeper = true
    where s.game_id = v_game_id
      and s.seat in (
        select distinct on (team) seat from public.game_seats
        where game_id = v_game_id
        order by team, (user_id = v_host) desc nulls last, seat
      );
    update public.games set status = 'live' where id = v_game_id;
    perform public.log_game_event(v_game_id, 'created', null, jsonb_build_object('mode', 'tournament', 'match_id', v_match_id, 'host', v_host));

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


-- A late arrival takes over the entry, also at the table of the live round (games are live now,
-- not inviting). Their seat is confirmed straight away. If the replaced player was hosting, or the
-- table had only guests (scored by the organizer), the newcomer scores from then on.
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
    select gs.game_id, gs.seat, g.host_id from public.game_seats gs
    join public.games g on g.id = gs.game_id
    join public.tournament_matches m on m.id = g.tournament_match_id
    join public.tournament_rounds r on r.id = m.tournament_round_id
    where r.tournament_id = t.id and r.status = 'live' and g.status in ('inviting', 'live')
      and p_entry_id = any (m.team_a_entries || m.team_b_entries)
      and gs.user_id is not distinct from e.user_id and gs.guest_name is not distinct from e.guest_name
  loop
    update public.game_seats
    set user_id = p_user_id, guest_name = null, invite_status = 'confirmed', confirmed_at = now()
    where game_id = s.game_id and seat = s.seat;
    if s.host_id is not distinct from e.user_id
       or not exists (select 1 from public.game_seats where game_id = s.game_id and user_id = s.host_id) then
      update public.games set host_id = p_user_id where id = s.game_id;
    end if;
  end loop;
  perform public.log_tournament_event(t.id, 'substituted',
    jsonb_build_object('entry_id', p_entry_id, 'from', coalesce(e.user_id::text, e.guest_name), 'to', p_user_id));
end $$;
