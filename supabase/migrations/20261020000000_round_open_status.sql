-- A round is "open" while its deal is being played: exact-cut bonuses attach to it before scores exist.
-- Enum values must be committed before use, so this lives in its own migration.
alter type public.round_status add value if not exists 'open' before 'pending';
