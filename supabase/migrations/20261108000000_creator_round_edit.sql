-- Fixing a round during a live game. Besides the club owner, the game's creator (host) may now
-- correct a confirmed round while the game is live; finished games stay owner-only. A creator's
-- edit marks the round as edited for everyone (rounds.edited_at). The owner's edits are silent:
-- no mark on the round, and the audit event carries silent = true so the app leaves it out.

alter table public.rounds add column edited_at timestamptz;

create or replace function public.edit_round_scores(p_round_id uuid, p_team_a integer, p_team_b integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r       public.rounds;
  g       public.games;
  t       record;
  v_owner boolean;
begin
  select * into r from public.rounds where id = p_round_id for update;
  if not found then
    raise exception 'round not found' using errcode = 'no_data_found';
  end if;
  select * into g from public.games where id = r.game_id for update;
  v_owner := exists (
    select 1 from public.club_members
    where club_id = g.club_id and user_id = (select auth.uid()) and role = 'owner'
  );
  if not v_owner then
    if g.status <> 'live' then
      raise exception 'only the owner can do this' using errcode = 'insufficient_privilege';
    end if;
    if g.host_id is distinct from (select auth.uid()) then
      raise exception 'only the owner or the game creator can edit rounds' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if g.tournament_match_id is not null then
    raise exception 'tournament games cannot be edited' using errcode = 'invalid_parameter_value';
  end if;
  if g.status not in ('live', 'finished') then
    raise exception 'only live or finished games can be edited' using errcode = 'invalid_parameter_value';
  end if;
  if r.status <> 'confirmed' then
    raise exception 'only confirmed rounds can be edited' using errcode = 'invalid_parameter_value';
  end if;
  if p_team_a is null or p_team_b is null then
    raise exception 'both team scores are required' using errcode = 'invalid_parameter_value';
  end if;
  if abs(p_team_a) > 99999 or abs(p_team_b) > 99999 then
    raise exception 'round score out of range' using errcode = 'invalid_parameter_value';
  end if;
  if not (g.config_snapshot ->> 'allow_negative')::boolean and (p_team_a < 0 or p_team_b < 0) then
    raise exception 'negative round scores are not allowed in this club' using errcode = 'invalid_parameter_value';
  end if;

  update public.rounds
  set team_a_score = p_team_a, team_b_score = p_team_b,
      edited_at = case when v_owner then edited_at else now() end
  where id = r.id;

  if g.status = 'finished' then
    select * into t from public.v_game_totals where game_id = g.id;
    if t.team_a_total = t.team_b_total then
      raise exception 'the edit would make the game a tie' using errcode = 'invalid_parameter_value';
    end if;
    perform set_config('buraco.owner_edit', 'on', true);
    update public.games
    set winner_team = (case when t.team_a_total > t.team_b_total then 'A' else 'B' end)::public.team
    where id = g.id;
    perform set_config('buraco.owner_edit', '', true);
  end if;

  perform public.log_game_event(g.id, 'round_edited', null, jsonb_build_object(
    'round_id', r.id, 'round_no', r.round_no,
    'old_a', r.team_a_score, 'old_b', r.team_b_score,
    'new_a', p_team_a, 'new_b', p_team_b,
    'silent', v_owner));
end $$;

revoke execute on function public.edit_round_scores(uuid, integer, integer) from public, anon;
grant execute on function public.edit_round_scores(uuid, integer, integer) to authenticated;
