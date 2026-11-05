-- After "Keep playing" the table can end the game whenever it likes, with the score as it is: no
-- need to wait for the question to come back after a round. end_continued_game proposes the
-- result from the current totals; confirming it works as usual (confirm_result: at once for a
-- start-now game, both teams' PINs for a game with invites). games.continued_at marks a game the
-- table chose to keep playing.

alter table public.games add column continued_at timestamptz;

-- Same as 20261113000000_keep_playing, and it records continued_at.
create or replace function public.continue_game(p_game_id uuid) returns jsonb
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
  set proposed_winner = null, result_proposed_at = null, result_confirmed_teams = '{}',
      continued_at = coalesce(continued_at, now())
  where id = p_game_id;
  select * into t from public.v_game_totals where game_id = p_game_id;
  perform public.log_game_event(p_game_id, 'result_continued', null, jsonb_build_object('a', t.team_a_total, 'b', t.team_b_total));
  return public.game_ok(p_game_id);
end $$;


create function public.end_continued_game(p_game_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g        public.games;
  t        record;
  v_winner public.team;
begin
  g := public.lock_game(p_game_id);
  perform public.assert_live(g);
  if g.continued_at is null then
    raise exception 'only a game the table kept playing past the target can be ended this way' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(public.club_role_of_caller(g.club_id)::text, 'none') not in ('owner', 'admin') then
    perform public.actor_seat(g, true);
  end if;
  if g.result_proposed_at is not null then
    return public.game_ok(p_game_id);
  end if;
  select * into t from public.v_game_totals where game_id = p_game_id;
  if t.team_a_total = t.team_b_total then
    raise exception 'the teams are level: play another round to decide' using errcode = 'invalid_parameter_value';
  end if;
  v_winner := (case when t.team_a_total > t.team_b_total then 'A' else 'B' end)::public.team;

  update public.games
  set proposed_winner = v_winner, result_proposed_at = now(), result_confirmed_teams = '{}'
  where id = p_game_id;
  perform public.log_game_event(p_game_id, 'result_proposed', null,
    jsonb_build_object('winner', v_winner, 'a', t.team_a_total, 'b', t.team_b_total, 'by_choice', true));
  if g.mode <> 'ghost' then
    perform public.enqueue_notification(
      array(select user_id from public.game_seats where game_id = p_game_id and is_scorekeeper),
      'result_to_confirm', '/game/' || p_game_id || '/result',
      jsonb_build_object('winner', v_winner, 'a', t.team_a_total, 'b', t.team_b_total),
      p_game_id);
  end if;
  return public.game_ok(p_game_id);
end $$;

revoke execute on function public.end_continued_game(uuid) from public, anon;
grant execute on function public.end_continued_game(uuid) to authenticated;
