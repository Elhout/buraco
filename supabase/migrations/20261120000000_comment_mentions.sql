-- @mentions in game comments. The app sends the ids of the members it inserted as "@Name";
-- they are kept if they belong to the club (yourself left out) and stored on the comment so it
-- can highlight them. A mentioned member gets "Sara mentioned you" (comment_mention), in place of
-- the usual comment push, even when they are not at that table.

alter table public.game_comments add column mentions uuid[] not null default '{}';

drop function public.add_game_comment(uuid, text);

create function public.add_game_comment(p_game_id uuid, p_body text, p_mentions uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := (select auth.uid());
  v_body     text := btrim(coalesce(p_body, ''));
  v_club     uuid;
  v_mentions uuid[];
  v_id       uuid;
  v_payload  jsonb;
begin
  if v_uid is null or not public.can_read_game(p_game_id) then
    raise exception 'not a member of this club' using errcode = 'insufficient_privilege';
  end if;
  if v_body = '' then
    raise exception 'comment is empty' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_body) > 500 then
    raise exception 'comment is too long' using errcode = 'invalid_parameter_value';
  end if;
  select club_id into v_club from public.games where id = p_game_id;
  select coalesce(array_agg(distinct m.user_id), '{}') into v_mentions
  from public.club_members m
  where m.club_id = v_club and m.user_id = any (coalesce(p_mentions, '{}')) and m.user_id <> v_uid;

  insert into public.game_comments (game_id, user_id, body, mentions)
  values (p_game_id, v_uid, v_body, v_mentions) returning id into v_id;

  v_payload := jsonb_build_object('sender', (select p.display_name from public.profiles p where p.id = v_uid), 'text', left(v_body, 140));
  perform public.enqueue_notification(v_mentions, 'comment_mention', '/game/' || p_game_id, v_payload, p_game_id);
  perform public.enqueue_notification(
    array(
      select u from (
        select s.user_id as u from public.game_seats s where s.game_id = p_game_id and s.user_id is not null
        union
        select c.user_id from public.game_comments c where c.game_id = p_game_id
      ) x
      where u <> v_uid and not (u = any (v_mentions))),
    'game_comment', '/game/' || p_game_id, v_payload, p_game_id);
  return v_id;
end $$;

revoke execute on function public.add_game_comment(uuid, text, uuid[]) from public, anon;
grant execute on function public.add_game_comment(uuid, text, uuid[]) to authenticated;
