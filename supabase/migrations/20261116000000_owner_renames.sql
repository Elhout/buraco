-- Names and usernames are the club owner's to change. Players can no longer rename themselves
-- (the display_name column grant is withdrawn; language and notification choices stay theirs),
-- admins can't either. The owner renames a member with set_member_name, and changes a username
-- through the manage-accounts Edge Function, which checks is_club_owner_for first.

revoke update (display_name) on public.profiles from authenticated;

create function public.set_member_name(p_club_id uuid, p_user_id uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if not exists (
    select 1 from public.club_members where club_id = p_club_id and user_id = (select auth.uid()) and role = 'owner'
  ) then
    raise exception 'only the club owner can change names' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.club_members where club_id = p_club_id and user_id = p_user_id) then
    raise exception 'that player is not a member of this club' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'a name has 1 to 40 characters' using errcode = 'invalid_parameter_value';
  end if;
  update public.profiles set display_name = v_name where id = p_user_id;
end $$;

revoke execute on function public.set_member_name(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_name(uuid, uuid, text) to authenticated;

-- For manage-accounts (service role): may p_caller, as owner of the club, manage p_target there?
create function public.is_club_owner_for(p_caller uuid, p_club_id uuid, p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.club_members where club_id = p_club_id and user_id = p_caller and role = 'owner')
     and exists (select 1 from public.club_members where club_id = p_club_id and user_id = p_target)
$$;

revoke execute on function public.is_club_owner_for(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_club_owner_for(uuid, uuid, uuid) to service_role;
