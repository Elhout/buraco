-- One group of players, no visible clubs. The schema keeps clubs (every game, stat and tournament
-- is scoped by club_id), but the app no longer shows them: signing in calls ensure_membership,
-- which puts the player in the only group, creating it for the very first account.

create function public.ensure_membership() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_club uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  -- Already in: nothing to do.
  select club_id into v_club from public.club_members where user_id = v_uid order by joined_at limit 1;
  if v_club is not null then
    return v_club;
  end if;
  -- Serialize first sign-ins so two people can't both create "the" group.
  perform pg_advisory_xact_lock(hashtext('public.ensure_membership'));
  select id into v_club from public.clubs order by created_at, id limit 1;
  if v_club is null then
    -- add_club_owner makes the creator the owner.
    insert into public.clubs (name, owner_id) values ('Buraco', v_uid) returning id into v_club;
  else
    insert into public.club_members (club_id, user_id, role) values (v_club, v_uid, 'member') on conflict do nothing;
  end if;
  return v_club;
end $$;

revoke execute on function public.ensure_membership() from public, anon;
grant execute on function public.ensure_membership() to authenticated;
