// Supabase backend: anonymous auth, profile sync, global leaderboard.
// Fully optional — without VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY in
// web/.env.local every call is a cheap no-op and the app stays local-only.
import { createClient } from "@supabase/supabase-js";
import { getProfile } from "./profile.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = url && anonKey ? createClient(url, anonKey) : null;

export function isOnline() {
  return supabase !== null;
}

let sessionPromise = null;

// Anonymous session, created once and reused (supabase-js persists it in
// localStorage, so the same browser keeps the same identity + scores).
async function ensureSession() {
  if (!supabase) return null;
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    return data.session;
  })().catch((err) => {
    console.warn("[backend] auth failed:", err.message);
    sessionPromise = null;
    return null;
  });
  return sessionPromise;
}

// Push the local profile (name + avatar) to the cloud.
export async function syncProfile() {
  const session = await ensureSession();
  if (!session) return false;
  const p = getProfile();
  const { error } = await supabase.from("profiles").upsert({
    id: session.user.id,
    name: p.name,
    avatar: p.avatar,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("[backend] profile sync failed:", error.message);
  return !error;
}

// Record a finished run. Ensures the profile row exists first (FK).
export async function submitScore(gameId, score) {
  const session = await ensureSession();
  if (!session || score <= 0) return false;
  await syncProfile();
  const { error } = await supabase.from("scores").insert({
    user_id: session.user.id,
    game_id: gameId,
    score,
  });
  if (error) console.warn("[backend] score submit failed:", error.message);
  return !error;
}

// Global top N for a game: [{ name, avatar, best, you }]
export async function fetchLeaderboard(gameId, limit = 10) {
  if (!supabase) return null;
  const session = await ensureSession();
  const { data, error } = await supabase
    .from("leaderboard")
    .select("user_id, name, avatar, best")
    .eq("game_id", gameId)
    .order("best", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[backend] leaderboard fetch failed:", error.message);
    return null;
  }
  return data.map((r) => ({
    name: r.name,
    avatar: r.avatar,
    score: r.best,
    you: session ? r.user_id === session.user.id : false,
  }));
}

// Your global rank in a game (1-based), or null.
export async function fetchMyRank(gameId) {
  const session = await ensureSession();
  if (!session) return null;
  const { data: mine } = await supabase
    .from("leaderboard")
    .select("best")
    .eq("game_id", gameId)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!mine) return null;
  const { count, error } = await supabase
    .from("leaderboard")
    .select("*", { count: "exact", head: true })
    .eq("game_id", gameId)
    .gt("best", mine.best);
  if (error) return null;
  return { rank: (count ?? 0) + 1, best: mine.best };
}
