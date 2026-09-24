-- OnlyHand production audit: read-only checks for the Supabase SQL Editor.
-- These queries return configuration and job status, not player rows.
-- Do not paste project secrets or raw personal data into an audit report.

-- Confirm the three expected jobs and their schedules.
select jobid, jobname, schedule, active, command
from cron.job
where jobname in (
  'onlyhand-anonymous-retention',
  'onlyhand-pong-lobbies',
  'onlyhand-orb-rush-lobbies'
)
order by jobname;

-- Most recent executions. The monthly retention job will have no history
-- until its first scheduled run on the first day of a month at 03:00 UTC.
select j.jobname, r.status, r.start_time, r.end_time, r.return_message
from cron.job j
left join lateral (
  select status, start_time, end_time, return_message
  from cron.job_run_details
  where jobid = j.jobid
  order by start_time desc
  limit 3
) r on true
where j.jobname in (
  'onlyhand-anonymous-retention',
  'onlyhand-pong-lobbies',
  'onlyhand-orb-rush-lobbies'
)
order by j.jobname, r.start_time desc nulls last;

-- RLS enabled on the four raw tables and on Realtime messages.
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where (n.nspname = 'public' and c.relname in (
  'profiles', 'scores', 'pong_lobbies', 'orb_rush_lobbies'
)) or (n.nspname = 'realtime' and c.relname = 'messages')
order by n.nspname, c.relname;

-- Inspect *all* policies; permissive policies combine with OR, so an extra
-- broad policy could undermine the intended topic and membership checks.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in (
  'profiles', 'scores', 'pong_lobbies', 'orb_rush_lobbies'
)) or (schemaname = 'realtime' and tablename = 'messages')
order by schemaname, tablename, policyname;
