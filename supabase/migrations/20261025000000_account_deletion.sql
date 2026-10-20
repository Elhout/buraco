-- Account deletion (App Store guideline 5.1.1(v): deletion must be possible from inside the app).
-- The delete-account Edge Function verifies the caller, runs anonymize_user (service role), then
-- deletes the auth user. Past games stay consistent for the other players: the person's seats
-- become "Former member", their name and PIN are gone, and stats simply stop counting them.

alter table public.games alter column host_id drop not null;
alter table public.games drop constraint games_host_id_fkey,
  add constraint games_host_id_fkey foreign key (host_id) references public.profiles (id) on delete set null;
alter table public.game_events drop constraint game_events_actor_id_fkey,
  add constraint game_events_actor_id_fkey foreign key (actor_id) references public.profiles (id) on delete set null;
alter table public.tournament_events drop constraint tournament_events_actor_id_fkey,
  add constraint tournament_events_actor_id_fkey foreign key (actor_id) references public.profiles (id) on delete set null;
alter table public.tournaments alter column organizer_id drop not null;
alter table public.tournaments drop constraint tournaments_organizer_id_fkey,
  add constraint tournaments_organizer_id_fkey foreign key (organizer_id) references public.profiles (id) on delete set null;

-- Finished games stay frozen, except that a deleted host may be cleared (on delete set null).
create or replace function public.enforce_game_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.config_snapshot is distinct from old.config_snapshot or new.club_id <> old.club_id then
    raise exception 'config_snapshot and club_id are immutable' using errcode = 'check_violation';
  end if;
  if old.status in ('finished', 'abandoned', 'expired') then
    if (to_jsonb(new) - 'verified' - 'host_id') is distinct from (to_jsonb(old) - 'verified' - 'host_id')
       or (old.verified and not new.verified)
       or (new.host_id is distinct from old.host_id and new.host_id is not null) then
      raise exception 'a % game is frozen', old.status using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.status = old.status then
    return new;
  end if;
  if not (
    (old.status::text, new.status::text) in (
      ('draft', 'inviting'), ('draft', 'abandoned'),
      ('inviting', 'live'), ('inviting', 'expired'), ('inviting', 'abandoned'),
      ('live', 'finished'), ('live', 'abandoned'))
    or (old.status = 'draft' and new.status = 'live' and new.mode = 'ghost')
  ) then
    raise exception 'illegal game transition % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  if new.status = 'live' then
    new.started_at := coalesce(new.started_at, now());
  elsif new.status in ('finished', 'abandoned', 'expired') then
    new.finished_at := coalesce(new.finished_at, now());
  end if;
  return new;
end $$;

create function public.anonymize_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  v_heir uuid;
begin
  -- Clubs I own: hand over to the longest-standing admin, else member; a club of one is deleted.
  for c in select id from public.clubs where owner_id = p_user_id loop
    select user_id into v_heir from public.club_members
    where club_id = c.id and user_id <> p_user_id
    order by (role = 'admin') desc, joined_at
    limit 1;
    if v_heir is null then
      delete from public.clubs where id = c.id;
    else
      update public.club_members set role = 'owner' where club_id = c.id and user_id = v_heir;
      update public.clubs set owner_id = v_heir where id = c.id;
    end if;
  end loop;

  -- Unfinished games I'm part of are abandoned rather than left waiting for me.
  update public.games g set status = 'abandoned'
  where g.status in ('draft', 'inviting', 'live')
    and exists (select 1 from public.game_seats s where s.game_id = g.id and s.user_id = p_user_id);

  update public.game_seats set user_id = null, guest_name = 'Former member', is_scorekeeper = false
  where user_id = p_user_id;
  update public.tournament_entries set user_id = null, guest_name = 'Former member'
  where user_id = p_user_id;

  delete from public.club_members where user_id = p_user_id;
  delete from public.devices where user_id = p_user_id;
  delete from public.pins where user_id = p_user_id;
  delete from public.notification_queue where user_id = p_user_id;
  update public.profiles set display_name = 'Former member', avatar_url = null where id = p_user_id;
end $$;

revoke execute on function public.anonymize_user(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_user(uuid) to service_role;
