-- Player pickers update live when someone joins or leaves the club.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.club_members;
  end if;
end $$;
