-- Comments on each game, in place of the club chat: any club member can comment while the game
-- is played or later from the history. The game's players and everyone who commented before get
-- a push (game_comment), except on a phone that has that game open (claim_notifications' usual
-- active-game rule). The old chat_messages table stays as it is; the app no longer shows it.

create table public.game_comments (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index game_comments_game_idx on public.game_comments (game_id, created_at);
alter table public.game_comments enable row level security;
revoke all on public.game_comments from anon, authenticated;
grant select on public.game_comments to authenticated;
create policy game_comments_select on public.game_comments for select to authenticated
  using (public.can_read_game(game_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.game_comments;
  end if;
end $$;

create function public.add_game_comment(p_game_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_id   uuid;
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

  insert into public.game_comments (game_id, user_id, body) values (p_game_id, v_uid, v_body) returning id into v_id;

  perform public.enqueue_notification(
    array(
      select s.user_id from public.game_seats s where s.game_id = p_game_id and s.user_id is not null and s.user_id <> v_uid
      union
      select c.user_id from public.game_comments c where c.game_id = p_game_id and c.user_id <> v_uid),
    'game_comment', '/game/' || p_game_id,
    jsonb_build_object('sender', (select p.display_name from public.profiles p where p.id = v_uid), 'text', left(v_body, 140)),
    p_game_id);
  return v_id;
end $$;

revoke execute on function public.add_game_comment(uuid, text) from public, anon;
grant execute on function public.add_game_comment(uuid, text) to authenticated;
