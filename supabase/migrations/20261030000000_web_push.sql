-- Web Push for the web app (iPhones use it as a home-screen app instead of an App Store build).
-- A web device is a row in public.devices with platform 'web': expo_push_token holds the push
-- endpoint URL, so unregister_device / set_device_state / finish_notifications (dead tokens) and
-- the 10-devices limit work unchanged with the endpoint as the token. The encryption keys of the
-- subscription live next to it.

alter table public.devices
  add column web_p256dh text,
  add column web_auth text,
  add constraint devices_web_keys check ((web_p256dh is null) = (web_auth is null));

comment on column public.devices.expo_push_token is 'Expo push token, or the Web Push endpoint for platform web';

create function public.register_web_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  -- p256dh: an uncompressed P-256 point (65 bytes → 87 base64url chars); auth: 16 bytes (22 chars).
  if p_endpoint is null or length(p_endpoint) > 1000 or p_endpoint !~ '^https://[^[:space:]]+$'
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}={0,2}$'
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{16,44}={0,2}$' then
    raise exception 'invalid web push subscription' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.devices (user_id, expo_push_token, platform, web_p256dh, web_auth)
  values ((select auth.uid()), p_endpoint, 'web', p_p256dh, p_auth)
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id, platform = 'web', web_p256dh = excluded.web_p256dh, web_auth = excluded.web_auth,
        app_state = 'active', active_game_id = null, last_seen = now();
end $$;

-- Same as the hardening version, plus `web`: the subscriptions of the recipient's web devices.
-- `tokens` keeps only Expo tokens. Both obey the same rule: skip a device that has the game open.
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
               and (c.game_id is null or d.active_game_id is distinct from c.game_id or d.app_state <> 'active')
           ), '[]'::jsonb),
           'web', coalesce((
             select jsonb_agg(jsonb_build_object('endpoint', d.expo_push_token, 'p256dh', d.web_p256dh, 'auth', d.web_auth))
             from public.devices d
             where d.user_id = c.user_id and d.web_p256dh is not null
               and (c.game_id is null or d.active_game_id is distinct from c.game_id or d.app_state <> 'active')
           ), '[]'::jsonb))), '[]'::jsonb)
    into v_rows
  from claimed c join public.profiles p on p.id = c.user_id;
  return v_rows;
end $$;

revoke execute on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
revoke execute on function public.register_web_push(text, text, text) from public, anon;
grant execute on function public.register_web_push(text, text, text) to authenticated;
