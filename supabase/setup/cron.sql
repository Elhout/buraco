-- =====================================================================================================
-- Buraco: scheduled jobs and push kick-off. NOT a migration.
--
-- Run once per Supabase project in the SQL editor (Dashboard → SQL), after:
--   1. deploying the functions:      supabase functions deploy push-dispatch game-cron
--   2. setting the function secret:  supabase secrets set CRON_SECRET=<long random string>
--   3. replacing the two placeholders in step 1 below with the project URL and that same secret.
-- Re-running is safe: secrets are upserted, the job is re-scheduled by name, the trigger is replaced.
-- Never commit this file with real values filled in.
--
-- What it sets up:
--   * pg_cron calls the game-cron function every minute (invite warnings/expiry, tournament clock,
--     and a fallback drain of the push queue).
--   * A statement-level AFTER INSERT trigger on public.notification_queue calls push-dispatch
--     through pg_net, so pushes go out right after the transaction that queued them commits.
-- Both requests authenticate with `Authorization: Bearer <CRON_SECRET>`, read from Vault.
-- =====================================================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------- 1. Vault secrets (upsert)

do $$
declare
  v_url    constant text := 'https://<project-ref>.supabase.co';  -- no trailing slash
  v_secret constant text := '<CRON_SECRET>';                       -- same value as `supabase secrets set`
  v_id     uuid;
begin
  if v_url like '%<%' or v_secret like '%<%' then
    raise exception 'replace the placeholders in cron.sql step 1 before running it';
  end if;

  select id into v_id from vault.secrets where name = 'project_url';
  if v_id is null then
    perform vault.create_secret(v_url, 'project_url', 'Base URL for Edge Function calls from pg_net');
  else
    perform vault.update_secret(v_id, v_url);
  end if;

  select id into v_id from vault.secrets where name = 'cron_secret';
  if v_id is null then
    perform vault.create_secret(v_secret, 'cron_secret', 'Bearer secret for game-cron and push-dispatch');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
end $$;

-- ---------------------------------------------------------------- 2. Helper: POST to an Edge Function

-- Fire-and-forget: pg_net queues the request and sends it after commit. Returns null (and does
-- nothing) when the Vault secrets are missing, so a misconfigured project never blocks a game write.
create or replace function public.call_edge_function(p_name text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url                  := v_url || '/functions/v1/' || p_name,
    headers              := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end $$;

revoke execute on function public.call_edge_function(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. Every minute: game-cron

select cron.schedule('game-cron', '* * * * *', $$ select public.call_edge_function('game-cron') $$);

-- ---------------------------------------------------------------- 4. On enqueue: push-dispatch

-- Statement-level so a multi-row insert (e.g. game_started to a whole club) makes one call.
-- Any failure is downgraded to a warning: the push stays queued and game-cron sends it within a minute.
create or replace function public.kick_push_dispatch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.call_edge_function('push-dispatch');
  exception when others then
    raise warning 'kick_push_dispatch: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end $$;

revoke execute on function public.kick_push_dispatch() from public, anon, authenticated;

drop trigger if exists notification_queue_kick on public.notification_queue;
create trigger notification_queue_kick
  after insert on public.notification_queue
  for each statement execute function public.kick_push_dispatch();

-- ---------------------------------------------------------------- Checks
-- select jobid, jobname, schedule, active from cron.job where jobname = 'game-cron';
-- select * from cron.job_run_details order by start_time desc limit 10;
-- select id, status_code, error_msg, created from net._http_response order by created desc limit 10;
-- To stop: select cron.unschedule('game-cron'); drop trigger notification_queue_kick on public.notification_queue;
