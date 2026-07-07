# Supabase setup — global profiles + leaderboard

The web app works fully offline without this. With it, every finished run is
submitted to a global per-game leaderboard and the Game Over screen shows the
real TOP HANDS.

## One-time setup (~5 minutes)

1. **Create a project** at [supabase.com](https://supabase.com) (free tier is plenty).

2. **Enable anonymous sign-ins**
   Dashboard → **Authentication → Sign In / Providers → Anonymous** → enable.
   Players get a persistent anonymous identity per browser — no signup wall.

3. **Create the schema**
   Dashboard → **SQL Editor → New query** → paste the whole of
   [`schema.sql`](schema.sql) → **Run**.

4. **Wire the frontend**

   ```bash
   cd web
   cp .env.example .env.local
   ```

   Fill in the two values from **Project Settings → API**:
   - `VITE_SUPABASE_URL` — Project URL
   - `VITE_SUPABASE_ANON_KEY` — `anon` `public` key (safe to ship to browsers;
     row-level security does the real gatekeeping)

5. Restart `npm run dev`. Done — scores now sync.

## What the schema enforces

- **RLS everywhere**: users can only insert their own rows; scores are
  immutable from the client (no update/delete policies).
- **Sanity checks**: score 0–100 000, known `game_id`s only, name ≤ 24 chars.
- **Rate limit**: max 1 score per 5 s per user (trigger).
- **`leaderboard` view**: best score per player per game — what the app queries.

## Migrations for existing projects

If you deployed the schema **before the Asteroids daily run** (or before
Fruit Slash), the `game_id` check constraint rejects the newer ids. Re-running
the whole `schema.sql` fixes it (the daily-run block drops and recreates the
constraint), or run just this in the SQL Editor:

```sql
alter table public.scores drop constraint if exists scores_game_id_check;
alter table public.scores add constraint scores_game_id_check
  check (game_id in ('pong', 'breakout', 'snake', 'slash', 'asteroids', 'asteroids-daily'));
```

### Daily runs (`asteroids-daily`)

Asteroids' DAILY RUN mode (hangar toggle) submits scores as
`game_id = 'asteroids-daily'`, so daily attempts never touch the all-time
Asteroids board. The in-game **TODAY'S RUN** board queries `scores` filtered
to `created_at >= today (UTC)` and keeps each player's best. No extra tables
or views needed. Without the migration above, daily submits fail silently
(console warning) and the Game Over overlay falls back to the house board.

## Data model

| Table | Contents |
|-------|----------|
| `profiles` | `id` (= auth uid), `name`, `avatar` |
| `scores` | one row per finished run: `user_id`, `game_id`, `score` |
| `leaderboard` (view) | best per player per game, joined with profile |
