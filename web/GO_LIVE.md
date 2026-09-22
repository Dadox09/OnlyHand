# OnlyHand go-live checklist

The public Vercel URL is `https://only-hand-two.vercel.app/` and currently responds over HTTPS.
Complete the device checks below before a broad launch. The global leaderboard is optional;
do not advertise it as live unless production Supabase is configured. Do not enable site ads
before the consent step below is complete.

## 1. Deploy

- Build command: `npm run build`
- Output directory: `dist`
- Project/root directory: `web`
- The current Vercel URL uses HTTPS, which provides the secure context needed for camera access.
  A custom domain is optional for beta; use one before domain verification or site-ad monetization.
- Keep the canonical, Open Graph, Twitter and sitemap URLs on `https://only-hand-two.vercel.app/`.
- Supabase is optional. To enable global boards and cross-device score sync, set
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel and apply `../supabase/schema.sql`
  to that production Supabase project. Without it, scores stay local.
- The production build reads `VITE_PLAUSIBLE_DOMAIN=only-hand-two.vercel.app` from
  `.env.production` (Vercel environment variables can override it). Add this domain to
  Plausible and create custom-event goals for `Pointer Mode Selected`, `Camera Enabled`,
  `Game Started`, `Game Finished`, `Challenge Shared`, and `Challenge Opened`; custom events
  do not appear in Plausible reports until their goals exist.

## 2. Verify the acquisition funnel

Test on Chrome/Edge desktop, Android Chrome and iPhone Safari:

1. Landing page explains the camera before the permission prompt.
2. The animated gameplay demo loads promptly on mobile data; the primary CTA and privacy promise
   remain visible in landscape, with no horizontal overflow.
3. Camera permission leads to the first game without a reload.
4. “Explore games first” reaches the hub without opening a camera permission prompt.
5. Opening a game without an active camera shows the controller choice before any permission prompt.
6. Mouse/touch mode can finish a run: move steers, hold/click pinches, and Space triggers fist actions.
7. Pointer results are labelled practice and never enter global or daily hand-control boards.
8. Returning from pointer mode keeps the hub camera off until “Enable hand control” is selected.
9. A completed run shows a shareable challenge.
10. Opening that challenge in a private window shows the target and can start with mouse/touch.
11. The 9:16 result card downloads and contains only the gameplay canvas, never webcam video.
12. Creator Clip asks for explicit opt-in, records no microphone, stops at 30 seconds and saves a playable video.
13. “Add to Home Screen”/Install launches in landscape standalone mode.

Track: visit → controller selected → camera enabled/pointer mode → game started → game finished →
challenge shared → challenge opened.
TikTok bio link: `https://only-hand-two.vercel.app/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=beta_launch&utm_content=profile_bio`

## 3. Monetization gate

Ads are deliberately not injected yet. Before enabling AdSense/Ad Manager:

- own and verify the production domain;
- publish final Privacy, Cookie and Terms pages with the legal business identity;
- configure a Google-certified consent-management platform for EEA/UK/Swiss traffic;
- choose placements that never cover gameplay, controls, permission prompts or navigation;
- start with one hub placement and one post-run placement, then measure retention and RPM;
- never reward, encourage or accidentally cause ad clicks.

Portal revenue (CrazyGames/Poki) should use the portal SDK and its gameplay/ad-break rules instead
of mixing the portal build with the site's own ad tags.

## 4. Weekly growth loop

- Publish three 10–20 second vertical clips per week.
- Hook in the first 3 seconds: hand in frame plus immediate game reaction.
- Use the generated 9:16 score card as the ending and challenge viewers to beat the score.
- Reuse each clip on TikTok, Reels and Shorts; vary the opening caption.
- Review funnel events weekly and prioritize the largest drop, especially camera permission.
