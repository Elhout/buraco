-- Push dispatch hardening: return the attempt count so the dispatcher can re-queue transient
-- failures (it gives up after 3), and reclaim rows stuck in 'sending' when a dispatcher crashed.
create or replace function public.claim_notifications(p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rows jsonb;
begin
  update public.notification_queue
  set status = 'queued'
  where status = 'sending' and created_at < now() - interval '5 minutes' and attempts < 3;

  with batch as (
    select q.id from public.notification_queue q
    where q.status = 'queued'
    order by q.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.notification_queue q
    set status = 'sending', attempts = q.attempts + 1
    from batch where q.id = batch.id
    returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'event', c.event, 'payload', c.payload, 'deep_link', c.deep_link,
           'attempts', c.attempts,
           'lang', p.lang,
           'tokens', coalesce((
             select jsonb_agg(d.expo_push_token) from public.devices d
             where d.user_id = c.user_id
               and (c.game_id is null or d.active_game_id is distinct from c.game_id or d.app_state <> 'active')
           ), '[]'::jsonb))), '[]'::jsonb)
    into v_rows
  from claimed c join public.profiles p on p.id = c.user_id;
  return v_rows;
end $$;

revoke execute on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
