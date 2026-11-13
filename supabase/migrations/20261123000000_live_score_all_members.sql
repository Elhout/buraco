-- The live score after every counted round now goes to every club member, not only the four
-- players: the whole club follows the tables. Each new score still replaces the last one on the
-- lock screen (one notification tag per game), and a phone with that game open is skipped.

-- Same as 20261107000000_live_score_push, with all members as recipients.
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
    array(select m.user_id from public.club_members m join public.games g on g.club_id = m.club_id where g.id = new.game_id),
    'live_score', '/game/' || new.game_id, coalesce(v_payload, '{}'::jsonb), new.game_id);
  return null;
end $$;
