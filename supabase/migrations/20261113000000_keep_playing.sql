-- Reaching the target no longer ends a game by itself. The result is proposed and the table
-- chooses: confirm it (confirm_result, as before), or keep playing with extra rounds
-- (continue_game). The question comes back after every counted round while a team is over the
-- target. Tournament games keep their rules: a start-now match still finishes at the result, and
-- no tournament game can be continued.

-- Same as 20261105000000_one_step_scoring, without finishing start-now games right away.
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
  if g.mode = 'ghost' and g.tournament_match_id is not null then
    -- Tournament games keep their rules: the result stands at once (standings, round clock).
    perform public.finish_game(p_game_id);
  elsif g.mode <> 'ghost' then
    perform public.enqueue_notification(
      array(select user_id from public.game_seats where game_id = p_game_id and is_scorekeeper),
      'result_to_confirm', '/game/' || p_game_id || '/result',
      jsonb_build_object('winner', v_winner, 'a', t.team_a_total, 'b', t.team_b_total),
      p_game_id);
  end if;
end $$;

create function public.continue_game(p_game_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  t record;
begin
  g := public.lock_game(p_game_id);
  perform public.assert_live(g);
  if g.result_proposed_at is null then
    raise exception 'there is no result to keep playing past' using errcode = 'invalid_parameter_value';
  end if;
  if g.tournament_match_id is not null then
    raise exception 'tournament games end at the result' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(public.club_role_of_caller(g.club_id)::text, 'none') not in ('owner', 'admin') then
    perform public.actor_seat(g, true);
  end if;

  update public.games
  set proposed_winner = null, result_proposed_at = null, result_confirmed_teams = '{}'
  where id = p_game_id;
  select * into t from public.v_game_totals where game_id = p_game_id;
  perform public.log_game_event(p_game_id, 'result_continued', null, jsonb_build_object('a', t.team_a_total, 'b', t.team_b_total));
  return public.game_ok(p_game_id);
end $$;

revoke execute on function public.continue_game(uuid) from public, anon;
grant execute on function public.continue_game(uuid) to authenticated;
