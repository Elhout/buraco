-- The club owner and admins keep score in any running game, also from outside the table: they
-- enter rounds (they count at once, no PIN confirmation from the other team), tap +100 cuts and
-- undo the last round (removed at once). Editing rounds was already theirs (20261114000000).
-- Everyone else still has to sit at the table (and keep score in a game with invites).

-- The caller is the owner or an admin of the game's club and is not seated in it.
create function public.is_unseated_game_admin(g public.games) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
           select 1 from public.club_members
           where club_id = g.club_id and user_id = (select auth.uid()) and role in ('owner', 'admin'))
     and not exists (select 1 from public.game_seats where game_id = g.id and user_id = (select auth.uid()))
$$;
revoke execute on function public.is_unseated_game_admin(public.games) from public, anon, authenticated;

-- Same as 20261105000000_one_step_scoring, with admins.
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
         where club_id = g.club_id and user_id = (select auth.uid()) and role in ('owner', 'admin')) then
      raise exception 'you are not seated in this game' using errcode = 'insufficient_privilege';
    end if;
    select * into s from public.game_seats where game_id = g.id and seat = public.ghost_scorekeeper_seat(g, true);
    return s;
  end if;
  select * into s from public.game_seats where game_id = g.id and user_id = (select auth.uid());
  if not found and public.is_unseated_game_admin(g) then
    -- The owner or an admin keeps score from outside the table, on team A's scorekeeper seat.
    return public.team_scorekeeper(g.id, 'A');
  end if;
  if not found then
    raise exception 'you are not seated in this game' using errcode = 'insufficient_privilege';
  end if;
  if p_scorekeeper and not s.is_scorekeeper then
    raise exception 'only scorekeepers can do this' using errcode = 'insufficient_privilege';
  end if;
  return s;
end $$;

-- Same as 20261105000000_one_step_scoring; an admin's round counts at once.
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
  v_admin    boolean;
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
  v_admin := public.is_unseated_game_admin(g);
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

  if g.mode = 'ghost' or v_admin then
    -- Whoever enters a start-now round is trusted, and so is an admin entering any game's round: it counts now (the other team's scorekeeper seat
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

-- Same as 20261020000100_phase2_accounts_live; an admin's undo is not a request.
create or replace function public.request_undo(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  s public.game_seats;
begin
  g := public.lock_game(p_game_id);
  perform public.assert_live(g);
  s := public.actor_seat(g, true);
  if not exists (select 1 from public.rounds where game_id = p_game_id and status = 'confirmed') then
    raise exception 'nothing to undo' using errcode = 'invalid_parameter_value';
  end if;
  if g.mode = 'ghost' or public.is_unseated_game_admin(g) then
    perform public.do_undo(p_game_id, s.seat);
    return;
  end if;
  if g.undo_requested_by is not null then
    raise exception 'an undo is already waiting for approval' using errcode = 'invalid_parameter_value';
  end if;
  update public.games set undo_requested_by = s.team, undo_requested_at = now() where id = p_game_id;
  perform public.log_game_event(p_game_id, 'undo_requested', s.seat);
  perform public.enqueue_notification(
    array[(public.team_scorekeeper(p_game_id, public.other_team(s.team))).user_id],
    'undo_requested', '/game/' || p_game_id,
    jsonb_build_object(
      'requester', public.seat_name(p_game_id, s.seat),
      'round_no', (select count(*) from public.rounds where game_id = p_game_id and status = 'confirmed')),
    p_game_id);
end $$;
