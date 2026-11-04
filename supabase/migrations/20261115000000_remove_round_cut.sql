-- Taking a +100 exact cut off a round that already counts (remove_cut only works on the deal
-- being played). Same rules as edit_round_scores: the game's creator during a live game (the
-- round is marked "Edited by"), the owner and admins silently; finished games are the owner's,
-- and their winner follows the new totals (a tie is refused).

create function public.remove_round_cut(p_line_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l        public.round_lines;
  r        public.rounds;
  g        public.games;
  t        record;
  v_role   text;
  v_silent boolean;
begin
  select * into l from public.round_lines where id = p_line_id;
  if not found or l.type <> 'cut_bonus' then
    raise exception 'cut not found' using errcode = 'no_data_found';
  end if;
  select * into r from public.rounds where id = l.round_id for update;
  select * into g from public.games where id = r.game_id for update;
  v_role := coalesce(public.club_role_of_caller(g.club_id)::text, 'none');
  v_silent := v_role in ('owner', 'admin');
  if v_role <> 'owner' then
    if g.status <> 'live' then
      raise exception 'only the owner can do this' using errcode = 'insufficient_privilege';
    end if;
    if v_role <> 'admin' and g.host_id is distinct from (select auth.uid()) then
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

  delete from public.round_lines where id = p_line_id;
  update public.rounds
  set edited_at = case when v_silent then edited_at else now() end,
      edited_by = case when v_silent then edited_by else (select auth.uid()) end
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
    'new_a', r.team_a_score, 'new_b', r.team_b_score,
    'cut_removed', true, 'seat', l.seat, 'points', l.points,
    'silent', v_silent));
end $$;

revoke execute on function public.remove_round_cut(uuid) from public, anon;
grant execute on function public.remove_round_cut(uuid) to authenticated;
