-- Marks a finished onboarding (name, language, avatar chosen) so the app stops showing it.
alter table public.profiles add column onboarded_at timestamptz;
grant update (onboarded_at) on public.profiles to authenticated;
