import { icon } from "../core/icon.js";

let mounted = false;

export function mount(app) {
  mounted = true;
  app.innerHTML = `
    <nav>
      <a class="logo" href="#/hub">ONLY<span class="lit">HAND</span></a>
      <a href="#/hub">${icon("chevron-right", { size: 14 })} Back to games</a>
    </nav>
    <div class="page">
      <div class="page-header oh-fade-up">
        <h1>PRIVACY</h1>
        <p class="subtitle">What OnlyHand does (and doesn't do) with your data</p>
      </div>
      <div class="privacy-body oh-fade-up" style="animation-delay:0.05s">
        <h2>Your camera never leaves your device</h2>
        <p>
          OnlyHand uses your webcam to track your hand with
          <strong>MediaPipe, running entirely in your browser</strong>. Video frames are
          processed on your device and are <strong>never recorded, stored, or uploaded</strong>
          to any server. Camera access is optional: every game can be tried with mouse or touch
          instead. Closing the tab stops the camera immediately.
        </p>

        <h2>What is stored locally</h2>
        <p>
          Your player tag, avatar, scores, badges and settings live in your browser's
          <code>localStorage</code>, on your device only. Clearing site data removes them.
        </p>

        <h2>Creator clips</h2>
        <p>
          If you explicitly start a Creator Clip, OnlyHand combines the game canvas and
          your hand-camera into a vertical video for up to 30 seconds. The recording is
          generated locally, contains no microphone audio, and is not uploaded by OnlyHand.
          It leaves the browser only if you choose to save or share it.
        </p>

        <h2>Online leaderboard (optional)</h2>
        <p>
          When you play, your <strong>player tag and score</strong> may be submitted to the
          global leaderboard (hosted on Supabase) under an anonymous account. No email,
          no real name, no camera data — just the tag you picked and your score.
        </p>

        <h2>Anonymous analytics</h2>
        <p>
          OnlyHand does not enable advertising cookies by default. The production site uses
          Plausible for aggregate, cookieless analytics about camera setup, game starts and
          completed runs. Events contain no webcam frames, email address or real name, and
          the analytics script is not loaded when browser “Do Not Track” is enabled.
        </p>

        <h2>Advertising</h2>
        <p>
          Advertising is currently disabled in this build. If ads are enabled later, this
          notice and the consent controls will be updated before any advertising technology
          is loaded for visitors who require consent.
        </p>

        <h2>Contact</h2>
        <p>
          Questions? Reach out at <a href="mailto:rizzodavidege@gmail.com">rizzodavidege@gmail.com</a>.
        </p>
      </div>
    </div>
  `;
}

export function unmount() {
  if (!mounted) return;
  mounted = false;
}
