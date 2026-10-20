-- "Start now" games (mode 'ghost': no invites, the scorekeeper enters every round) count in stats
-- as soon as they finish when the club trusts its scorekeepers, which is the default for a single
-- private club. The choice is frozen into the game's config_snapshot like the scoring rules, so
-- changing it later never rewrites history. Clubs that turn it off keep the old behaviour:
-- players confirm with their PIN afterwards.

alter table public.clubs add column trust_ghost_games boolean not null default true;
grant update (trust_ghost_games) on public.clubs to authenticated;

create or replace function public.snapshot_game_config() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'draft' then
    raise exception 'games must be created as draft' using errcode = 'check_violation';
  end if;
  select jsonb_build_object(
           'target_score', coalesce(t.target_score, c.target_score),
           'cut_bonus', c.cut_bonus,
           'allow_negative', c.allow_negative,
           'trust_ghost', c.trust_ghost_games)
    into new.config_snapshot
  from public.clubs c
  left join public.tournament_matches m on m.id = new.tournament_match_id
  left join public.tournament_rounds r on r.id = m.tournament_round_id
  left join public.tournaments t on t.id = r.tournament_id
  where c.id = new.club_id;
  return new;
end $$;

-- confirm_result finishes a ghost game unverified; a trusted one is verified in the same update.
-- The two-real-members rule in v_player_games still applies.
create function public.verify_trusted_ghost() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'finished' and old.status is distinct from 'finished' and new.mode = 'ghost'
     and coalesce((new.config_snapshot ->> 'trust_ghost')::boolean, false) then
    new.verified := true;
  end if;
  return new;
end $$;

create trigger games_verify_trusted_ghost
  before update of status on public.games
  for each row execute function public.verify_trusted_ghost();

revoke execute on function public.verify_trusted_ghost() from public, anon, authenticated;

-- No "please verify" push for a game that already counts.
create function public.skip_verified_ghost_prompt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event = 'ghost_verify' and exists (select 1 from public.games g where g.id = new.game_id and g.verified) then
    return null;
  end if;
  return new;
end $$;

create trigger notification_queue_skip_verified_ghost
  before insert on public.notification_queue
  for each row execute function public.skip_verified_ghost_prompt();

revoke execute on function public.skip_verified_ghost_prompt() from public, anon, authenticated;
