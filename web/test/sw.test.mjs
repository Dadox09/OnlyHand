import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

test("the worker caches a response after the browser reads its body", async () => {
  const listeners = {};
  const stored = [];
  let release;
  const cache = { put: async (key, response) => stored.push([key, await response.text()]) };
  const caches = {
    open: () => new Promise((resolve) => { release = () => resolve(cache); }),
    match: async () => null,
  };
  runInNewContext(source, {
    self: { registration: { scope: "https://onlyhand.test/" }, addEventListener: (name, fn) => { listeners[name] = fn; } },
    location: { origin: "https://onlyhand.test" },
    caches,
    fetch: async () => new Response("fresh"),
    URL,
  });

  for (const mode of ["navigate", "cors"]) {
    const pending = [];
    let reply;
    listeners.fetch({
      request: { method: "GET", mode, url: "https://onlyhand.test/example.js" },
      respondWith: (promise) => { reply = promise; },
      waitUntil: (promise) => { pending.push(promise); },
    });
    const response = await reply;
    assert.equal(await response.text(), "fresh");
    release();
    await Promise.all(pending);
  }

  assert.deepEqual(stored.map(([, body]) => body), ["fresh", "fresh"]);
});
