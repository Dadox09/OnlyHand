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

- **RLS everywhere**: users can read their own raw rows and insert their own
  scores. Raw tables are not public; scores are immutable from the client.
- **Sanity checks**: score 0–100 000, known `game_id`s only, name ≤ 24 chars.
- **Rate limit**: max 1 score per 5 s per user (trigger).
- **`leaderboard` and `daily_leaderboard` views**: public best scores per player,
  with anonymous ID, tag and avatar; individual score history is not exposed.
- **`delete_my_account()`**: an anonymous player can remove their auth user,
  profile and scores. The profile screen calls it before clearing local data.

## Migrations for existing projects

If you deployed the schema **before Jelly Yeet** (or before the Asteroids
daily run / Fruit Slash / Beat Pulse), the `game_id` check constraint rejects the newer
ids. Re-running the whole `schema.sql` fixes it (the migration block drops
and recreates the constraint), or run just this in the SQL Editor:

```sql
alter table public.scores drop constraint if exists scores_game_id_check;
alter table public.scores add constraint scores_game_id_check
  check (game_id in ('pong', 'breakout', 'snake', 'slash', 'beat', 'jelly', 'asteroids', 'asteroids-daily'));
```

### Daily runs (`asteroids-daily`)

Asteroids' DAILY RUN mode (hangar toggle) submits scores as
`game_id = 'asteroids-daily'`, so daily attempts never touch the all-time
Asteroids board. The in-game **TODAY'S RUN** board queries the
`daily_leaderboard` view, which groups each player's best score since midnight
UTC before the client limits the result. Apply the full current `schema.sql`
before deploying the matching frontend.

## Data model

| Table | Contents |
|-------|----------|
| `profiles` | `id` (= auth uid), `name`, `avatar` |
| `scores` | one row per finished run: `user_id`, `game_id`, `score` |
| `leaderboard` (view) | best per player per game, joined with profile |
| `daily_leaderboard` (view) | today's UTC best per player and game |
