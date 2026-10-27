-- A phone counts as watching a game or the chat only while it keeps checking in. A locked phone
-- stops running the app without saying so, so its last state stayed 'active' and game pushes
-- (the live score) were skipped. The app now re-sends its state every 30 seconds while a game or
-- the chat is on screen; after 90 seconds of silence the phone gets pushes again.

create function public.device_watching(d public.devices) returns boolean
language sql stable set search_path = '' as $$
  select d.app_state = 'active' and d.last_seen > now() - interval '90 seconds'
$$;
revoke execute on function public.device_watching(public.devices) from public, anon, authenticated;

-- Same as 20261109000000_club_chat, with device_watching in place of app_state = 'active'.
create or replace function public.claim_notifications(p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rows jsonb;
begin
  -- A dispatcher that crashed mid-batch: retry, or give up after 3 attempts.
  update public.notification_queue
  set status = case when attempts < 3 then 'queued' else 'failed' end,
      error = case when attempts < 3 then error else coalesce(error, 'abandoned while sending') end
  where status = 'sending' and claimed_at < now() - interval '5 minutes';

  with batch as (
    select q.id from public.notification_queue q
    where q.status = 'queued'
    order by q.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.notification_queue q
    set status = 'sending', attempts = q.attempts + 1, claimed_at = now()
    from batch where q.id = batch.id
    returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'event', c.event, 'payload', c.payload, 'deep_link', c.deep_link,
           'attempts', c.attempts,
           'lang', p.lang,
           'tokens', coalesce((
             select jsonb_agg(d.expo_push_token) from public.devices d
             where d.user_id = c.user_id and d.web_p256dh is null
               and (c.game_id is null or d.active_game_id is distinct from c.game_id or not public.device_watching(d))
               and (c.event <> 'chat_message' or not d.chat_open or not public.device_watching(d))
           ), '[]'::jsonb),
           'web', coalesce((
             select jsonb_agg(jsonb_build_object('endpoint', d.expo_push_token, 'p256dh', d.web_p256dh, 'auth', d.web_auth))
             from public.devices d
             where d.user_id = c.user_id and d.web_p256dh is not null
               and (c.game_id is null or d.active_game_id is distinct from c.game_id or not public.device_watching(d))
               and (c.event <> 'chat_message' or not d.chat_open or not public.device_watching(d))
           ), '[]'::jsonb))), '[]'::jsonb)
    into v_rows
  from claimed c join public.profiles p on p.id = c.user_id;
  return v_rows;
end $$;
revoke execute on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
