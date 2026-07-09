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
          to any server. Closing the tab stops the camera immediately.
        </p>

        <h2>What is stored locally</h2>
        <p>
          Your player tag, avatar, scores, badges and settings live in your browser's
          <code>localStorage</code>, on your device only. Clearing site data removes them.
        </p>

        <h2>Online leaderboard (optional)</h2>
        <p>
          When you play, your <strong>player tag and score</strong> may be submitted to the
          global leaderboard (hosted on Supabase) under an anonymous account. No email,
          no real name, no camera data — just the tag you picked and your score.
        </p>

        <h2>No tracking</h2>
        <p>
          OnlyHand sets no advertising cookies and runs no third-party trackers.
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
