-- Club admins (and the owner) can stop any current game: end it at once (no PINs or team
-- approvals; it shows as abandoned in the history), or delete it outright. Finished games stay
-- the owner's alone: deleting one still needs the owner.

create function public.club_role_of_caller(p_club_id uuid) returns public.club_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.club_members m where m.club_id = p_club_id and m.user_id = (select auth.uid())
$$;
revoke execute on function public.club_role_of_caller(uuid) from public, anon, authenticated;

create function public.end_game(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game not found' using errcode = 'no_data_found';
  end if;
  if coalesce(public.club_role_of_caller(g.club_id)::text, 'none') not in ('owner', 'admin') then
    raise exception 'only the owner or an admin can end a game' using errcode = 'insufficient_privilege';
  end if;
  if g.status not in ('draft', 'inviting', 'live') then
    raise exception 'only a current game can be ended' using errcode = 'invalid_parameter_value';
  end if;
  update public.games set status = 'abandoned' where id = p_game_id;
  perform public.log_game_event(p_game_id, 'abandoned', null, jsonb_build_object('by_admin', true));
end $$;

revoke execute on function public.end_game(uuid) from public, anon;
grant execute on function public.end_game(uuid) to authenticated;

-- Removes a game completely (seats, rounds, cut lines, audit events and queued pushes cascade;
-- devices.active_game_id is set null). The owner: any game. An admin: current games only.
create or replace function public.delete_game(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g      public.games;
  v_role text;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game not found' using errcode = 'no_data_found';
  end if;
  v_role := coalesce(public.club_role_of_caller(g.club_id)::text, 'none');
  if v_role <> 'owner' then
    if g.status not in ('draft', 'inviting', 'live') then
      raise exception 'only the owner can do this' using errcode = 'insufficient_privilege';
    end if;
    if v_role <> 'admin' then
      raise exception 'only the owner or an admin can delete a current game' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if g.tournament_match_id is not null then
    raise exception 'tournament games cannot be deleted' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.games where id = p_game_id;
end $$;

revoke execute on function public.delete_game(uuid) from public, anon;
grant execute on function public.delete_game(uuid) to authenticated;
