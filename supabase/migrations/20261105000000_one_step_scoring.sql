-- One step per round for start-now (mode 'ghost') games, which is every game the app starts now:
--   * a submitted round is confirmed at once (no second "Confirm round" tap);
--   * when a team wins, the game finishes by itself (no "Confirm result" tap);
--   * anyone seated at the table, or the club owner, can score, undo or abandon (not only the host).
-- Older app versions still call confirm_round / confirm_result afterwards: those become no-ops.
-- Normal (invite) games keep the two-team confirmation flow.
-- Also: a tournament result edit no longer needs a reason, and a missing point total counts as 0.

-- ---------------------------------------------------------------- who may score a start-now game

-- The seat a caller acts from. Ghost: the host, any seated member or the club owner, acting as the
-- host's team's scorekeeper (who enters rounds is not a seat-level rule in a ghost game).
-- Normal: unchanged (the caller's own seat, a scorekeeper when p_scorekeeper is true).
create or replace function public.actor_seat(g public.games, p_scorekeeper boolean) returns public.game_seats
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.game_seats;
begin
  if g.mode = 'ghost' then
    if g.host_id is distinct from (select auth.uid())
       and not exists (select 1 from public.game_seats where game_id = g.id and user_id = (select auth.uid()))
       and not exists (
         select 1 from public.club_members
         where club_id = g.club_id and user_id = (select auth.uid()) and role = 'owner') then
      raise exception 'you are not seated in this game' using errcode = 'insufficient_privilege';
    end if;
    select * into s from public.game_seats where game_id = g.id and seat = public.ghost_scorekeeper_seat(g, true);
    return s;
  end if;
  select * into s from public.game_seats where game_id = g.id and user_id = (select auth.uid());
  if not found then
    raise exception 'you are not seated in this game' using errcode = 'insufficient_privilege';
  end if;
  if p_scorekeeper and not s.is_scorekeeper then
    raise exception 'only scorekeepers can do this' using errcode = 'insufficient_privilege';
  end if;
  return s;
end $$;

-- ---------------------------------------------------------------- games finish by themselves

-- Same decision as before (target reached with unequal totals, or the tournament clock ran out);
-- a ghost game is then finished right away instead of waiting for a "Confirm result" tap.
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
  if g.mode = 'ghost' then
    perform public.finish_game(p_game_id);
  else
    perform public.enqueue_notification(
      array(select user_id from public.game_seats where game_id = p_game_id and is_scorekeeper),
      'result_to_confirm', '/game/' || p_game_id || '/result',
      jsonb_build_object('winner', v_winner, 'a', t.team_a_total, 'b', t.team_b_total),
      p_game_id);
  end if;
end $$;

-- ---------------------------------------------------------------- rounds count at once

create or replace function public.submit_round(
  p_game_id   uuid,
  p_team_a    integer,
  p_team_b    integer,
  p_cut_seats smallint[] default '{}',
  p_client_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  g          public.games;
  s          public.game_seats;
  r          public.rounds;
  v_existing uuid;
begin
  g := public.lock_game(p_game_id);
  if p_client_id is not null then
    select id into v_existing from public.rounds where client_id = p_client_id and game_id = p_game_id;
    if found then
      return v_existing;
    end if;
  end if;
  perform public.assert_live(g);
  s := public.actor_seat(g, true);
  perform public.assert_no_result_pending(g);

  if p_team_a is null or p_team_b is null then
    raise exception 'both team scores are required' using errcode = 'invalid_parameter_value';
  end if;
  if abs(p_team_a) > 99999 or abs(p_team_b) > 99999 then
    raise exception 'round score out of range' using errcode = 'invalid_parameter_value';
  end if;
  if not (g.config_snapshot ->> 'allow_negative')::boolean and (p_team_a < 0 or p_team_b < 0) then
    raise exception 'negative round scores are not allowed in this club' using errcode = 'invalid_parameter_value';
  end if;

  r := public.active_round(p_game_id);
  if r.status = 'pending' then
    raise exception 'a round is already waiting for confirmation' using errcode = 'unique_violation';
  end if;

  p_cut_seats := coalesce(p_cut_seats, '{}');
  if cardinality(p_cut_seats) > 4
     or array_position(p_cut_seats, null) is not null
     or exists (select 1 from unnest(p_cut_seats) c where c not between 1 and 4)
     or (select count(distinct c) from unnest(p_cut_seats) c) <> cardinality(p_cut_seats)
     or exists (select 1 from public.round_lines where round_id = r.id and seat = any (p_cut_seats)) then
    raise exception 'cut seats must be distinct seats 1-4' using errcode = 'invalid_parameter_value';
  end if;

  if r.id is null then
    insert into public.rounds (game_id, round_no, team_a_score, team_b_score, entered_by_seat, client_id)
    values (p_game_id, (select coalesce(max(round_no), 0) + 1 from public.rounds where game_id = p_game_id),
            p_team_a, p_team_b, s.seat, p_client_id)
    returning * into r;
  else
    update public.rounds
    set team_a_score = p_team_a, team_b_score = p_team_b, entered_by_seat = s.seat,
        status = 'pending', client_id = coalesce(p_client_id, client_id)
    where id = r.id
    returning * into r;
  end if;
  update public.rounds set status = 'pending' where id = r.id;

  insert into public.round_lines (round_id, type, seat, points)
  select r.id, 'cut_bonus', c, (g.config_snapshot ->> 'cut_bonus')::integer from unnest(p_cut_seats) c;

  if g.mode = 'ghost' then
    -- Whoever enters a start-now round is trusted: it counts now (the other team's scorekeeper seat
    -- is recorded as confirming, as the old one-tap ghost confirm did), and a win ends the game.
    update public.rounds
    set status = 'confirmed', confirmed_at = now(),
        confirmed_by_seat = (public.team_scorekeeper(p_game_id, public.other_team(s.team))).seat
    where id = r.id;
    perform public.propose_result_if_over(p_game_id);
    return r.id;
  end if;

  perform public.enqueue_notification(
    array[(public.team_scorekeeper(p_game_id, public.other_team(s.team))).user_id],
    'round_to_confirm', '/game/' || p_game_id,
    jsonb_build_object(
      'round_no', (select count(*) + 1 from public.rounds where game_id = p_game_id and status = 'confirmed'),
      'a', p_team_a, 'b', p_team_b),
    p_game_id);
  return r.id;
end $$;

-- An already-confirmed start-now round: nothing left to confirm, answer like a successful confirm.
create or replace function public.confirm_round(p_round_id uuid, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l         record;
  v_check   jsonb;
  v_game_id uuid;
  v_status  public.round_status;
  g         public.games;
begin
  select game_id, status into v_game_id, v_status from public.rounds where id = p_round_id;
  if found then
    g := public.lock_game(v_game_id);
    if g.mode = 'ghost' and v_status = 'confirmed' then
      return public.game_ok(v_game_id);
    end if;
  end if;
  l := public.lock_pending_round(p_round_id);
  if (l.g).mode = 'normal' then
    v_check := public.verify_pin((select auth.uid()), p_pin);
    if not (v_check ->> 'ok')::boolean then
      return v_check;
    end if;
  end if;
  update public.rounds
  set status = 'confirmed', confirmed_at = now(), confirmed_by_seat = (l.confirmer).seat
  where id = p_round_id;
  perform public.propose_result_if_over((l.g).id);
  return public.game_ok((l.g).id);
end $$;

-- An already-finished start-now game: nothing left to confirm, answer like a successful confirm.
create or replace function public.confirm_result(p_game_id uuid, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g       public.games;
  s       public.game_seats;
  v_check jsonb;
begin
  g := public.lock_game(p_game_id);
  if g.mode = 'ghost' and g.status = 'finished' then
    return public.game_ok(p_game_id);
  end if;
  perform public.assert_live(g);
  if g.result_proposed_at is null then
    raise exception 'there is no result to confirm' using errcode = 'invalid_parameter_value';
  end if;
  s := public.actor_seat(g, true);
  if g.mode = 'ghost' then
    perform public.finish_game(p_game_id);
    return public.game_ok(p_game_id);
  end if;
  if s.team = any (g.result_confirmed_teams) then
    raise exception 'your team already confirmed' using errcode = 'invalid_parameter_value';
  end if;
  v_check := public.verify_pin((select auth.uid()), p_pin);
  if not (v_check ->> 'ok')::boolean then
    return v_check;
  end if;
  update public.games set result_confirmed_teams = result_confirmed_teams || s.team where id = p_game_id
  returning * into g;
  perform public.log_game_event(p_game_id, 'result_confirmed', s.seat);
  if cardinality(g.result_confirmed_teams) = 2 then
    perform public.finish_game(p_game_id);
  end if;
  return public.game_ok(p_game_id);
end $$;

-- ---------------------------------------------------------------- tournament result edits

-- The reason is optional now (one private group); a missing point total counts as 0.
create or replace function public.edit_match_result(
  p_match_id uuid,
  p_result   public.match_result,
  p_points_a integer,
  p_points_b integer,
  p_reason   text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m        public.tournament_matches;
  t        public.tournaments;
  v_reason text := nullif(btrim(p_reason), '');
  v_a      integer := coalesce(p_points_a, 0);
  v_b      integer := coalesce(p_points_b, 0);
begin
  select * into m from public.tournament_matches where id = p_match_id;
  if not found then
    raise exception 'match not found' using errcode = 'no_data_found';
  end if;
  t := public.lock_tournament_as_organizer((select tournament_id from public.tournament_rounds where id = m.tournament_round_id));
  perform public.assert_tournament_open(t);
  if p_result is null then
    raise exception 'result and points are required' using errcode = 'invalid_parameter_value';
  end if;
  if p_result = 'draw' and t.format = 'knockout' then
    raise exception 'knockout matches cannot be drawn' using errcode = 'invalid_parameter_value';
  end if;
  update public.tournament_matches
  set result = p_result, points_a = v_a, points_b = v_b, edited_reason = v_reason
  where id = p_match_id;
  perform public.log_tournament_event(t.id, 'result_edited', jsonb_build_object(
    'match_id', p_match_id, 'reason', v_reason,
    'from', jsonb_build_object('result', m.result, 'a', m.points_a, 'b', m.points_b),
    'to', jsonb_build_object('result', p_result, 'a', v_a, 'b', v_b)));
  perform public.close_round_if_done(m.tournament_round_id);
end $$;

-- create or replace keeps existing grants; restate the internal ones defensively.
revoke execute on function public.actor_seat(public.games, boolean), public.propose_result_if_over(uuid)
  from public, anon, authenticated;
revoke execute on function public.submit_round(uuid, integer, integer, smallint[], uuid),
  public.confirm_round(uuid, text), public.confirm_result(uuid, text),
  public.edit_match_result(uuid, public.match_result, integer, integer, text) from public, anon;
grant execute on function public.submit_round(uuid, integer, integer, smallint[], uuid),
  public.confirm_round(uuid, text), public.confirm_result(uuid, text),
  public.edit_match_result(uuid, public.match_result, integer, integer, text) to authenticated;
