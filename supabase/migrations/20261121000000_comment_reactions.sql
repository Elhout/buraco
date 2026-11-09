-- Likes and emoji reactions on game comments: one of a fixed set (👍 ❤️ 😂 🔥 👏 😮) per member and
-- emoji, toggled with toggle_comment_reaction (a second tap takes it back). Readable by club
-- members like the comment itself; game_id is kept on the row so a game screen can follow its
-- reactions live. No pushes: a reaction is a glance, not news.

create table public.comment_reactions (
  comment_id uuid not null references public.game_comments (id) on delete cascade,
  game_id    uuid not null references public.games (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null check (emoji in ('👍', '❤️', '😂', '🔥', '👏', '😮')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
create index comment_reactions_game_idx on public.comment_reactions (game_id);
alter table public.comment_reactions enable row level security;
revoke all on public.comment_reactions from anon, authenticated;
grant select on public.comment_reactions to authenticated;
create policy comment_reactions_select on public.comment_reactions for select to authenticated
  using (public.can_read_game(game_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.comment_reactions;
  end if;
end $$;

-- True when the reaction is now on, false when this tap took it back.
create function public.toggle_comment_reaction(p_comment_id uuid, p_emoji text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_game uuid;
begin
  select game_id into v_game from public.game_comments where id = p_comment_id;
  if v_uid is null or v_game is null or not public.can_read_game(v_game) then
    raise exception 'not a member of this club' using errcode = 'insufficient_privilege';
  end if;
  if p_emoji is null or p_emoji not in ('👍', '❤️', '😂', '🔥', '👏', '😮') then
    raise exception 'not an available reaction' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.comment_reactions where comment_id = p_comment_id and user_id = v_uid and emoji = p_emoji;
  if found then
    return false;
  end if;
  insert into public.comment_reactions (comment_id, game_id, user_id, emoji) values (p_comment_id, v_game, v_uid, p_emoji);
  return true;
end $$;

revoke execute on function public.toggle_comment_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_comment_reaction(uuid, text) to authenticated;
