-- Run in the production SQL Editor after enabling Integrations > Cron.
-- Step 1: run this query alone. It only counts accounts; it deletes nothing.
select count(*) as accounts_to_delete
from auth.users u
where u.is_anonymous is true
  and greatest(
    u.created_at,
    (select p.updated_at from public.profiles p where p.id = u.id),
    (select max(s.created_at) from public.scores s where s.user_id = u.id)
  ) < now() - interval '12 months';

-- Step 2: run from here to the end after reviewing the count above.
-- This schedules future cleanup; running it does not delete accounts now.
-- Remove accounts 12 months after their last cloud profile or score write.
-- Foreign keys in schema.sql delete their profiles and scores too.
create or replace function public.purge_inactive_anonymous_users()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users u
  where u.is_anonymous is true
    and greatest(
      u.created_at,
      (select p.updated_at from public.profiles p where p.id = u.id),
      (select max(s.created_at) from public.scores s where s.user_id = u.id)
    ) < now() - interval '12 months';
$$;

revoke execute on function public.purge_inactive_anonymous_users() from public, anon, authenticated;

-- First day of each month at 03:00 UTC. Re-running updates the same job.
select cron.schedule(
  'onlyhand-anonymous-retention',
  '0 3 1 * *',
  'select public.purge_inactive_anonymous_users()'
);
