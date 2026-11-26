-- Elo ratings for the club board. Same rules as rateGames in packages/shared/src/rating.ts (the
-- two must agree; db-tests/ratings.test.ts compares them):
--   everyone starts at 1500; a team's strength is its two players' average (a guest counts as
--   1500 and is never rated); after each game every player moves by 32 × (result − expected),
--   result 1 win / ½ draw / 0 loss, expected = 1 / (1 + 10^((theirs − mine) / 400)).
-- Games are those that count in the stats (v_player_games: finished, verified), oldest first.
-- Computed on read: a club has hundreds of games, not millions. Runs as the caller, so RLS
-- limits it to clubs they belong to.

create function public.club_ratings(p_club_id uuid)
returns table (user_id uuid, rating double precision, games integer)
language plpgsql stable security invoker set search_path = '' as $$
declare
  g        record;
  v_rating jsonb := '{}'::jsonb;
  v_games  jsonb := '{}'::jsonb;
  v_a      double precision;
  v_b      double precision;
  v_result double precision;
  v_delta  double precision;
  s        record;
begin
  for g in
    select pg.game_id, gm.winner_team
    from (select distinct game_id, finished_at from public.v_player_games where club_id = p_club_id) pg
    join public.games gm on gm.id = pg.game_id
    order by pg.finished_at, pg.game_id
  loop
    select avg(coalesce((v_rating ->> gs.user_id::text)::double precision, 1500)) filter (where gs.team = 'A'),
           avg(coalesce((v_rating ->> gs.user_id::text)::double precision, 1500)) filter (where gs.team = 'B')
    into v_a, v_b
    from public.game_seats gs where gs.game_id = g.game_id;
    v_result := case g.winner_team when 'A' then 1 when 'B' then 0 else 0.5 end;
    v_delta := 32 * (v_result - 1 / (1 + power(10::double precision, (coalesce(v_b, 1500) - coalesce(v_a, 1500)) / 400)));
    for s in select gs.user_id, gs.team from public.game_seats gs where gs.game_id = g.game_id and gs.user_id is not null loop
      v_rating := jsonb_set(v_rating, array[s.user_id::text], to_jsonb(
        coalesce((v_rating ->> s.user_id::text)::double precision, 1500) + case when s.team = 'A' then v_delta else -v_delta end));
      v_games := jsonb_set(v_games, array[s.user_id::text], to_jsonb(coalesce((v_games ->> s.user_id::text)::integer, 0) + 1));
    end loop;
  end loop;
  return query
    select k::uuid, (v_rating ->> k)::double precision, (v_games ->> k)::integer
    from jsonb_object_keys(v_rating) k;
end $$;

revoke execute on function public.club_ratings(uuid) from public, anon;
grant execute on function public.club_ratings(uuid) to authenticated;
