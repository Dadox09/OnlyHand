import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const clients = Array.from({ length: 3 }, () => createClient(
  process.env.PONG_TEST_URL,
  process.env.PONG_TEST_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
));
const channels = [];
const subscribed = (channel) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Realtime subscription timed out")), 12000);
  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      clearTimeout(timer);
      if (status === "SUBSCRIBED") resolve();
      else reject(error ?? new Error(status));
    }
  });
});

try {
  const sessions = await Promise.all(clients.map(async (client) => {
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    return data.session;
  }));
  const { data: room, error: createError } = await clients[0].rpc("create_pong_lobby");
  if (createError) throw createError;
  assert.match(room.code, /^[A-F0-9]{10}$/);
  const { data: joined, error: joinError } = await clients[1].rpc("join_pong_lobby", { invite_code: room.code });
  if (joinError) throw joinError;
  assert.equal(joined.guest_id, sessions[1].user.id);
  const { error: fullError } = await clients[2].rpc("join_pong_lobby", { invite_code: room.code });
  assert.ok(fullError, "third player must be rejected");
  await Promise.all(clients.slice(0, 2).map((client) => client.realtime.setAuth()));
  const received = new Promise((resolve) => {
    const guest = clients[1].channel(`pong:${room.code}`, { config: { private: true } });
    guest.on("broadcast", { event: "smoke" }, ({ payload }) => resolve(payload));
    channels.push([clients[1], guest]);
  });
  const host = clients[0].channel(`pong:${room.code}`, { config: { private: true } });
  channels.push([clients[0], host]);
  await Promise.all(channels.map(([, channel]) => subscribed(channel)));
  await host.send({ type: "broadcast", event: "smoke", payload: { ok: true } });
  assert.deepEqual(await Promise.race([
    received,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Broadcast timed out")), 5000)),
  ]), { ok: true });
  await clients[2].realtime.setAuth();
  const intruder = clients[2].channel(`pong:${room.code}`, { config: { private: true } });
  channels.push([clients[2], intruder]);
  await assert.rejects(subscribed(intruder), "third player must not subscribe");
  console.log("Pong lobby and private Realtime smoke test passed");
} finally {
  await Promise.allSettled(channels.map(([client, channel]) => client.removeChannel(channel)));
  await Promise.allSettled(clients.map((client) => client.rpc("delete_my_account")));
}
