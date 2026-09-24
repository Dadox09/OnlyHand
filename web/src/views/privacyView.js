import { icon } from "../core/icon.js";
import { stopCamera } from "../core/camera.js";
import { stopHandInput } from "../input/handInput.js";

let mounted = false;

export function mount(app) {
  stopHandInput();
  stopCamera();
  mounted = true;
  app.innerHTML = `
    <nav>
      <a class="logo" href="#/hub">ONLY<span class="lit">HAND</span></a>
      <a href="#/hub" aria-label="Back to games">${icon("chevron-right", { size: 14 })}<span class="nav-label">Back to games</span></a>
    </nav>
    <div class="page">
      <div class="page-header oh-fade-up">
        <h1>PRIVACY</h1>
        <p class="subtitle">How OnlyHand handles your data · updated 24 September 2026</p>
      </div>
      <div class="privacy-body oh-fade-up" style="animation-delay:0.05s">
        <h2>Controller</h2>
        <p>
          Davide Rizzo, Via Mario Tosa 45, 16151 Genova, Italia.
          Contact: <a href="mailto:rizzodavidege@gmail.com">rizzodavidege@gmail.com</a>.
        </p>

        <h2>Camera and creator clips</h2>
        <p>
          Hand tracking uses MediaPipe in your browser. OnlyHand does not upload camera frames.
          You can use mouse or touch instead and turn off the camera during a session.
          If you explicitly start Creator Clip, your browser records the game and camera locally
          for up to 30 seconds, without microphone audio. Only you can save or share the result.
          Processing is needed to provide the controls and recording you request (Article 6(1)(b) GDPR).
        </p>

        <h2>Local profile and online leaderboard</h2>
        <p>
          Your tag, avatar, scores, badges and settings are saved in this browser's
          <code>localStorage</code> until you delete your profile or clear site data.
          When Supabase is active, its access and refresh tokens are also saved in this browser's
          <code>localStorage</code> to keep your anonymous cloud account available on later visits.
          If the online leaderboard is enabled, saving your tag creates an anonymous Supabase
          account and sends the tag and avatar before your first game. Eligible solo camera-mode runs also send
          the game and score. Supabase stores the submission time, an anonymous account ID, profile
          creation and update times, and every submitted score. No email or video is sent.
          Authentication and API records may also include connection details such as your IP
          address and browser information.
          This supports the game features you request and the operator's legitimate interest
          in running a casual leaderboard (Article 6(1)(b) and 6(1)(f) GDPR).
        </p>
        <p>
          Rankings are casual: client-submitted scores are not independently verified. The
          leaderboard publicly shows player tags, avatars, anonymous IDs and best scores.
          The current Supabase project is in Ireland. Anonymous accounts, profiles and scores
          are kept until you request deletion; a monthly job is scheduled to remove accounts with no
          cloud profile or score update for 12 months. Clearing browser storage alone does not remove
          cloud data and may remove your ability to identify the anonymous account.
        </p>
        <p>
          Use “Delete my profile and scores” in your profile to delete both the local copy and,
          when available, the anonymous account and its scores. If deletion fails or you need
          help, email the controller before clearing browser data. You may also request access,
          correction or deletion by email.
        </p>

        <h2>Online matches: Pong and Orb Rush</h2>
        <p>
          If you create or join an online match, a Supabase anonymous account is created if you
          do not have one already. Supabase stores the match invitation code, the host's
          anonymous account ID and, after joining, the guest's anonymous account ID, along with
          creation and expiry times. A lobby expires after two hours; a scheduled cleanup job
          removes expired rooms when it runs. Supabase relays live controls and match state to the other player:
          paddle position and pinch state in Pong, or player position, activity and pinch state
          in Orb Rush. The host's browser computes the match. Camera images and microphone audio
          are not sent. This processing provides the online match you request (Article 6(1)(b)
          GDPR). Online match scores are not added to the leaderboard.
        </p>

        <h2>Hosting</h2>
        <p>
          Vercel hosts <code>only-hand-two.vercel.app</code> and processes technical requests
          needed to serve and secure the site. On the current Hobby plan, edge request data is
          available in Vercel Observability for 12 hours. That dashboard window does not establish
          when Vercel deletes all underlying records. OnlyHand does not load client-side analytics
          or advertising trackers.
        </p>

        <h2>Recipients and transfers</h2>
        <p>
          Vercel (hosting) and Supabase (anonymous accounts, scores and online matches)
          process the data described above. Supabase's primary project data is currently in
          Ireland; Vercel may process requests in other countries. Provider terms and applicable
          transfer safeguards govern processing outside the EEA. Contact the controller for
          details of the current provider settings.
        </p>

        <h2>Your rights</h2>
        <p>
          You may ask for access, correction, deletion, restriction, portability where applicable,
          or object to processing based on legitimate interest. Write to
          <a href="mailto:rizzodavidege@gmail.com">rizzodavidege@gmail.com</a>.
          You may also <a href="https://www.garanteprivacy.it/i-miei-diritti">complain to the
          Italian Data Protection Authority (Garante)</a>. If an anonymous session is lost,
          identifying its cloud records may no longer be possible without information you retained.
        </p>

        <h2>Advertising</h2>
        <p>
          Advertising is disabled. Advertising technology will require a revised notice and
          any necessary consent controls before it is enabled.
        </p>
      </div>
    </div>
  `;
}

export function unmount() {
  if (!mounted) return;
  mounted = false;
}
