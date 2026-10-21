-- The owner can remove any game from the history (and stats), or fix a confirmed round's scores.
-- Tournament games are excluded: their results feed the standings.
--
-- Finished games stay frozen for everything else. edit_round_scores needs to change a finished
-- game's winner_team, so enforce_game_transition now honours a transaction-local flag
-- (buraco.owner_edit) that only edit_round_scores sets, and only for that one column.

create or replace function public.enforce_game_transition() returns trigger
language plpgsql set search_path = '' as $$
declare
  -- Set (transaction-local) only inside edit_round_scores; clients cannot run set_config.
  v_owner_edit boolean := coalesce(current_setting('buraco.owner_edit', true), '') = 'on';
  v_free_keys text[] := array['verified', 'host_id'] || case when v_owner_edit then array['winner_team'] else array[]::text[] end;
begin
  if new.config_snapshot is distinct from old.config_snapshot or new.club_id <> old.club_id then
    raise exception 'config_snapshot and club_id are immutable' using errcode = 'check_violation';
  end if;
  if old.status in ('finished', 'abandoned', 'expired') then
    if (to_jsonb(new) - v_free_keys) is distinct from (to_jsonb(old) - v_free_keys)
       or (old.verified and not new.verified)
       or (new.host_id is distinct from old.host_id and new.host_id is not null) then
      raise exception 'a % game is frozen', old.status using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.status = old.status then
    return new;
  end if;
  if not (
    (old.status::text, new.status::text) in (
      ('draft', 'inviting'), ('draft', 'abandoned'),
      ('inviting', 'live'), ('inviting', 'expired'), ('inviting', 'abandoned'),
      ('live', 'finished'), ('live', 'abandoned'))
    or (old.status = 'draft' and new.status = 'live' and new.mode = 'ghost')
  ) then
    raise exception 'illegal game transition % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  if new.status = 'live' then
    new.started_at := coalesce(new.started_at, now());
  elsif new.status in ('finished', 'abandoned', 'expired') then
    new.finished_at := coalesce(new.finished_at, now());
  end if;
  return new;
end $$;

create function public.assert_game_owner(p_club_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = (select auth.uid()) and role = 'owner'
  ) then
    raise exception 'only the owner can do this' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Removes a game completely (seats, rounds, cut lines, audit events and queued pushes cascade;
-- devices.active_game_id is set null). Works for any status; a live game frees its players.
create function public.delete_game(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game not found' using errcode = 'no_data_found';
  end if;
  perform public.assert_game_owner(g.club_id);
  if g.tournament_match_id is not null then
    raise exception 'tournament games cannot be deleted' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.games where id = p_game_id;
end $$;

-- Fixes a confirmed round's scores. Same score rules as submit_round. A finished game gets its
-- winner recomputed from the new totals (cut lines included); a tie is refused. A live game just
-- continues (reaching the target through an edit does not finish it). Logged as 'round_edited'.
create function public.edit_round_scores(p_round_id uuid, p_team_a integer, p_team_b integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rounds;
  g public.games;
  t record;
begin
  select * into r from public.rounds where id = p_round_id for update;
  if not found then
    raise exception 'round not found' using errcode = 'no_data_found';
  end if;
  select * into g from public.games where id = r.game_id for update;
  perform public.assert_game_owner(g.club_id);
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

  update public.rounds set team_a_score = p_team_a, team_b_score = p_team_b where id = r.id;

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
    'new_a', p_team_a, 'new_b', p_team_b));
end $$;

revoke execute on function public.assert_game_owner(uuid) from public, anon, authenticated;
revoke execute on function public.delete_game(uuid) from public, anon;
revoke execute on function public.edit_round_scores(uuid, integer, integer) from public, anon;
grant execute on function public.delete_game(uuid) to authenticated;
grant execute on function public.edit_round_scores(uuid, integer, integer) to authenticated;
