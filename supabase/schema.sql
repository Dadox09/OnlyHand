-- OnlyHand · Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Requires anonymous sign-ins enabled: Dashboard → Authentication → Providers → Anonymous.

-- ── Profiles ────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null default 'Player' check (char_length(name) between 1 and 24),
  avatar     text not null default '🎮' check (char_length(avatar) <= 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- create policy has no "if not exists" — drop first so re-runs don't error
drop policy if exists "profiles are readable by everyone" on public.profiles;
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
  on public.profiles for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update using (auth.uid() = id);

-- ── Scores ──────────────────────────────────────────────────────
-- One row per finished run. Best-per-player is computed by the view below.
create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  game_id    text not null check (game_id in ('pong', 'breakout', 'snake', 'slash', 'beat', 'jelly', 'asteroids', 'asteroids-daily', 'pong-pointer', 'breakout-pointer', 'snake-pointer', 'slash-pointer', 'beat-pointer', 'jelly-pointer', 'asteroids-pointer', 'asteroids-daily-pointer')),
  score      integer not null check (score >= 0 and score <= 100000),
  created_at timestamptz not null default now()
);

create index if not exists scores_game_best on public.scores (game_id, score desc);
create index if not exists scores_user on public.scores (user_id, game_id);

alter table public.scores enable row level security;

drop policy if exists "scores are readable by everyone" on public.scores;
drop policy if exists "users read own scores" on public.scores;
create policy "users read own scores"
  on public.scores for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "users insert own scores" on public.scores;
create policy "users insert own scores"
  on public.scores for insert with check (auth.uid() = user_id);

-- No update/delete policies: submitted scores are immutable from the client.
-- Visitors can read only the aggregate leaderboard views below, not raw rows.
revoke all on public.profiles, public.scores from public, anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.scores to authenticated;

-- ── Basic anti-spam: max 1 score per 5 seconds per user ────────
create or replace function public.enforce_score_rate()
returns trigger
language plpgsql
security definer
as $$
begin
  if exists (
    select 1 from public.scores
    where user_id = new.user_id
      and created_at > now() - interval '5 seconds'
  ) then
    raise exception 'rate limit: wait a few seconds between scores';
  end if;
  return new;
end;
$$;

drop trigger if exists scores_rate_limit on public.scores;
create trigger scores_rate_limit
  before insert on public.scores
  for each row execute function public.enforce_score_rate();

-- ── Game-id migrations ──────────────────────────────────────────
-- 'asteroids-daily' rows power the in-game TODAY board (seeded daily run,
-- filtered client-side by created_at >= today UTC); 'beat' is Beat Pulse;
-- 'jelly' is Jelly Yeet.
-- The block below migrates databases created before these game ids
-- existed — safe to re-run.
alter table public.scores drop constraint if exists scores_game_id_check;
alter table public.scores add constraint scores_game_id_check
  check (game_id in ('pong', 'breakout', 'snake', 'slash', 'beat', 'jelly', 'asteroids', 'asteroids-daily', 'pong-pointer', 'breakout-pointer', 'snake-pointer', 'slash-pointer', 'beat-pointer', 'jelly-pointer', 'asteroids-pointer', 'asteroids-daily-pointer'));

-- ── Leaderboard view: best score per player per game ───────────
create or replace view public.leaderboard as
select
  s.game_id,
  s.user_id,
  p.name,
  p.avatar,
  max(s.score) as best
from public.scores s
join public.profiles p on p.id = s.user_id
group by s.game_id, s.user_id, p.name, p.avatar;

-- Today's UTC best per player is aggregated before the client applies LIMIT.
create or replace view public.daily_leaderboard as
select
  s.game_id,
  s.user_id,
  p.name,
  p.avatar,
  max(s.score) as best
from public.scores s
join public.profiles p on p.id = s.user_id
where s.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
group by s.game_id, s.user_id, p.name, p.avatar;

-- These views intentionally expose only tag, avatar, anonymous ID and best score.
-- The owner evaluates the aggregates; raw tables remain owner-only under RLS.
grant select on public.leaderboard, public.daily_leaderboard to anon, authenticated;

-- An authenticated anonymous player can erase their auth user. Cascading FKs
-- remove the profile and scores. The client clears its local copy only on success.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users
  where id = (select auth.uid()) and is_anonymous is true;
  if not found then
    raise exception 'No anonymous account to delete';
  end if;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
