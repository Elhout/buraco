-- Club chat: one group chat per club. Members read it (RLS) and post through send_chat_message;
-- Realtime delivers new messages to open chats. Every other member gets a push (chat_message),
-- except on a phone that has the chat open in the foreground (devices.chat_open, kept by
-- set_device_state like active_game_id).

create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index chat_messages_club_idx on public.chat_messages (club_id, created_at desc);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;
grant select on public.chat_messages to authenticated;
create policy chat_messages_select on public.chat_messages for select to authenticated
  using (public.is_club_member(club_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

create function public.send_chat_message(p_club_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_id   uuid;
begin
  if v_uid is null or not public.is_club_member(p_club_id) then
    raise exception 'not a member of this club' using errcode = 'insufficient_privilege';
  end if;
  if v_body = '' then
    raise exception 'message is empty' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'message is too long' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.chat_messages (club_id, user_id, body) values (p_club_id, v_uid, v_body) returning id into v_id;

  perform public.enqueue_notification(
    array(select m.user_id from public.club_members m where m.club_id = p_club_id and m.user_id <> v_uid),
    'chat_message', '/chat',
    jsonb_build_object(
      'sender', (select p.display_name from public.profiles p where p.id = v_uid),
      'text', left(v_body, 140)));
  return v_id;
end $$;

revoke execute on function public.send_chat_message(uuid, text) from public, anon;
grant execute on function public.send_chat_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------- chat open on this phone

alter table public.devices add column chat_open boolean not null default false;

-- Re-registering a phone starts it fresh, chat closed included.
create or replace function public.register_device(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[.+\]$' then
    raise exception 'invalid push token' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.devices (user_id, expo_push_token, platform)
  values ((select auth.uid()), p_token, p_platform)
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id, platform = excluded.platform,
        app_state = 'active', active_game_id = null, chat_open = false, last_seen = now();
end $$;

drop function public.set_device_state(text, text, uuid);
create function public.set_device_state(p_token text, p_app_state text, p_active_game_id uuid default null, p_chat_open boolean default false)
returns void
language sql security definer set search_path = '' as $$
  update public.devices
  set app_state = p_app_state, active_game_id = p_active_game_id, chat_open = coalesce(p_chat_open, false), last_seen = now()
  where expo_push_token = p_token and user_id = (select auth.uid())
$$;
revoke execute on function public.set_device_state(text, text, uuid, boolean) from public, anon;
grant execute on function public.set_device_state(text, text, uuid, boolean) to authenticated;

-- Same as 20261030000000_web_push, plus: chat pushes skip phones with the chat open in front.
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
               and (c.event <> 'chat_message' or not d.chat_open or d.app_state <> 'active')
           ), '[]'::jsonb),
           'web', coalesce((
             select jsonb_agg(jsonb_build_object('endpoint', d.expo_push_token, 'p256dh', d.web_p256dh, 'auth', d.web_auth))
             from public.devices d
             where d.user_id = c.user_id and d.web_p256dh is not null
               and (c.game_id is null or d.active_game_id is distinct from c.game_id or d.app_state <> 'active')
               and (c.event <> 'chat_message' or not d.chat_open or d.app_state <> 'active')
           ), '[]'::jsonb))), '[]'::jsonb)
    into v_rows
  from claimed c join public.profiles p on p.id = c.user_id;
  return v_rows;
end $$;
revoke execute on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
