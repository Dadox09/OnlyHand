const MAX_SCORE = 999999999;

const cleanScore = (value) => Math.min(MAX_SCORE, Math.max(0, Math.floor(Number(value) || 0)));

const decode = (value, fallback = "Player") => {
  try {
    return decodeURIComponent(value || "").trim().slice(0, 24) || fallback;
  } catch {
    return fallback;
  }
};

export function readChallenge(params, game) {
  if (!params?.challenge || !game || params.id !== game.id) return null;
  const score = cleanScore(params.score);
  if (score <= 0) return null;
  return { score, challenger: decode(params.name) };
}

export function challengeUrl({ gameId, score, name }) {
  const url = new URL(location.href);
  url.hash = `/challenge/${encodeURIComponent(gameId)}/${cleanScore(score)}/${encodeURIComponent((name || "Player").slice(0, 24))}`;
  return url.toString();
}

export function challengeCopy({ game, score, input = "camera" }) {
  const controller = input === "pointer" ? "with mouse/touch" : "using only my hand";
  return `I scored ${cleanScore(score)} in ${game.name} ${controller}. Can you beat me?`;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function fitText(ctx, text, maxWidth, startSize, weight = 900) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px Orbitron, Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 4;
  } while (size > 30);
  return size;
}

export async function createChallengeCard({ game, score, profile, sourceCanvas, input = "camera" }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, 1080, 1920);
  bg.addColorStop(0, "#07120d");
  bg.addColorStop(0.55, "#080a10");
  bg.addColorStop(1, "#130723");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1920);

  // Neon atmosphere — kept deliberately graphic so the card is readable in a feed.
  ctx.globalAlpha = 0.28;
  for (const [x, y, r, color] of [
    [90, 210, 330, "#4ade80"],
    [1040, 720, 420, "#a855f7"],
    [250, 1790, 420, "#22d3ee"],
  ]) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 62px Orbitron, Arial, sans-serif";
  ctx.fillText("ONLY", 465, 125);
  ctx.fillStyle = "#4ade80";
  ctx.fillText("HAND", 655, 125);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 28px Arial, sans-serif";
  ctx.fillText(input === "pointer" ? "POINTER PRACTICE RUN" : "NO CONTROLLER. JUST YOUR HAND.", 540, 175);

  ctx.fillStyle = "#ffffff";
  fitText(ctx, `${game.icon} ${game.name.toUpperCase()}`, 900, 62);
  ctx.fillText(`${game.icon} ${game.name.toUpperCase()}`, 540, 285);

  // The last gameplay frame makes every shared card personal without exposing webcam video.
  roundRect(ctx, 90, 350, 900, 563, 34);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#020407";
  ctx.fillRect(90, 350, 900, 563);
  if (sourceCanvas?.width && sourceCanvas?.height) {
    ctx.drawImage(sourceCanvas, 90, 350, 900, 563);
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(74,222,128,.65)";
  ctx.lineWidth = 4;
  roundRect(ctx, 90, 350, 900, 563, 34);
  ctx.stroke();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 32px Arial, sans-serif";
  ctx.fillText(`${profile.avatar || "🎮"} ${profile.name || "Player"} SCORED`, 540, 1040);

  ctx.fillStyle = "#4ade80";
  ctx.shadowColor = "rgba(74,222,128,.7)";
  ctx.shadowBlur = 34;
  fitText(ctx, String(cleanScore(score)), 900, 230);
  ctx.fillText(String(cleanScore(score)), 540, 1280);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 70px Orbitron, Arial, sans-serif";
  ctx.fillText("CAN YOU BEAT ME?", 540, 1435);

  roundRect(ctx, 175, 1510, 730, 120, 60);
  ctx.fillStyle = "#4ade80";
  ctx.fill();
  ctx.fillStyle = "#041008";
  ctx.font = "900 38px Orbitron, Arial, sans-serif";
  ctx.fillText("PLAY THE CHALLENGE", 540, 1585);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "700 34px Arial, sans-serif";
  ctx.fillText(location.host || "onlyhand.app", 540, 1735);
  ctx.fillStyle = "#64748b";
  ctx.font = "600 25px Arial, sans-serif";
  ctx.fillText("Camera stays on your device · Free to play", 540, 1790);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create share card")), "image/png");
  });
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export async function shareChallenge({ game, score, profile, sourceCanvas, cardBlob, input = "camera" }) {
  const url = challengeUrl({ gameId: game.id, score, name: profile.name });
  const text = challengeCopy({ game, score, input });
  const blob = cardBlob || await createChallengeCard({ game, score, profile, sourceCanvas, input });
  const file = new File([blob], `onlyhand-${game.id}-${cleanScore(score)}.png`, { type: "image/png" });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: "OnlyHand challenge", text, url, files: [file] });
      return { status: "shared", url };
    } catch (error) {
      if (error?.name === "AbortError") return { status: "cancelled", url };
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: "OnlyHand challenge", text, url });
      return { status: "shared", url };
    } catch (error) {
      if (error?.name === "AbortError") return { status: "cancelled", url };
    }
  }
  await copyText(`${text} ${url}`);
  return { status: "copied", url };
}

export async function downloadChallengeCard({ game, score, profile, sourceCanvas, cardBlob, input = "camera" }) {
  const blob = cardBlob || await createChallengeCard({ game, score, profile, sourceCanvas, input });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `onlyhand-${game.id}-${cleanScore(score)}-story.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
