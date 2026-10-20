-- The tournament log screen updates live.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tournament_events;
  end if;
end $$;
