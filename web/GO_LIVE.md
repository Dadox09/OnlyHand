# OnlyHand go-live checklist

The codebase is ready for a public beta, but production credentials and legal/account setup
must be supplied by the owner. Do not enable ads before the consent step below is complete.

## 1. Deploy

- Build command: `npm run build`
- Output directory: `dist`
- Project/root directory: `web`
- Use a custom HTTPS domain; camera access requires a secure context outside localhost.
- Update the canonical, Open Graph URL and image URL in `index.html` if the domain is not
  `onlyhand.app`.
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host environment, then apply
  `../supabase/schema.sql` to the production Supabase project.
- Optionally set `VITE_PLAUSIBLE_DOMAIN` for cookieless funnel events.

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
