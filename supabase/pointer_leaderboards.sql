-- Run once in the existing Supabase project before deploying the matching web build.
-- Keeps every existing hand score; the leaderboard views already group by game_id.
alter table public.scores drop constraint if exists scores_game_id_check;
alter table public.scores add constraint scores_game_id_check
  check (game_id in (
    'pong', 'breakout', 'snake', 'slash', 'beat', 'jelly', 'asteroids', 'asteroids-daily',
    'pong-pointer', 'breakout-pointer', 'snake-pointer', 'slash-pointer',
    'beat-pointer', 'jelly-pointer', 'asteroids-pointer', 'asteroids-daily-pointer'
  ));
