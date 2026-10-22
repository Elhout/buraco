-- An undo by the club owner or an admin removes the round completely; anyone else's undo keeps
-- it in the list as "undone" (struck through) so the table can see what happened. The game's
-- event log records the undo either way.

create function public.drop_round_undone_by_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'voided' and old.status is distinct from 'voided' and exists (
    select 1
    from public.games g
    join public.club_members m on m.club_id = g.club_id
    where g.id = new.game_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  ) then
    delete from public.rounds where id = new.id; -- round_lines go with it (on delete cascade)
  end if;
  return null;
end $$;

create trigger rounds_admin_undo_removes
  after update of status on public.rounds
  for each row execute function public.drop_round_undone_by_admin();

revoke execute on function public.drop_round_undone_by_admin() from public, anon, authenticated;
