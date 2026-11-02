-- A guest seat can be handed to a club member during the game (the guest leaves, or the member
-- arrives late). The game's creator, the owner or an admin does it. The member takes the seat as
-- it is: same team, the rounds already played stay. The usual one-table-at-a-time rule applies
-- (game_seats_player_free).

create function public.replace_guest(p_game_id uuid, p_seat integer, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
  s public.game_seats;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game not found' using errcode = 'no_data_found';
  end if;
  if g.host_id is distinct from (select auth.uid())
     and coalesce(public.club_role_of_caller(g.club_id)::text, 'none') not in ('owner', 'admin') then
    raise exception 'only the game creator or an admin can change players' using errcode = 'insufficient_privilege';
  end if;
  if g.status not in ('inviting', 'live') then
    raise exception 'players can be changed only during a current game' using errcode = 'invalid_parameter_value';
  end if;
  select * into s from public.game_seats where game_id = p_game_id and seat = p_seat for update;
  if not found or s.user_id is not null then
    raise exception 'that seat is not a guest' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.club_members m where m.club_id = g.club_id and m.user_id = p_user_id) then
    raise exception 'that player is not a member of this club' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.game_seats o where o.game_id = p_game_id and o.user_id = p_user_id) then
    raise exception 'that player is already in this game' using errcode = 'unique_violation';
  end if;

  update public.game_seats
  set user_id = p_user_id, guest_name = null, invite_status = 'confirmed', confirmed_at = now(), verified_at = null
  where game_id = p_game_id and seat = p_seat;

  perform public.log_game_event(p_game_id, 'guest_replaced', null, jsonb_build_object(
    'seat', p_seat, 'guest_name', s.guest_name, 'user_id', p_user_id));
end $$;

revoke execute on function public.replace_guest(uuid, integer, uuid) from public, anon;
grant execute on function public.replace_guest(uuid, integer, uuid) to authenticated;
