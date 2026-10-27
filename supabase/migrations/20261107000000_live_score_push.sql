-- Live score on the lock screen: every time a round counts, the game's players get a push with the
-- running score. All pushes of a game share one notification tag (public/sw.js), so each new score
-- replaces the last one instead of stacking. As for every game push, a device that has this game
-- open in the foreground is skipped (claim_notifications).

create function public.notify_live_score() returns trigger
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

revoke execute on function public.notify_live_score() from public, anon, authenticated;

create trigger rounds_live_score
  after update of status on public.rounds
  for each row
  when (new.status = 'confirmed' and old.status is distinct from 'confirmed')
  execute function public.notify_live_score();
