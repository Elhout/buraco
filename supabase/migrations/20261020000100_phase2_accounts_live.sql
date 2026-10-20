-- Phase 2: PIN, devices, club membership RPCs, normal (PIN-confirmed) games, open rounds with
-- exact-cut bonuses, dispute/undo/abandon, final-result confirmation, ghost retro-verification
-- and the push notification queue.
--
-- PIN-checking RPCs return jsonb {ok:false, error:'wrong_pin'|'locked'|'no_pin', ...} instead of
-- raising: an exception would roll back the failed-attempt counter and defeat the lockout.

-- ================================================================ profiles & clubs

alter table public.profiles
  add column notify_game_started boolean not null default true,
  add column notify_tournament   boolean not null default true;

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, avatar_url, lang, notify_game_started, notify_tournament) on public.profiles to authenticated;

alter table public.clubs add column season_start date;
grant update (season_start) on public.clubs to authenticated;

-- ================================================================ PIN

create table public.pins (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  pin_hash        text not null,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
alter table public.pins enable row level security; -- no policies: reachable only through functions
revoke all on public.pins from anon, authenticated;

create function public.assert_pin_format(p_pin text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be 4 digits' using errcode = 'invalid_parameter_value';
  end if;
end $$;

-- Internal. 5 wrong attempts lock the PIN for 15 minutes.
create function public.verify_pin(p_user_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.pins;
begin
  select * into p from public.pins where user_id = p_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_pin');
  end if;
  if p.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', p.locked_until);
  end if;
  if p_pin is not null and p.pin_hash = extensions.crypt(p_pin, p.pin_hash) then
    update public.pins set failed_attempts = 0, locked_until = null where user_id = p_user_id;
    return jsonb_build_object('ok', true);
  end if;
  if p.failed_attempts + 1 >= 5 then
    update public.pins
    set failed_attempts = 0, locked_until = now() + interval '15 minutes'
    where user_id = p_user_id;
    return jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', now() + interval '15 minutes');
  end if;
  update public.pins set failed_attempts = p.failed_attempts + 1, locked_until = null where user_id = p_user_id;
  return jsonb_build_object('ok', false, 'error', 'wrong_pin', 'attempts_left', 5 - (p.failed_attempts + 1));
end $$;

create function public.has_pin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pins where user_id = (select auth.uid()))
$$;

create function public.check_my_pin(p_pin text) returns jsonb
language sql security definer set search_path = '' as $$
  select public.verify_pin((select auth.uid()), p_pin)
$$;

create function public.set_pin(p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_pin_format(p_pin);
  if exists (select 1 from public.pins where user_id = (select auth.uid())) then
    raise exception 'PIN already set; change or reset it instead' using errcode = 'unique_violation';
  end if;
  insert into public.pins (user_id, pin_hash)
  values ((select auth.uid()), extensions.crypt(p_pin, extensions.gen_salt('bf', 8)));
end $$;

create function public.change_pin(p_old_pin text, p_new_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_check jsonb;
begin
  perform public.assert_pin_format(p_new_pin);
  v_check := public.verify_pin((select auth.uid()), p_old_pin);
  if not (v_check ->> 'ok')::boolean then
    return v_check;
  end if;
  update public.pins
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 8)), updated_at = now()
  where user_id = (select auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- Supabase lists each sign-in method with its unix timestamp in the JWT `amr` claim.
create function public.recently_authenticated(p_window interval) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(
    (select max((m ->> 'timestamp')::bigint) from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) m),
    0
  ) >= extract(epoch from now() - p_window)
$$;

-- Forgotten PIN: allowed only right after a fresh OTP / social sign-in. Also clears a lockout.
create function public.reset_pin(p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_pin_format(p_pin);
  if not public.recently_authenticated(interval '10 minutes') then
    raise exception 'sign in again to reset your PIN' using errcode = 'insufficient_privilege';
  end if;
  insert into public.pins (user_id, pin_hash)
  values ((select auth.uid()), extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
end $$;

-- ================================================================ devices

create table public.devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null unique,
  platform        text not null check (platform in ('ios', 'android', 'web')),
  app_state       text not null default 'active' check (app_state in ('active', 'background')),
  active_game_id  uuid references public.games (id) on delete set null,
  last_seen       timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index devices_user_id_idx on public.devices (user_id);
alter table public.devices enable row level security;
create policy devices_select_own on public.devices for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.devices from anon, authenticated;

create function public.register_device(p_token text, p_platform text) returns void
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
        app_state = 'active', active_game_id = null, last_seen = now();
end $$;

create function public.unregister_device(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.devices where expo_push_token = p_token and user_id = (select auth.uid())
$$;

-- Lets the dispatcher skip pushes about a game that is already open on screen.
create function public.set_device_state(p_token text, p_app_state text, p_active_game_id uuid default null) returns void
language sql security definer set search_path = '' as $$
  update public.devices
  set app_state = p_app_state, active_game_id = p_active_game_id, last_seen = now()
  where expo_push_token = p_token and user_id = (select auth.uid())
$$;

-- ================================================================ club membership

create function public.create_club(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  insert into public.clubs (name, owner_id) values (btrim(p_name), (select auth.uid())) returning id into v_id;
  return v_id;
end $$;

create function public.join_club(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_club_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  select id into v_club_id from public.clubs where invite_code = upper(btrim(p_code));
  if not found then
    raise exception 'invalid invite code' using errcode = 'no_data_found';
  end if;
  insert into public.club_members (club_id, user_id) values (v_club_id, (select auth.uid()))
  on conflict do nothing;
  return v_club_id;
end $$;

create function public.assert_club_owner(p_club_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.clubs where id = p_club_id and owner_id = (select auth.uid())) then
    raise exception 'only the club owner can do this' using errcode = 'insufficient_privilege';
  end if;
end $$;

create function public.rotate_invite_code(p_club_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  perform public.assert_club_owner(p_club_id);
  update public.clubs set invite_code = public.generate_invite_code() where id = p_club_id returning invite_code into v_code;
  return v_code;
end $$;

create function public.set_member_role(p_club_id uuid, p_user_id uuid, p_role public.club_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_club_owner(p_club_id);
  if p_role = 'owner' then
    raise exception 'use transfer_ownership' using errcode = 'invalid_parameter_value';
  end if;
  update public.club_members set role = p_role
  where club_id = p_club_id and user_id = p_user_id and role <> 'owner';
  if not found then
    raise exception 'member not found' using errcode = 'no_data_found';
  end if;
end $$;

-- Owners remove anyone but themselves; admins remove plain members.
create function public.remove_member(p_club_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_my_role     public.club_role;
  v_target_role public.club_role;
begin
  select role into v_my_role from public.club_members where club_id = p_club_id and user_id = (select auth.uid());
  select role into v_target_role from public.club_members where club_id = p_club_id and user_id = p_user_id;
  if v_target_role is null then
    raise exception 'member not found' using errcode = 'no_data_found';
  end if;
  if v_target_role = 'owner'
     or v_my_role is null
     or v_my_role = 'member'
     or (v_my_role = 'admin' and v_target_role <> 'member') then
    raise exception 'not allowed to remove this member' using errcode = 'insufficient_privilege';
  end if;
  delete from public.club_members where club_id = p_club_id and user_id = p_user_id;
end $$;

create function public.transfer_ownership(p_club_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_club_owner(p_club_id);
  if not exists (select 1 from public.club_members where club_id = p_club_id and user_id = p_user_id and role <> 'owner') then
    raise exception 'new owner must be a club member' using errcode = 'invalid_parameter_value';
  end if;
  update public.club_members set role = 'admin' where club_id = p_club_id and user_id = (select auth.uid());
  update public.club_members set role = 'owner' where club_id = p_club_id and user_id = p_user_id;
  update public.clubs set owner_id = p_user_id where id = p_club_id;
end $$;

-- ================================================================ notification queue

create table public.notification_queue (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  event         text not null,
  game_id       uuid references public.games (id) on delete cascade,
  tournament_id uuid,
  payload       jsonb not null default '{}',
  deep_link     text not null,
  status        text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'skipped', 'failed')),
  attempts      integer not null default 0,
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index notification_queue_queued_idx on public.notification_queue (created_at) where status = 'queued';
alter table public.notification_queue enable row level security;
revoke all on public.notification_queue from anon, authenticated;

-- Internal. Honours the per-user toggles for game-started and tournament pushes.
create function public.enqueue_notification(
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
    and (p_event <> 'game_started' or p.notify_game_started)
    and (p_event not like 'tournament_%' or p.notify_tournament)
$$;

-- Dispatcher (service role): claims a batch, resolving each row to the recipient's language and
-- push tokens. Devices that have this game open in the foreground are left out.
create function public.claim_notifications(p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rows jsonb;
begin
  with batch as (
    select q.id from public.notification_queue q
    where q.status = 'queued'
    order by q.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.notification_queue q
    set status = 'sending', attempts = q.attempts + 1
    from batch where q.id = batch.id
    returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'event', c.event, 'payload', c.payload, 'deep_link', c.deep_link,
           'lang', p.lang,
           'tokens', coalesce((
             select jsonb_agg(d.expo_push_token) from public.devices d
             where d.user_id = c.user_id
               and (c.game_id is null or d.active_game_id is distinct from c.game_id or d.app_state <> 'active')
           ), '[]'::jsonb))), '[]'::jsonb)
    into v_rows
  from claimed c join public.profiles p on p.id = c.user_id;
  return v_rows;
end $$;

-- p_results: [{"id": "...", "status": "sent"|"skipped"|"failed"|"queued", "error": "..."}]
create function public.finish_notifications(p_results jsonb, p_dead_tokens text[] default '{}') returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_queue q
  set status = r.status,
      error = r.error,
      sent_at = case when r.status = 'sent' then now() else q.sent_at end
  from jsonb_to_recordset(p_results) as r (id uuid, status text, error text)
  where q.id = r.id;
  delete from public.devices where expo_push_token = any (p_dead_tokens);
end $$;

-- ================================================================ games: columns & helpers

alter table public.games
  add column invite_expires_at      timestamptz,
  add column invite_warned_at       timestamptz,
  add column proposed_winner        public.team,
  add column result_proposed_at     timestamptz,
  add column result_confirmed_teams public.team[] not null default '{}',
  add column undo_requested_by      public.team,
  add column undo_requested_at      timestamptz,
  add column abandon_approvals      public.team[] not null default '{}';

alter table public.rounds
  alter column team_a_score drop not null,
  alter column team_b_score drop not null,
  alter column entered_by_seat drop not null,
  add column client_id uuid unique,
  add constraint rounds_scored_unless_open
    check (status = 'open' or (team_a_score is not null and team_b_score is not null and entered_by_seat is not null));
drop index public.rounds_one_pending_per_game;
create unique index rounds_one_active_per_game on public.rounds (game_id) where status in ('open', 'pending');

drop function public.confirm_round(uuid);
drop function public.submit_round(uuid, integer, integer, smallint[]);
drop function public.create_ghost_game(uuid, jsonb);
drop function public.lock_ghost_game(uuid);

create function public.other_team(p_team public.team) returns public.team
language sql immutable set search_path = '' as $$
  select (case when p_team = 'A' then 'B' else 'A' end)::public.team
$$;

create function public.seat_name(p_game_id uuid, p_seat smallint) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(p.display_name, s.guest_name)
  from public.game_seats s left join public.profiles p on p.id = s.user_id
  where s.game_id = p_game_id and s.seat = p_seat
$$;

create function public.team_names(p_game_id uuid, p_team public.team) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.seat_name(p_game_id, s.seat) order by s.seat), '[]'::jsonb)
  from public.game_seats s where s.game_id = p_game_id and s.team = p_team
$$;

create function public.team_scorekeeper(p_game_id uuid, p_team public.team) returns public.game_seats
language sql stable security definer set search_path = '' as $$
  select * from public.game_seats where game_id = p_game_id and team = p_team and is_scorekeeper
$$;

-- Locks the game row for the rest of the transaction; the caller must belong to its club.
create function public.lock_game(p_game_id uuid) returns public.games
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game not found' using errcode = 'no_data_found';
  end if;
  if not public.is_club_member(g.club_id) then
    raise exception 'not a member of this club' using errcode = 'insufficient_privilege';
  end if;
  return g;
end $$;

create function public.assert_live(g public.games) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if g.status <> 'live' then
    raise exception 'game is not live' using errcode = 'invalid_parameter_value';
  end if;
end $$;

-- The seat a caller acts from. Ghost: only the host, acting as their team's scorekeeper.
-- Normal: the caller's own seat, which must be a scorekeeper when p_scorekeeper is true.
create function public.actor_seat(g public.games, p_scorekeeper boolean) returns public.game_seats
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.game_seats;
begin
  if g.mode = 'ghost' then
    if g.host_id is distinct from (select auth.uid()) then
      raise exception 'only the host can score a ghost game' using errcode = 'insufficient_privilege';
    end if;
    select * into s from public.game_seats where game_id = g.id and seat = public.ghost_scorekeeper_seat(g, true);
    return s;
  end if;
  select * into s from public.game_seats where game_id = g.id and user_id = (select auth.uid());
  if not found then
    raise exception 'you are not seated in this game' using errcode = 'insufficient_privilege';
  end if;
  if p_scorekeeper and not s.is_scorekeeper then
    raise exception 'only scorekeepers can do this' using errcode = 'insufficient_privilege';
  end if;
  return s;
end $$;

-- Gives each team without a scorekeeper its lowest eligible seat (confirmed members in normal games).
create function public.ensure_scorekeepers(p_game_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.game_seats s set is_scorekeeper = true
  from (
    select distinct on (c.team) c.seat
    from public.game_seats c
    join public.games g on g.id = c.game_id
    where c.game_id = p_game_id
      and not exists (select 1 from public.game_seats k where k.game_id = p_game_id and k.team = c.team and k.is_scorekeeper)
      and (g.mode = 'ghost' or (c.user_id is not null and c.invite_status = 'confirmed'))
    order by c.team, c.seat
  ) pick
  where s.game_id = p_game_id and s.seat = pick.seat
$$;

create function public.log_game_event(p_game_id uuid, p_type text, p_actor_seat smallint default null, p_payload jsonb default '{}')
returns void
language sql security definer set search_path = '' as $$
  insert into public.game_events (game_id, type, actor_seat, actor_id, payload)
  values (p_game_id, p_type, p_actor_seat, (select auth.uid()), p_payload)
$$;

create function public.game_ok(p_game_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ok', true, 'game', to_jsonb(g)) from public.games g where g.id = p_game_id
$$;

create function public.notify_game_started(p_game_id uuid) returns void
language sql security definer set search_path = '' as $$
  select public.enqueue_notification(
    array(
      select m.user_id from public.club_members m join public.games g on g.club_id = m.club_id
      where g.id = p_game_id
        and not exists (select 1 from public.game_seats s where s.game_id = p_game_id and s.user_id = m.user_id)
    ),
    'game_started', '/game/' || p_game_id,
    jsonb_build_object('team_a', public.team_names(p_game_id, 'A'), 'team_b', public.team_names(p_game_id, 'B')),
    p_game_id)
$$;

create function public.notify_invite(p_game_id uuid, p_seat smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.game_seats;
  g public.games;
begin
  select * into g from public.games where id = p_game_id;
  select * into s from public.game_seats where game_id = p_game_id and seat = p_seat;
  perform public.enqueue_notification(
    array[s.user_id], 'game_invite', '/game/' || p_game_id || '/invite',
    jsonb_build_object(
      'host', (select display_name from public.profiles where id = g.host_id),
      'partner', (select public.seat_name(p_game_id, o.seat) from public.game_seats o
                  where o.game_id = p_game_id and o.team = s.team and o.seat <> s.seat),
      'opponents', public.team_names(p_game_id, public.other_team(s.team))),
    p_game_id);
end $$;

-- ================================================================ game lifecycle

-- p_seats: [{"seat":1,"team":"A","user_id":"…"} | {"seat":2,"team":"B","guest_name":"Ali"}, …] × 4.
-- Normal games: 4 club members including the host, who is confirmed and keeps score for their team.
-- Ghost games: any mix of members and guests; live immediately.
create function public.create_game(p_club_id uuid, p_seats jsonb, p_mode public.game_mode default 'normal') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := (select auth.uid());
  v_game_id uuid;
  v_seat    smallint;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_club_member(p_club_id) then
    raise exception 'not a member of this club' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_seats) is distinct from 'array' or jsonb_array_length(p_seats) <> 4 then
    raise exception 'exactly 4 seats are required' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.games (club_id, host_id, mode) values (p_club_id, v_uid, p_mode) returning id into v_game_id;

  insert into public.game_seats (game_id, seat, team, user_id, guest_name)
  select v_game_id, (s ->> 'seat')::smallint, (s ->> 'team')::public.team,
         nullif(s ->> 'user_id', '')::uuid, nullif(btrim(s ->> 'guest_name'), '')
  from jsonb_array_elements(p_seats) s;

  if (select count(*) from public.game_seats where game_id = v_game_id and team = 'A') <> 2 then
    raise exception 'each team needs exactly 2 players' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from public.game_seats s
    where s.game_id = v_game_id and s.user_id is not null
      and not exists (select 1 from public.club_members m where m.club_id = p_club_id and m.user_id = s.user_id)
  ) then
    raise exception 'every seated member must belong to the club' using errcode = 'invalid_parameter_value';
  end if;

  if p_mode = 'ghost' then
    -- One scorekeeper per team: the host's own seat if seated there, otherwise the lowest seat.
    update public.game_seats s set is_scorekeeper = true
    where s.game_id = v_game_id
      and s.seat in (
        select distinct on (team) seat from public.game_seats
        where game_id = v_game_id
        order by team, (user_id = v_uid) desc nulls last, seat
      );
    update public.games set status = 'live' where id = v_game_id;
    perform public.log_game_event(v_game_id, 'created', null, jsonb_build_object('mode', 'ghost'));
    perform public.notify_game_started(v_game_id);
    return v_game_id;
  end if;

  if exists (select 1 from public.game_seats where game_id = v_game_id and user_id is null) then
    raise exception 'guests can only play ghost games' using errcode = 'invalid_parameter_value';
  end if;
  update public.game_seats
  set invite_status = 'confirmed', confirmed_at = now(), is_scorekeeper = true
  where game_id = v_game_id and user_id = v_uid
  returning seat into v_seat;
  if v_seat is null then
    raise exception 'the host must take a seat' using errcode = 'invalid_parameter_value';
  end if;

  update public.games set status = 'inviting', invite_expires_at = now() + interval '10 minutes' where id = v_game_id;
  perform public.log_game_event(v_game_id, 'created', v_seat, jsonb_build_object('mode', 'normal'));
  perform public.notify_invite(v_game_id, s.seat)
  from public.game_seats s where s.game_id = v_game_id and s.invite_status = 'invited';
  return v_game_id;
end $$;

create function public.create_ghost_game(p_club_id uuid, p_seats jsonb) returns uuid
language sql security definer set search_path = '' as $$
  select public.create_game(p_club_id, p_seats, 'ghost')
$$;

create function public.go_live_if_ready(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.game_seats
    where game_id = p_game_id and user_id is not null and invite_status <> 'confirmed'
  ) then
    perform public.ensure_scorekeepers(p_game_id);
    update public.games set status = 'live' where id = p_game_id;
    perform public.log_game_event(p_game_id, 'live');
    perform public.notify_game_started(p_game_id);
  end if;
end $$;

create function public.respond_invite(p_game_id uuid, p_accept boolean, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g       public.games;
  s       public.game_seats;
  v_check jsonb;
begin
  g := public.lock_game(p_game_id);
  if g.status <> 'inviting' then
    raise exception 'game is not waiting for players' using errcode = 'invalid_parameter_value';
  end if;
  if g.invite_expires_at < now() then
    raise exception 'invite has expired' using errcode = 'invalid_parameter_value';
  end if;
  select * into s from public.game_seats where game_id = p_game_id and user_id = (select auth.uid());
  if not found then
    raise exception 'you are not invited to this game' using errcode = 'insufficient_privilege';
  end if;
  if s.invite_status <> 'invited' then
    raise exception 'you already responded' using errcode = 'invalid_parameter_value';
  end if;

  if not p_accept then
    update public.game_seats set invite_status = 'declined' where game_id = p_game_id and seat = s.seat;
    perform public.log_game_event(p_game_id, 'invite_declined', s.seat);
    return public.game_ok(p_game_id);
  end if;

  v_check := public.verify_pin((select auth.uid()), p_pin);
  if not (v_check ->> 'ok')::boolean then
    return v_check;
  end if;
  update public.game_seats set invite_status = 'confirmed', confirmed_at = now()
  where game_id = p_game_id and seat = s.seat;
  -- The first confirmed opponent keeps score for their team.
  perform public.ensure_scorekeepers(p_game_id);
  perform public.log_game_event(p_game_id, 'invite_accepted', s.seat);
  perform public.go_live_if_ready(p_game_id);
  return public.game_ok(p_game_id);
end $$;

create function public.assert_inviting_host(g public.games) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if g.host_id is distinct from (select auth.uid()) then
    raise exception 'only the host can do this' using errcode = 'insufficient_privilege';
  end if;
  if g.status not in ('draft', 'inviting') then
    raise exception 'game has already started' using errcode = 'invalid_parameter_value';
  end if;
end $$;

-- Host replaces an invited/declined player; the invite window restarts.
create function public.swap_seat(p_game_id uuid, p_seat smallint, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  s public.game_seats;
begin
  g := public.lock_game(p_game_id);
  perform public.assert_inviting_host(g);
  select * into s from public.game_seats where game_id = p_game_id and seat = p_seat;
  if not found or s.user_id = g.host_id then
    raise exception 'cannot swap this seat' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.club_members where club_id = g.club_id and user_id = p_user_id) then
    raise exception 'every seated member must belong to the club' using errcode = 'invalid_parameter_value';
  end if;
  update public.game_seats
  set user_id = p_user_id, invite_status = 'invited', confirmed_at = null, is_scorekeeper = false
  where game_id = p_game_id and seat = p_seat;
  perform public.ensure_scorekeepers(p_game_id);
  update public.games set invite_expires_at = now() + interval '10 minutes', invite_warned_at = null where id = p_game_id;
  perform public.log_game_event(p_game_id, 'seat_swapped', null, jsonb_build_object('seat', p_seat, 'from', s.user_id, 'to', p_user_id));
  perform public.notify_invite(p_game_id, p_seat);
end $$;

-- Host gives up on invites and plays it as ghost; anyone who already confirmed counts as verified.
create function public.switch_to_ghost(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
begin
  g := public.lock_game(p_game_id);
  perform public.assert_inviting_host(g);
  update public.game_seats
  set verified_at = case when invite_status = 'confirmed' then confirmed_at end
  where game_id = p_game_id;
  update public.games set mode = 'ghost' where id = p_game_id;
  perform public.ensure_scorekeepers(p_game_id);
  update public.games set status = 'live' where id = p_game_id;
  perform public.log_game_event(p_game_id, 'switched_to_ghost');
  perform public.notify_game_started(p_game_id);
end $$;

create function public.cancel_game(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
begin
  g := public.lock_game(p_game_id);
  perform public.assert_inviting_host(g);
  update public.games set status = 'abandoned' where id = p_game_id;
  perform public.log_game_event(p_game_id, 'cancelled');
end $$;

-- Cron (service role): warn at 2 minutes left, then expire.
create function public.warn_expiring_invites() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  g       public.games;
  v_count integer := 0;
begin
  for g in
    update public.games set invite_warned_at = now()
    where status = 'inviting' and invite_warned_at is null and invite_expires_at <= now() + interval '2 minutes'
    returning *
  loop
    perform public.enqueue_notification(
      array(select user_id from public.game_seats where game_id = g.id and invite_status = 'invited'),
      'invite_expiring', '/game/' || g.id || '/invite', '{}'::jsonb, g.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create function public.expire_invites() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  with expired as (
    update public.games set status = 'expired'
    where status = 'inviting' and invite_expires_at < now()
    returning id
  )
  insert into public.game_events (game_id, type) select id, 'expired' from expired;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ================================================================ rounds

create function public.active_round(p_game_id uuid) returns public.rounds
language sql stable security definer set search_path = '' as $$
  select * from public.rounds where game_id = p_game_id and status in ('open', 'pending')
$$;

create function public.assert_no_result_pending(g public.games) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if g.result_proposed_at is not null then
    raise exception 'the final result is awaiting confirmation' using errcode = 'invalid_parameter_value';
  end if;
end $$;

-- +100 exact cut, tapped during the deal. Creates the open round if needed.
create function public.add_cut(p_game_id uuid, p_seat smallint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  g         public.games;
  r         public.rounds;
  v_line_id uuid;
begin
  g := public.lock_game(p_game_id);
  perform public.assert_live(g);
  perform public.actor_seat(g, true);
  perform public.assert_no_result_pending(g);
  if p_seat is null or p_seat not between 1 and 4 then
    raise exception 'cut seats must be distinct seats 1-4' using errcode = 'invalid_parameter_value';
  end if;
  r := public.active_round(p_game_id);
  if r.status = 'pending' then
    raise exception 'confirm the previous round first' using errcode = 'invalid_parameter_value';
  end if;
  if r.id is null then
    insert into public.rounds (game_id, round_no, status)
    values (p_game_id, (select coalesce(max(round_no), 0) + 1 from public.rounds where game_id = p_game_id), 'open')
    returning * into r;
  end if;
  if exists (select 1 from public.round_lines where round_id = r.id and seat = p_seat) then
    raise exception 'this player already has the cut bonus this round' using errcode = 'unique_violation';
  end if;
  insert into public.round_lines (round_id, type, seat, points)
  values (r.id, 'cut_bonus', p_seat, (g.config_snapshot ->> 'cut_bonus')::integer)
  returning id into v_line_id;
  return v_line_id;
end $$;

create function public.remove_cut(p_line_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rounds;
  g public.games;
begin
  select r2.* into r from public.round_lines l join public.rounds r2 on r2.id = l.round_id where l.id = p_line_id;
  if not found then
    raise exception 'bonus not found' using errcode = 'no_data_found';
  end if;
  g := public.lock_game(r.game_id);
  perform public.assert_live(g);
  perform public.actor_seat(g, true);
  if r.status <> 'open' then
    raise exception 'only bonuses in the round being played can be removed' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.round_lines where id = p_line_id;
  delete from public.rounds
  where id = r.id and team_a_score is null and not exists (select 1 from public.round_lines where round_id = r.id);
end $$;

-- Scorekeeper enters both scores; the other team confirms. p_client_id makes outbox replays idempotent.
create function public.submit_round(
  p_game_id   uuid,
  p_team_a    integer,
  p_team_b    integer,
  p_cut_seats smallint[] default '{}',
  p_client_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  g          public.games;
  s          public.game_seats;
  r          public.rounds;
  v_existing uuid;
begin
  g := public.lock_game(p_game_id);
  if p_client_id is not null then
    select id into v_existing from public.rounds where client_id = p_client_id and game_id = p_game_id;
    if found then
      return v_existing;
    end if;
  end if;
  perform public.assert_live(g);
  s := public.actor_seat(g, true);
  perform public.assert_no_result_pending(g);

  if p_team_a is null or p_team_b is null then
    raise exception 'both team scores are required' using errcode = 'invalid_parameter_value';
  end if;
  if abs(p_team_a) > 99999 or abs(p_team_b) > 99999 then
    raise exception 'round score out of range' using errcode = 'invalid_parameter_value';
  end if;
  if not (g.config_snapshot ->> 'allow_negative')::boolean and (p_team_a < 0 or p_team_b < 0) then
    raise exception 'negative round scores are not allowed in this club' using errcode = 'invalid_parameter_value';
  end if;

  r := public.active_round(p_game_id);
  if r.status = 'pending' then
    raise exception 'a round is already waiting for confirmation' using errcode = 'unique_violation';
  end if;

  p_cut_seats := coalesce(p_cut_seats, '{}');
  if cardinality(p_cut_seats) > 4
     or array_position(p_cut_seats, null) is not null
     or exists (select 1 from unnest(p_cut_seats) c where c not between 1 and 4)
     or (select count(distinct c) from unnest(p_cut_seats) c) <> cardinality(p_cut_seats)
     or exists (select 1 from public.round_lines where round_id = r.id and seat = any (p_cut_seats)) then
    raise exception 'cut seats must be distinct seats 1-4' using errcode = 'invalid_parameter_value';
  end if;

  if r.id is null then
    insert into public.rounds (game_id, round_no, team_a_score, team_b_score, entered_by_seat, client_id)
    values (p_game_id, (select coalesce(max(round_no), 0) + 1 from public.rounds where game_id = p_game_id),
            p_team_a, p_team_b, s.seat, p_client_id)
    returning * into r;
  else
    update public.rounds
    set team_a_score = p_team_a, team_b_score = p_team_b, entered_by_seat = s.seat,
        status = 'pending', client_id = coalesce(p_client_id, client_id)
    where id = r.id
    returning * into r;
  end if;
  update public.rounds set status = 'pending' where id = r.id;

  insert into public.round_lines (round_id, type, seat, points)
  select r.id, 'cut_bonus', c, (g.config_snapshot ->> 'cut_bonus')::integer from unnest(p_cut_seats) c;

  if g.mode = 'normal' then
    perform public.enqueue_notification(
      array[(public.team_scorekeeper(p_game_id, public.other_team(s.team))).user_id],
      'round_to_confirm', '/game/' || p_game_id,
      jsonb_build_object(
        'round_no', (select count(*) + 1 from public.rounds where game_id = p_game_id and status = 'confirmed'),
        'a', p_team_a, 'b', p_team_b),
      p_game_id);
  end if;
  return r.id;
end $$;

-- Locks a pending round and checks the caller may confirm/dispute it (the other team's scorekeeper,
-- or the ghost host). Returns the acting seat.
create function public.lock_pending_round(p_round_id uuid, out g public.games, out r public.rounds, out confirmer public.game_seats)
language plpgsql security definer set search_path = '' as $$
declare
  v_game_id  uuid;
  v_entering public.team;
begin
  select game_id into v_game_id from public.rounds where id = p_round_id;
  if not found then
    raise exception 'round not found' using errcode = 'no_data_found';
  end if;
  g := public.lock_game(v_game_id);
  perform public.assert_live(g);
  select * into r from public.rounds where id = p_round_id for update;
  if r.status <> 'pending' then
    raise exception 'round is not waiting for confirmation' using errcode = 'invalid_parameter_value';
  end if;
  select team into v_entering from public.game_seats where game_id = v_game_id and seat = r.entered_by_seat;
  if g.mode = 'ghost' then
    perform public.actor_seat(g, true);
    confirmer := public.team_scorekeeper(v_game_id, public.other_team(v_entering));
  else
    confirmer := public.actor_seat(g, true);
    if confirmer.team = v_entering then
      raise exception 'the other team must confirm this round' using errcode = 'insufficient_privilege';
    end if;
  end if;
end $$;

-- Proposes the result once a team is at/over target with unequal totals; both teams then confirm.
create function public.propose_result_if_over(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g        public.games;
  t        record;
  v_target integer;
  v_winner public.team;
begin
  select * into g from public.games where id = p_game_id;
  select * into t from public.v_game_totals where game_id = p_game_id;
  v_target := (g.config_snapshot ->> 'target_score')::integer;
  if not ((t.team_a_total >= v_target or t.team_b_total >= v_target) and t.team_a_total <> t.team_b_total) then
    return;
  end if;
  v_winner := (case when t.team_a_total > t.team_b_total then 'A' else 'B' end)::public.team;
  update public.games
  set proposed_winner = v_winner, result_proposed_at = now(), result_confirmed_teams = '{}'
  where id = p_game_id;
  perform public.log_game_event(p_game_id, 'result_proposed', null,
    jsonb_build_object('winner', v_winner, 'a', t.team_a_total, 'b', t.team_b_total));
  if g.mode = 'normal' then
    perform public.enqueue_notification(
      array(select user_id from public.game_seats where game_id = p_game_id and is_scorekeeper),
      'result_to_confirm', '/game/' || p_game_id || '/result',
      jsonb_build_object('winner', v_winner, 'a', t.team_a_total, 'b', t.team_b_total),
      p_game_id);
  end if;
end $$;

create function public.confirm_round(p_round_id uuid, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l       record;
  v_check jsonb;
begin
  l := public.lock_pending_round(p_round_id);
  if (l.g).mode = 'normal' then
    v_check := public.verify_pin((select auth.uid()), p_pin);
    if not (v_check ->> 'ok')::boolean then
      return v_check;
    end if;
  end if;
  update public.rounds
  set status = 'confirmed', confirmed_at = now(), confirmed_by_seat = (l.confirmer).seat
  where id = p_round_id;
  perform public.propose_result_if_over((l.g).id);
  return public.game_ok((l.g).id);
end $$;

-- Sends the round back to the entering team to correct; bonuses stay attached.
create function public.dispute_round(p_round_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l record;
begin
  l := public.lock_pending_round(p_round_id);
  update public.rounds set status = 'open' where id = p_round_id;
  perform public.log_game_event((l.g).id, 'round_disputed', (l.confirmer).seat,
    jsonb_build_object('round_id', p_round_id, 'a', (l.r).team_a_score, 'b', (l.r).team_b_score));
end $$;

create function public.finish_game(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
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
end $$;

create function public.confirm_result(p_game_id uuid, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g       public.games;
  s       public.game_seats;
  v_check jsonb;
begin
  g := public.lock_game(p_game_id);
  perform public.assert_live(g);
  if g.result_proposed_at is null then
    raise exception 'there is no result to confirm' using errcode = 'invalid_parameter_value';
  end if;
  s := public.actor_seat(g, true);
  if g.mode = 'ghost' then
    perform public.finish_game(p_game_id);
    return public.game_ok(p_game_id);
  end if;
  if s.team = any (g.result_confirmed_teams) then
    raise exception 'your team already confirmed' using errcode = 'invalid_parameter_value';
  end if;
  v_check := public.verify_pin((select auth.uid()), p_pin);
  if not (v_check ->> 'ok')::boolean then
    return v_check;
  end if;
  update public.games set result_confirmed_teams = result_confirmed_teams || s.team where id = p_game_id
  returning * into g;
  perform public.log_game_event(p_game_id, 'result_confirmed', s.seat);
  if cardinality(g.result_confirmed_teams) = 2 then
    perform public.finish_game(p_game_id);
  end if;
  return public.game_ok(p_game_id);
end $$;

-- ================================================================ undo, scorekeepers, abandon

create function public.do_undo(p_game_id uuid, p_actor_seat smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rounds;
begin
  select * into r from public.rounds
  where game_id = p_game_id and status = 'confirmed'
  order by round_no desc limit 1;
  update public.rounds set status = 'voided' where id = r.id;
  update public.games
  set proposed_winner = null, result_proposed_at = null, result_confirmed_teams = '{}',
      undo_requested_by = null, undo_requested_at = null
  where id = p_game_id;
  perform public.log_game_event(p_game_id, 'undo', p_actor_seat,
    jsonb_build_object('round_id', r.id, 'round_no', r.round_no, 'a', r.team_a_score, 'b', r.team_b_score));
end $$;

-- Ghost: undoes immediately. Normal: asks the other team's scorekeeper, who approves with PIN.
create function public.request_undo(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  s public.game_seats;
begin
  g := public.lock_game(p_game_id);
  perform public.assert_live(g);
  s := public.actor_seat(g, true);
  if not exists (select 1 from public.rounds where game_id = p_game_id and status = 'confirmed') then
    raise exception 'nothing to undo' using errcode = 'invalid_parameter_value';
  end if;
  if g.mode = 'ghost' then
    perform public.do_undo(p_game_id, s.seat);
    return;
  end if;
  if g.undo_requested_by is not null then
    raise exception 'an undo is already waiting for approval' using errcode = 'invalid_parameter_value';
  end if;
  update public.games set undo_requested_by = s.team, undo_requested_at = now() where id = p_game_id;
  perform public.log_game_event(p_game_id, 'undo_requested', s.seat);
  perform public.enqueue_notification(
    array[(public.team_scorekeeper(p_game_id, public.other_team(s.team))).user_id],
    'undo_requested', '/game/' || p_game_id,
    jsonb_build_object(
      'requester', public.seat_name(p_game_id, s.seat),
      'round_no', (select count(*) from public.rounds where game_id = p_game_id and status = 'confirmed')),
    p_game_id);
end $$;

create function public.respond_undo(p_game_id uuid, p_approve boolean, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g       public.games;
  s       public.game_seats;
  v_check jsonb;
begin
  g := public.lock_game(p_game_id);
  perform public.assert_live(g);
  s := public.actor_seat(g, true);
  if g.undo_requested_by is null then
    raise exception 'no undo is waiting for approval' using errcode = 'invalid_parameter_value';
  end if;
  if s.team = g.undo_requested_by then
    raise exception 'the other team must approve the undo' using errcode = 'insufficient_privilege';
  end if;
  if not p_approve then
    update public.games set undo_requested_by = null, undo_requested_at = null where id = p_game_id;
    perform public.log_game_event(p_game_id, 'undo_rejected', s.seat);
    return public.game_ok(p_game_id);
  end if;
  v_check := public.verify_pin((select auth.uid()), p_pin);
  if not (v_check ->> 'ok')::boolean then
    return v_check;
  end if;
  perform public.do_undo(p_game_id, s.seat);
  return public.game_ok(p_game_id);
end $$;

-- The host or the team's current scorekeeper hands scoring to another (confirmed) player of that team.
create function public.reassign_scorekeeper(p_game_id uuid, p_seat smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g      public.games;
  target public.game_seats;
begin
  g := public.lock_game(p_game_id);
  if g.status not in ('inviting', 'live') then
    raise exception 'game is not active' using errcode = 'invalid_parameter_value';
  end if;
  select * into target from public.game_seats where game_id = p_game_id and seat = p_seat;
  if not found then
    raise exception 'seat not found' using errcode = 'no_data_found';
  end if;
  if g.host_id is distinct from (select auth.uid())
     and (public.team_scorekeeper(p_game_id, target.team)).user_id is distinct from (select auth.uid()) then
    raise exception 'only the host or that team''s scorekeeper can reassign' using errcode = 'insufficient_privilege';
  end if;
  if g.mode = 'normal' and (target.user_id is null or target.invite_status <> 'confirmed') then
    raise exception 'the new scorekeeper must be a confirmed player' using errcode = 'invalid_parameter_value';
  end if;
  update public.game_seats set is_scorekeeper = false where game_id = p_game_id and team = target.team;
  update public.game_seats set is_scorekeeper = true where game_id = p_game_id and seat = p_seat;
  perform public.log_game_event(p_game_id, 'scorekeeper_reassigned', null, jsonb_build_object('seat', p_seat));
end $$;

-- Ghost: host abandons with one tap. Normal: each team's scorekeeper approves with PIN.
create function public.abandon_game(p_game_id uuid, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g       public.games;
  s       public.game_seats;
  v_check jsonb;
begin
  g := public.lock_game(p_game_id);
  perform public.assert_live(g);
  s := public.actor_seat(g, true);
  if g.mode = 'normal' then
    v_check := public.verify_pin((select auth.uid()), p_pin);
    if not (v_check ->> 'ok')::boolean then
      return v_check;
    end if;
    if not s.team = any (g.abandon_approvals) then
      update public.games set abandon_approvals = abandon_approvals || s.team where id = p_game_id returning * into g;
      perform public.log_game_event(p_game_id, 'abandon_approved', s.seat);
    end if;
    if cardinality(g.abandon_approvals) < 2 then
      return public.game_ok(p_game_id);
    end if;
  end if;
  update public.games set status = 'abandoned' where id = p_game_id;
  perform public.log_game_event(p_game_id, 'abandoned', s.seat);
  return public.game_ok(p_game_id);
end $$;

-- A real member of a finished ghost game signs it off; once every member seat is verified it counts.
create function public.verify_ghost_seat(p_game_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g       public.games;
  s       public.game_seats;
  v_check jsonb;
begin
  g := public.lock_game(p_game_id);
  if g.mode <> 'ghost' or g.status <> 'finished' then
    raise exception 'only finished ghost games can be verified' using errcode = 'invalid_parameter_value';
  end if;
  select * into s from public.game_seats where game_id = p_game_id and user_id = (select auth.uid());
  if not found then
    raise exception 'you are not seated in this game' using errcode = 'insufficient_privilege';
  end if;
  if s.verified_at is not null then
    raise exception 'your seat is already verified' using errcode = 'invalid_parameter_value';
  end if;
  v_check := public.verify_pin((select auth.uid()), p_pin);
  if not (v_check ->> 'ok')::boolean then
    return v_check;
  end if;
  update public.game_seats set verified_at = now() where game_id = p_game_id and seat = s.seat;
  perform public.log_game_event(p_game_id, 'seat_verified', s.seat);
  if not exists (select 1 from public.game_seats where game_id = p_game_id and user_id is not null and verified_at is null) then
    update public.games set verified = true where id = p_game_id;
  end if;
  return public.game_ok(p_game_id);
end $$;

-- ================================================================ realtime

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.games, public.game_seats, public.rounds, public.round_lines;
  end if;
end $$;

-- ================================================================ grants

revoke execute on function
  public.assert_pin_format(text),
  public.verify_pin(uuid, text),
  public.recently_authenticated(interval),
  public.assert_club_owner(uuid),
  public.enqueue_notification(uuid[], text, text, jsonb, uuid, uuid),
  public.claim_notifications(integer),
  public.finish_notifications(jsonb, text[]),
  public.other_team(public.team),
  public.seat_name(uuid, smallint),
  public.team_names(uuid, public.team),
  public.team_scorekeeper(uuid, public.team),
  public.lock_game(uuid),
  public.assert_live(public.games),
  public.actor_seat(public.games, boolean),
  public.ensure_scorekeepers(uuid),
  public.log_game_event(uuid, text, smallint, jsonb),
  public.game_ok(uuid),
  public.notify_game_started(uuid),
  public.notify_invite(uuid, smallint),
  public.go_live_if_ready(uuid),
  public.assert_inviting_host(public.games),
  public.warn_expiring_invites(),
  public.expire_invites(),
  public.active_round(uuid),
  public.assert_no_result_pending(public.games),
  public.lock_pending_round(uuid),
  public.propose_result_if_over(uuid),
  public.finish_game(uuid),
  public.do_undo(uuid, smallint)
from public, anon, authenticated;

grant execute on function
  public.claim_notifications(integer),
  public.finish_notifications(jsonb, text[]),
  public.warn_expiring_invites(),
  public.expire_invites()
to service_role;

revoke execute on function
  public.has_pin(),
  public.check_my_pin(text),
  public.set_pin(text),
  public.change_pin(text, text),
  public.reset_pin(text),
  public.register_device(text, text),
  public.unregister_device(text),
  public.set_device_state(text, text, uuid),
  public.create_club(text),
  public.join_club(text),
  public.rotate_invite_code(uuid),
  public.set_member_role(uuid, uuid, public.club_role),
  public.remove_member(uuid, uuid),
  public.transfer_ownership(uuid, uuid),
  public.create_game(uuid, jsonb, public.game_mode),
  public.create_ghost_game(uuid, jsonb),
  public.respond_invite(uuid, boolean, text),
  public.swap_seat(uuid, smallint, uuid),
  public.switch_to_ghost(uuid),
  public.cancel_game(uuid),
  public.add_cut(uuid, smallint),
  public.remove_cut(uuid),
  public.submit_round(uuid, integer, integer, smallint[], uuid),
  public.confirm_round(uuid, text),
  public.dispute_round(uuid),
  public.confirm_result(uuid, text),
  public.request_undo(uuid),
  public.respond_undo(uuid, boolean, text),
  public.reassign_scorekeeper(uuid, smallint),
  public.abandon_game(uuid, text),
  public.verify_ghost_seat(uuid, text)
from public, anon;
