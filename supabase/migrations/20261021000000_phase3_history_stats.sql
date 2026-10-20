-- Phase 3: history and stats. Every view is security_invoker, so club-membership RLS on the
-- underlying tables scopes the rows. Stats count finished, verified games only: a ghost game
-- moves nothing until all its member seats have verified it.

-- Finished and abandoned games with totals and seat names, for the history timeline.
create view public.v_game_history with (security_invoker = true) as
select g.id as game_id,
       g.club_id,
       g.mode,
       g.status,
       g.verified,
       g.winner_team,
       g.started_at,
       g.finished_at,
       g.tournament_match_id,
       t.team_a_total,
       t.team_b_total,
       t.rounds_played,
       (select jsonb_agg(jsonb_build_object(
                 'seat', s.seat, 'team', s.team, 'user_id', s.user_id,
                 'name', coalesce(p.display_name, s.guest_name), 'verified_at', s.verified_at)
               order by s.seat)
        from public.game_seats s left join public.profiles p on p.id = s.user_id
        where s.game_id = g.id) as seats,
       array(select s.user_id from public.game_seats s where s.game_id = g.id and s.user_id is not null) as player_ids
from public.games g
join public.v_game_totals t on t.game_id = g.id
where g.status in ('finished', 'abandoned');

-- One row per member seat in a verified finished game: the base of every stat.
create view public.v_player_games with (security_invoker = true) as
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
where g.status = 'finished' and g.verified;

create view public.v_player_stats with (security_invoker = true) as
with ordered as (
  select pg.*,
         row_number() over (partition by pg.club_id, pg.user_id order by pg.finished_at, pg.game_id) as n,
         row_number() over (partition by pg.club_id, pg.user_id, pg.outcome = 'win' order by pg.finished_at, pg.game_id) as n_same
  from public.v_player_games pg
),
win_runs as ( -- gaps and islands: consecutive wins share n - n_same
  select club_id, user_id, count(*) as len, max(n) as last_n
  from ordered where outcome = 'win'
  group by club_id, user_id, n - n_same
),
totals as (
  select club_id, user_id,
         count(*)::integer as games,
         count(*) filter (where outcome = 'win')::integer as wins,
         count(*) filter (where outcome = 'loss')::integer as losses,
         count(*) filter (where outcome = 'draw')::integer as draws,
         round(avg(points_for), 1) as avg_points_per_game,
         round(sum(points_for)::numeric / nullif(sum(rounds_played), 0), 1) as avg_points_per_round,
         max(points_for - points_against) filter (where outcome = 'win') as biggest_win_margin,
         max(rounds_played) as longest_game_rounds,
         sum(cuts)::integer as cuts,
         max(n) as last_n
  from ordered
  group by club_id, user_id
)
select t.club_id, t.user_id, t.games, t.wins, t.losses, t.draws,
       round(t.wins::numeric / t.games, 4) as win_rate,
       t.avg_points_per_game, t.avg_points_per_round, t.biggest_win_margin, t.longest_game_rounds,
       t.cuts,
       round(t.cuts::numeric / t.games, 2) as cuts_per_game,
       coalesce((select r.len from win_runs r
                 where r.club_id = t.club_id and r.user_id = t.user_id and r.last_n = t.last_n), 0)::integer as current_streak,
       coalesce((select max(r.len) from win_runs r
                 where r.club_id = t.club_id and r.user_id = t.user_id), 0)::integer as best_streak
from totals t;

-- Two members who played on the same team (player_a < player_b).
create view public.v_pair_stats with (security_invoker = true) as
select club_id,
       user_id as player_a,
       partner_id as player_b,
       count(*)::integer as games,
       count(*) filter (where outcome = 'win')::integer as wins,
       round(count(*) filter (where outcome = 'win')::numeric / count(*), 4) as win_rate,
       round(avg(points_for), 1) as avg_score
from public.v_player_games
where partner_id is not null and user_id < partner_id
group by club_id, user_id, partner_id;

-- Player vs player as opponents, from user_id's point of view (both directions present).
create view public.v_h2h with (security_invoker = true) as
select pg.club_id,
       pg.user_id,
       o.opponent_id,
       count(*)::integer as games,
       count(*) filter (where pg.outcome = 'win')::integer as wins,
       count(*) filter (where pg.outcome = 'loss')::integer as losses,
       round(count(*) filter (where pg.outcome = 'win')::numeric / count(*), 4) as win_rate,
       sum(pg.points_for - pg.points_against)::integer as point_diff
from public.v_player_games pg
cross join lateral unnest(pg.opponent_ids) as o (opponent_id)
group by pg.club_id, pg.user_id, o.opponent_id;

-- Fixed pair vs fixed pair (each pair normalized as least, greatest), from the first pair's point of view.
create view public.v_pair_h2h with (security_invoker = true) as
select club_id,
       user_id as pair_a1,
       partner_id as pair_a2,
       opponent_ids[1] as pair_b1,
       opponent_ids[2] as pair_b2,
       count(*)::integer as games,
       count(*) filter (where outcome = 'win')::integer as wins,
       count(*) filter (where outcome = 'loss')::integer as losses,
       sum(points_for - points_against)::integer as point_diff
from public.v_player_games
where partner_id is not null and user_id < partner_id and cardinality(opponent_ids) = 2
group by club_id, user_id, partner_id, opponent_ids[1], opponent_ids[2];

-- Club leaderboard for the current season (clubs.season_start; all time when null).
-- Ranked by win rate among players with at least 10 games; others are listed but not eligible.
create view public.v_leaderboard with (security_invoker = true) as
select pg.club_id,
       pg.user_id,
       count(*)::integer as games,
       count(*) filter (where pg.outcome = 'win')::integer as wins,
       round(count(*) filter (where pg.outcome = 'win')::numeric / count(*), 4) as win_rate,
       sum(pg.points_for - pg.points_against)::integer as point_diff,
       count(*) >= 10 as eligible
from public.v_player_games pg
join public.clubs c on c.id = pg.club_id
where c.season_start is null or pg.finished_at >= c.season_start
group by pg.club_id, pg.user_id;
