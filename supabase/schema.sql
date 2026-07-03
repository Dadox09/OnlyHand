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

create policy "profiles are readable by everyone"
  on public.profiles for select using (true);

create policy "users insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "users update own profile"
  on public.profiles for update using (auth.uid() = id);

-- ── Scores ──────────────────────────────────────────────────────
-- One row per finished run. Best-per-player is computed by the view below.
create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  game_id    text not null check (game_id in ('pong', 'breakout', 'snake', 'asteroids')),
  score      integer not null check (score >= 0 and score <= 100000),
  created_at timestamptz not null default now()
);

create index if not exists scores_game_best on public.scores (game_id, score desc);
create index if not exists scores_user on public.scores (user_id, game_id);

alter table public.scores enable row level security;

create policy "scores are readable by everyone"
  on public.scores for select using (true);

create policy "users insert own scores"
  on public.scores for insert with check (auth.uid() = user_id);

-- No update/delete policies: submitted scores are immutable from the client.

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
