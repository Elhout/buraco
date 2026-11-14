-- Fewer pushes for members who are not playing. The live score after every round goes only to the
-- players at the table again; the whole club hears when a game starts (unchanged) and when it ends
-- (new 'game_finished' push). Both club-wide pushes follow the profile's "club games" switch.

create or replace function public.notify_live_score() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_payload jsonb;
begin
  select jsonb_build_object(
           'round_no', (select count(*) from public.rounds r where r.game_id = new.game_id and r.status = 'confirmed'),
           'a', t.team_a_total,
           'b', t.team_b_total,
           'team_a', (select coalesce(jsonb_agg(coalesce(p.display_name, s.guest_name) order by s.seat), '[]'::jsonb)
                      from public.game_seats s left join public.profiles p on p.id = s.user_id
                      where s.game_id = new.game_id and s.team = 'A'),
           'team_b', (select coalesce(jsonb_agg(coalesce(p.display_name, s.guest_name) order by s.seat), '[]'::jsonb)
                      from public.game_seats s left join public.profiles p on p.id = s.user_id
                      where s.game_id = new.game_id and s.team = 'B'))
  into v_payload
  from public.v_game_totals t
  where t.game_id = new.game_id;

  perform public.enqueue_notification(
    array(select s.user_id from public.game_seats s where s.game_id = new.game_id and s.user_id is not null),
    'live_score', '/game/' || new.game_id, coalesce(v_payload, '{}'::jsonb), new.game_id);
  return null;
end $$;

-- Same as 20261020000100, with game_finished following the game-started switch.
create or replace function public.enqueue_notification(
  p_user_ids      uuid[],
  p_event         text,
  p_deep_link     text,
  p_payload       jsonb default '{}',
  p_game_id       uuid default null,
  p_tournament_id uuid default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.notification_queue (user_id, event, deep_link, payload, game_id, tournament_id)
  select distinct p.id, p_event, p_deep_link, p_payload, p_game_id, p_tournament_id
  from public.profiles p
  where p.id = any (p_user_ids)
    and (p_event not in ('game_started', 'game_finished') or p.notify_game_started)
    and (p_event not like 'tournament_%' or p.notify_tournament)
$$;

-- Same as 20261020000100, plus the club-wide result push.
create or replace function public.finish_game(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  t public.v_game_totals;
begin
  update public.games
  set status = 'finished', winner_team = proposed_winner, verified = (mode = 'normal')
  where id = p_game_id
  returning * into g;
  perform public.log_game_event(p_game_id, 'finished', null, jsonb_build_object('winner', g.winner_team));
  if g.mode = 'ghost' then
    perform public.enqueue_notification(
      array(select user_id from public.game_seats where game_id = p_game_id and user_id is not null and verified_at is null),
      'ghost_verify', '/history/' || p_game_id, '{}'::jsonb, p_game_id);
  end if;
  select * into t from public.v_game_totals where game_id = p_game_id;
  perform public.enqueue_notification(
    array(select m.user_id from public.club_members m where m.club_id = g.club_id),
    'game_finished', '/game/' || p_game_id,
    jsonb_build_object('winner', g.winner_team, 'a', t.team_a_total, 'b', t.team_b_total,
                       'team_a', public.team_names(p_game_id, 'A'), 'team_b', public.team_names(p_game_id, 'B')),
    p_game_id);
end $$;

revoke all on function public.finish_game(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_notification(uuid[], text, text, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.notify_live_score() from public, anon, authenticated;
