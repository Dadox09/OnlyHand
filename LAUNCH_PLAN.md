# OnlyHand — Launch & Monetization Plan

Goal: real users + revenue, target ramp to ~20€/day (~600€/month).

## Reality check (numbers first)

- Self-hosted ads (AdSense): RPM ~1–3€ per 1000 pageviews → 20€/day needs **~200k–600k pageviews/month**. Not a day-1 path.
- Game portals (CrazyGames, Poki, itch.io) pay **revenue share** and bring their own traffic — realistic first euros.
- The unique asset: **hand-tracking gameplay is extremely clippable**. Short-form video (TikTok/Shorts/Reels) is the growth engine, not SEO (hash-router SPA has near-zero SEO anyway).

## Phase 0 — Ship it (this week) ✅ = done in repo

- ✅ SEO/OG/Twitter meta + `og.png` share card (update `og:url`/`og:image` domain after deploy)
- ✅ Privacy page (`#/privacy`) — required for AdSense, and webcam apps must state "video never leaves the device"
- [ ] Deploy `web/` to **Cloudflare Pages** (free, unlimited bandwidth — matters: wasm+models ≈ 55 MB/first-load-heavy)
  - Build command `npm run build`, output `dist`, root dir `web`
  - Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (names: see `web/.env.example`) in Pages env vars
- [ ] Buy domain (~10€/yr) — e.g. `onlyhand.app` / `.games` / `.io`. Portals & socials look more legit with a domain.
- [ ] Test on 2–3 other machines/phones (camera permission flow is your biggest funnel drop — measure it)

## Phase 1 — Distribution (weeks 1–3): go where players already are

Priority order:

1. **itch.io** (day 1, zero gatekeeping): upload as HTML5 game, enable "support this game" donations. Good for feedback + first players.
2. **CrazyGames** dev portal (developer.crazygames.com): submit → if accepted, integrate their SDK (ads between games) → **rev share per play**. This is the most realistic path to daily euros. ⚠️ Verify their policy on camera-permission games first — webcam requirement is unusual; pitch it as the differentiator.
3. **Poki** (developers.poki.com): same model, more selective, higher traffic. Apply after CrazyGames traction.
4. **Show HN** (news.ycombinator.com): "Show HN: I built a web arcade you play with your hand (MediaPipe, no install)". Dev crowd loves this — one good thread = thousands of visits + feedback.
5. **Reddit**: r/WebGames, r/SideProject, r/InternetIsBeautiful (huge if it lands), r/javascript (technical write-up angle). One sub per week, native tone, no spam.
6. **Product Hunt**: launch once polished + domain live.

## Phase 2 — Content engine (ongoing): short-form video

The pitch writes itself: *split screen — your hand on webcam vs the game reacting*.

- 3 clips/week: 15–30 s, hook in first 2 s ("I control Asteroids with my bare hand"), URL in bio/comment.
- Post same clip to TikTok + YouTube Shorts + IG Reels (zero extra cost).
- Beat Pulse (rhythm + hand) and Asteroids (fist = smart bomb) are the most visual clips.
- Track which game converts → double down.

## Phase 3 — Monetization layers (after traffic exists)

| Layer | When | Expected |
|---|---|---|
| CrazyGames/Poki rev share | on acceptance | first €/day, scales with plays |
| itch.io donations / Ko-fi–BuyMeACoffee link in hub footer | day 1 | pocket money, near-zero effort |
| AdSense on own domain | >20k views/month | needs privacy page ✅ + cookie consent (EU: add CMP banner before enabling) |
| Sponsor/branded game slot ("your logo as Pong paddle") | >50k views/month | 100–500€ one-offs |
| Premium (cosmetic ships/themes, no paywall on gameplay) | when retention proven | Stripe/LemonSqueezy, later |

## Metrics to watch (add lightweight analytics at deploy)

- Use **Cloudflare Web Analytics** (free, no cookies → no consent banner needed) or Plausible.
- Funnel: visit → camera permission granted → first game started → second session.
- Camera-permission grant rate is THE metric. If <40%, improve the onboarding pitch before spending on marketing.

## Honest timeline

- Month 1: 0–5€/day (itch + first portal + first viral attempts)
- Month 2–3: 5–20€/day IF a portal accepts + one clip performs
- Failure mode to avoid: polishing games for months with zero distribution. Ship, post, measure.
