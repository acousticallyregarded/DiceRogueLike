import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { act, createInitialState } from "../dicebound/src/engine";
import { db, pool, walletChallenges, walletSaves, walletSessions } from "@workspace/db";
import { inArray } from "drizzle-orm";

// Ephemeral, unfunded test wallets. Keys and signatures are never logged.
const first = privateKeyToAccount(generatePrivateKey());
const second = privateKeyToAccount(generatePrivateKey());
const base = "http://localhost:8080";
type Session = { address: string; csrfToken: string; chainId: number; cookie: string };

async function request(path: string, method = "GET", body?: unknown, session?: Session, extra?: Record<string, string>) {
  const response = await fetch(`${base}/api/wallet/${path}`, {
    method,
    headers: {
      Origin: base,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(session ? {
        Cookie: session.cookie,
        "x-wallet-address": session.address,
        "x-csrf-token": session.csrfToken,
      } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json(), headers: response.headers };
}

async function login(account: typeof first) {
  const challenge = await request("challenge", "POST", { address: account.address, chainId: 4663 });
  assert.equal(challenge.status, 200, "challenge should be created");
  assert.match(challenge.data.message, /Chain ID: 4663/);
  const signature = await account.signMessage({ message: challenge.data.message });
  const verified = await request("verify", "POST", { challengeId: challenge.data.challengeId, signature });
  assert.equal(verified.status, 200, "valid ownership proof should authenticate");
  const cookies = verified.headers.getSetCookie();
  const cookie = cookies.map(value => value.split(";")[0]).join("; ");
  assert.ok(cookie);
  assert.ok(cookies.some(value => /httponly/i.test(value)));
  assert.ok(cookies.some(value => /samesite=/i.test(value)));
  const replay = await request("verify", "POST", { challengeId: challenge.data.challengeId, signature });
  assert.ok([400, 401, 409].includes(replay.status), "a challenge cannot be replayed");
  return { ...verified.data, cookie } as Session;
}

async function main() {
  assert.equal((await request("save")).status, 401);
  assert.equal((await request("challenge", "POST", { address: first.address, chainId: 1 })).status, 400);
  const spoofed = await request("challenge", "POST", { address: first.address, chainId: 4663 }, undefined, {
    Origin: "https://untrusted.invalid",
    "X-Forwarded-Host": "untrusted.invalid",
    "X-Forwarded-Proto": "http",
  });
  assert.equal(spoofed.status, 403, "forwarded headers cannot authorize an attacker origin");
  assert.notEqual(spoofed.headers.get("access-control-allow-origin"), "https://untrusted.invalid");
  const wrongProof = await request("challenge", "POST", { address: first.address, chainId: 4663 });
  const wrongSignature = await second.signMessage({ message: wrongProof.data.message });
  const wrong = await request("verify", "POST", { challengeId: wrongProof.data.challengeId, signature: wrongSignature });
  assert.ok([400, 401].includes(wrong.status), "another wallet cannot claim this address");

  const a = await login(first);
  const b = await login(second);
  assert.equal((await request("session", "GET", undefined, a)).data.address.toLowerCase(), first.address.toLowerCase());
  const empty = await request("save", "GET", undefined, a);
  assert.equal(empty.status, 200);
  assert.equal(empty.data.save, null);
  assert.equal(empty.data.revision, 0);

  let save = createInitialState();
  save.meta.gems = 1_000;
  save = act(save, { type: "OPEN_CHEST" });
  assert.ok(save.meta.inventory.length > 0, "fixture includes real generated equipment");
  save = act(save, { type: "START_RUN", characterId: "alan-a-dale" });
  save.meta.gems = 37;
  const payload = { save, expectedRevision: 0 };
  assert.equal((await request("save", "PUT", payload)).status, 401);
  assert.equal((await request("save", "PUT", payload, a, { "x-csrf-token": "invalid" })).status, 403);
  assert.equal((await request("save", "PUT", payload, a, { "x-wallet-address": b.address })).status, 403);
  assert.equal((await request("save", "GET", undefined, a, { "x-wallet-address": b.address })).status, 403);
  assert.equal((await request("save", "PUT", payload, a, { Origin: "https://untrusted.invalid" })).status, 403);

  const firstSave = await request("save", "PUT", payload, a);
  assert.equal(firstSave.status, 200, "first save should persist");
  assert.equal(firstSave.data.revision, 1);
  assert.equal((await request("save", "GET", undefined, a)).data.save.meta.gems, 37);
  assert.deepEqual((await request("save", "GET", undefined, a)).data.save.meta.inventory, save.meta.inventory);
  assert.equal((await request("save", "GET", undefined, b)).data.save, null, "wallets remain isolated");

  const revisions = await Promise.all([38, 39].map(gems =>
    request("save", "PUT", { save: { ...save, meta: { ...save.meta, gems } }, expectedRevision: 1 }, a)));
  assert.deepEqual(revisions.map(result => result.status).sort(), [200, 409], "only one concurrent revision wins");
  const cloud = await request("save", "GET", undefined, a);
  assert.equal(cloud.data.revision, 2);
  const stale = await request("save", "PUT", payload, a);
  assert.equal(stale.status, 409);
  assert.equal(stale.data.revision, 2);
  assert.equal((await request("save", "PUT", { save: { meta: { version: 4, gems: -1 } }, expectedRevision: 2 }, a)).status, 400);

  // A fresh browser session with the same wallet can retrieve its inventory.
  const restored = await login(first);
  assert.equal((await request("save", "GET", undefined, restored)).data.save.meta.gems, cloud.data.save.meta.gems);
  assert.equal((await request("logout", "POST", {}, restored)).status, 200);
  assert.equal((await request("session", "GET", undefined, restored)).status, 401);
  await request("logout", "POST", {}, a);
  await request("logout", "POST", {}, b);
  console.log("Wallet API integration assertions passed: proof, isolation, CSRF, replay, restore, and revision conflicts.");
}

try {
  await main();
} finally {
  const addresses = [first.address.toLowerCase(), second.address.toLowerCase()];
  await db.delete(walletSessions).where(inArray(walletSessions.address, addresses));
  await db.delete(walletChallenges).where(inArray(walletChallenges.address, addresses));
  await db.delete(walletSaves).where(inArray(walletSaves.address, addresses));
  await pool.end();
}