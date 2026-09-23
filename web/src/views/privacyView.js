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
      <a href="#/hub">${icon("chevron-right", { size: 14 })} Back to games</a>
    </nav>
    <div class="page">
      <div class="page-header oh-fade-up">
        <h1>PRIVACY</h1>
        <p class="subtitle">How OnlyHand handles your data · updated 23 September 2026</p>
      </div>
      <div class="privacy-body oh-fade-up" style="animation-delay:0.05s">
        <h2>Controller</h2>
        <p>
          Davide Rizzo, Via Mario Tosa 45.
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
          If the online leaderboard is enabled, saving your tag creates an anonymous Supabase
          account and sends the tag and avatar before your first game. Camera-mode runs also send
          the game and score. Supabase stores the submission time, an anonymous account ID, profile
          creation and update times, and every submitted score. No email or video is sent.
          This supports the game features you request and the operator's legitimate interest
          in running a casual leaderboard (Article 6(1)(b) and 6(1)(f) GDPR).
        </p>
        <p>
          Rankings are casual: client-submitted scores are not independently verified. The
          leaderboard publicly shows player tags, avatars, anonymous IDs and best scores.
          The current Supabase project is in Ireland. Anonymous accounts, profiles and scores
          are kept until you request deletion. Clearing browser storage alone does not remove
          cloud data and may remove your ability to identify the anonymous account.
        </p>
        <p>
          Use “Delete my profile and scores” in your profile to delete both the local copy and,
          when available, the anonymous account and its scores. If deletion fails or you need
          help, email the controller before clearing browser data. You may also request access,
          correction or deletion by email.
        </p>

        <h2>Hosting and analytics</h2>
        <p>
          Vercel hosts <code>only-hand-two.vercel.app</code> and processes technical requests
          needed to serve and secure the site. Its request-log retention depends on the account
          settings and is being verified. Plausible receives page visits and custom events for
          camera setup, controller choice, game starts and finishes, clips, sharing and installs.
          Event properties can include game, mode, input method, score, duration and error type;
          they do not include your tag or webcam frames. Challenge names are excluded from
          custom event properties. Plausible also uses request IP and browser information to
          calculate aggregate statistics without storing raw IP addresses or using cookies or
          local storage. The analytics script is skipped when Do Not Track is enabled.
          These measurements serve the operator's legitimate interest in understanding and
          improving the site (Article 6(1)(f) GDPR).
        </p>

        <h2>Recipients and transfers</h2>
        <p>
          Vercel (hosting), Supabase (anonymous accounts and scores) and Plausible (analytics)
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
