-- Undo an "end game" by mistake. The owner and admins can:
--   restore_game:      bring an abandoned game back to live, rounds and all, so it carries on.
--   admin_finish_game: end a live game now with the leading team as the winner (counts in stats),
--                      without anyone reaching the target and without PINs.
-- Tournament games are left out: their results feed the standings.
--
-- Abandoned games are frozen, so enforce_game_transition honours a transaction-local flag
-- (buraco.restore) that only restore_game sets, for abandoned -> live alone.

-- Same as 20261104000000_owner_game_admin, plus the restore flag.
create or replace function public.enforce_game_transition() returns trigger
language plpgsql set search_path = '' as $$
declare
  -- Set (transaction-local) only inside edit_round_scores; clients cannot run set_config.
  v_owner_edit boolean := coalesce(current_setting('buraco.owner_edit', true), '') = 'on';
  -- Set (transaction-local) only inside restore_game.
  v_restore boolean := coalesce(current_setting('buraco.restore', true), '') = 'on';
  v_free_keys text[] := array['verified', 'host_id'] || case when v_owner_edit then array['winner_team'] else array[]::text[] end;
begin
  if new.config_snapshot is distinct from old.config_snapshot or new.club_id <> old.club_id then
    raise exception 'config_snapshot and club_id are immutable' using errcode = 'check_violation';
  end if;
  if v_restore and old.status = 'abandoned' and new.status = 'live' then
    new.finished_at := null;
    return new;
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

create function public.assert_game_admin(g public.games) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.club_role_of_caller(g.club_id)::text, 'none') not in ('owner', 'admin') then
    raise exception 'only the owner or an admin can do this' using errcode = 'insufficient_privilege';
  end if;
  if g.tournament_match_id is not null then
    raise exception 'tournament games cannot be changed here' using errcode = 'invalid_parameter_value';
  end if;
end $$;

create function public.restore_game(p_game_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g public.games;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game not found' using errcode = 'no_data_found';
  end if;
  perform public.assert_game_admin(g);
  if g.status <> 'abandoned' or g.started_at is null then
    raise exception 'only an abandoned game that was played can be restored' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from public.game_seats s
    join public.game_seats o on o.user_id = s.user_id and o.game_id <> s.game_id
    join public.games og on og.id = o.game_id
    where s.game_id = p_game_id and og.status in ('inviting', 'live')
  ) then
    raise exception 'a player is already playing another game' using errcode = 'check_violation';
  end if;
  perform set_config('buraco.restore', 'on', true);
  update public.games set status = 'live' where id = p_game_id;
  perform set_config('buraco.restore', 'off', true);
  perform public.log_game_event(p_game_id, 'restored', null, '{}'::jsonb);
  return public.game_ok(p_game_id);
end $$;

create function public.admin_finish_game(p_game_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g        public.games;
  t        public.v_game_totals;
  v_winner public.team;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game not found' using errcode = 'no_data_found';
  end if;
  perform public.assert_game_admin(g);
  if g.status <> 'live' then
    raise exception 'only a live game can be finished' using errcode = 'invalid_parameter_value';
  end if;
  select * into t from public.v_game_totals where game_id = p_game_id;
  if t.team_a_total = t.team_b_total then
    raise exception 'the teams are level: there is no winner yet' using errcode = 'invalid_parameter_value';
  end if;
  v_winner := case when t.team_a_total > t.team_b_total then 'A' else 'B' end;
  update public.games
  set proposed_winner = v_winner, result_proposed_at = coalesce(result_proposed_at, now())
  where id = p_game_id;
  perform public.log_game_event(p_game_id, 'result_proposed', null,
    jsonb_build_object('winner', v_winner, 'a', t.team_a_total, 'b', t.team_b_total, 'by_admin', true));
  perform public.finish_game(p_game_id);
  return public.game_ok(p_game_id);
end $$;

revoke execute on function public.assert_game_admin(public.games) from public, anon, authenticated;
revoke execute on function public.restore_game(uuid) from public, anon;
revoke execute on function public.admin_finish_game(uuid) from public, anon;
grant execute on function public.restore_game(uuid) to authenticated;
grant execute on function public.admin_finish_game(uuid) to authenticated;
