-- A player can only sit at one table at a time: seating someone who is already in a game that is
-- inviting or live (casual or tournament) is refused. Finished, abandoned and expired games don't
-- count, so a forgotten game is freed by abandoning it.

create function public.assert_player_free() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null and exists (
    select 1
    from public.game_seats s
    join public.games g on g.id = s.game_id
    where s.user_id = new.user_id
      and s.game_id <> new.game_id
      and g.status in ('inviting', 'live')
  ) then
    raise exception 'player is already playing another game' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger game_seats_player_free
  before insert or update of user_id on public.game_seats
  for each row execute function public.assert_player_free();

revoke execute on function public.assert_player_free() from public, anon, authenticated;
