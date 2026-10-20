-- Username + password accounts. There is no self sign-up: club owners and admins create accounts
-- and reset passwords through the manage-accounts Edge Function, which calls the service-role
-- functions below with the caller's id. A username is stored as the auth email
-- <username>@users.buraco.app (see packages/shared/src/accounts.ts).
--
-- A forgotten PIN still goes through reset_pin: re-entering the password is a fresh sign-in, so
-- recently_authenticated() accepts it the same way it accepted an OTP.

-- Who may create accounts in a club, or reset a member's password:
--   * only owners and admins of that club;
--   * a new account (p_target null) or yourself: always;
--   * someone else: they must be in the club; an admin may only manage plain members; and the
--     target may not be owner or admin of any club the caller doesn't own (no cross-club takeover).
create function public.can_manage_account(p_caller uuid, p_club_id uuid, p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with caller as (
    select role from public.club_members where club_id = p_club_id and user_id = p_caller and role in ('owner', 'admin')
  )
  select exists (select 1 from caller)
    and (
      p_target is null
      or p_target = p_caller
      or (
        exists (
          select 1 from public.club_members t
          where t.club_id = p_club_id and t.user_id = p_target
            and ((select role from caller) = 'owner' or t.role = 'member')
        )
        and not exists (
          select 1 from public.club_members m
          where m.user_id = p_target and m.role in ('owner', 'admin')
            and not exists (
              select 1 from public.club_members c
              where c.club_id = m.club_id and c.user_id = p_caller and c.role = 'owner'
            )
        )
      )
    )
$$;

create function public.assert_account_admin(p_caller uuid, p_club_id uuid, p_target uuid default null) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_caller is null or not public.can_manage_account(p_caller, p_club_id, p_target) then
    raise exception 'not allowed to manage this account' using errcode = 'insufficient_privilege';
  end if;
end $$;

create function public.add_account_to_club(p_caller uuid, p_club_id uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_account_admin(p_caller, p_club_id, null);
  insert into public.club_members (club_id, user_id, role) values (p_club_id, p_user, 'member')
  on conflict do nothing;
end $$;

-- The club's accounts for the owners/admins screen: usernames are only shown to them.
create function public.club_accounts(p_club_id uuid)
returns table (user_id uuid, display_name text, role public.club_role, username text, can_manage boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_club_admin(p_club_id) then
    raise exception 'only club owners and admins can manage accounts' using errcode = 'insufficient_privilege';
  end if;
  return query
    select m.user_id,
           p.display_name,
           m.role,
           case when lower(u.email) like '%@users.buraco.app' then split_part(lower(u.email), '@', 1) end,
           public.can_manage_account((select auth.uid()), p_club_id, m.user_id)
    from public.club_members m
    join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    where m.club_id = p_club_id
    order by p.display_name, m.user_id;
end $$;

revoke execute on function
  public.can_manage_account(uuid, uuid, uuid),
  public.assert_account_admin(uuid, uuid, uuid),
  public.add_account_to_club(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.can_manage_account(uuid, uuid, uuid),
  public.assert_account_admin(uuid, uuid, uuid),
  public.add_account_to_club(uuid, uuid, uuid)
to service_role;

revoke execute on function public.club_accounts(uuid) from public, anon;
grant execute on function public.club_accounts(uuid) to authenticated;
