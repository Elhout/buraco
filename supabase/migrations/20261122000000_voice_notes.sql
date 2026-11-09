-- Voice notes in game comments. The app uploads the recording to the private storage bucket
-- voice-notes at <game id>/<random>.<ext> (club members only, enforced on storage.objects), then
-- posts the comment with audio_path and its length. A comment needs text or a voice note.

alter table public.game_comments
  add column audio_path text,
  add column audio_seconds integer check (audio_seconds between 1 and 300);
alter table public.game_comments drop constraint game_comments_body_check;
alter table public.game_comments add constraint game_comments_body_check
  check (char_length(body) <= 500 and (char_length(body) >= 1 or audio_path is not null));

-- Storage paths are "<game uuid>/<file>": readable when the game is.
create function public.voice_note_readable(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_name ~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9_-]+\.(m4a|mp4|aac|webm|ogg|wav)$'
      then public.can_read_game(split_part(p_name, '/', 1)::uuid)
    else false
  end
$$;
revoke execute on function public.voice_note_readable(text) from public, anon;
grant execute on function public.voice_note_readable(text) to authenticated;

-- The bucket and its rules (only where Supabase Storage exists; the test database has none).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('voice-notes', 'voice-notes', false, 5242880,
            array['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'video/mp4', 'video/webm'])
    on conflict (id) do nothing;
    execute $p$create policy voice_notes_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'voice-notes' and public.voice_note_readable(name))$p$;
    execute $p$create policy voice_notes_select on storage.objects for select to authenticated
      using (bucket_id = 'voice-notes' and public.voice_note_readable(name))$p$;
  end if;
end $$;

drop function public.add_game_comment(uuid, text, uuid[]);

create function public.add_game_comment(
  p_game_id       uuid,
  p_body          text,
  p_mentions      uuid[] default '{}',
  p_audio_path    text default null,
  p_audio_seconds integer default null
) returns uuid
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
  if p_audio_path is not null and (
       p_audio_path !~ ('^' || p_game_id::text || '/[A-Za-z0-9_-]+\.(m4a|mp4|aac|webm|ogg|wav)$')
       or p_audio_seconds is null or p_audio_seconds not between 1 and 300) then
    raise exception 'that voice note does not belong to this game' using errcode = 'invalid_parameter_value';
  end if;
  if v_body = '' and p_audio_path is null then
    raise exception 'comment is empty' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_body) > 500 then
    raise exception 'comment is too long' using errcode = 'invalid_parameter_value';
  end if;
  select club_id into v_club from public.games where id = p_game_id;
  select coalesce(array_agg(distinct m.user_id), '{}') into v_mentions
  from public.club_members m
  where m.club_id = v_club and m.user_id = any (coalesce(p_mentions, '{}')) and m.user_id <> v_uid;

  insert into public.game_comments (game_id, user_id, body, mentions, audio_path, audio_seconds)
  values (p_game_id, v_uid, v_body, v_mentions, p_audio_path, case when p_audio_path is null then null else p_audio_seconds end)
  returning id into v_id;

  v_payload := jsonb_build_object(
    'sender', (select p.display_name from public.profiles p where p.id = v_uid),
    'text', nullif(left(v_body, 140), ''),
    'voice', p_audio_path is not null);
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

revoke execute on function public.add_game_comment(uuid, text, uuid[], text, integer) from public, anon;
grant execute on function public.add_game_comment(uuid, text, uuid[], text, integer) to authenticated;
