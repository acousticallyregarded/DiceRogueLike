import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { pool as admin } from "@workspace/db";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for database-backed tests.");

const schema = `token_purchase_test_${process.pid}_${Date.now()}`;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
      env: { ...process.env, ...options.env },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

function schemaUrl() {
  const url = new URL(databaseUrl);
  const existing = url.searchParams.get("options");
  url.searchParams.set("options", [existing, `-c search_path=${schema}`].filter(Boolean).join(" "));
  return url.toString();
}

try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  for (const table of [
     "wallet_challenges",
     "wallet_sessions",
     "wallet_saves",
    "redeemable_gem_accounts",
    "redeemable_gem_ledger",
    "token_rewards",
    "token_reward_claims",
    "token_payout_alert_states",
    "token_payout_monitor_state",
    "token_purchases",
     "dicebound_runs",
     "dicebound_run_starts",
     "dicebound_action_events",
     "dicebound_death_rolls",
     "dicebound_death_reviews",
  ]) {
    await admin.query(
      `CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`,
    );
  }
  // Keep isolated acceptance schemas forward-compatible with the checked-in
  // Drizzle schema when the shared public test database has not been pushed.
  await admin.query(`ALTER TABLE "${schema}"."dicebound_runs" ADD COLUMN IF NOT EXISTS "initial_state" jsonb`);
  await admin.query(`ALTER TABLE "${schema}"."dicebound_runs" ADD COLUMN IF NOT EXISTS "engine_version" text`);
  await admin.query(`ALTER TABLE "${schema}"."dicebound_runs" ADD COLUMN IF NOT EXISTS "initial_state_hash" text`);
  await admin.query(`ALTER TABLE "${schema}"."dicebound_runs" ADD COLUMN IF NOT EXISTS "initial_state_commitment" text`);
  await admin.query(`ALTER TABLE "${schema}"."dicebound_action_events" ADD COLUMN IF NOT EXISTS "before_state_hash" text`);
  await admin.query(`ALTER TABLE "${schema}"."dicebound_action_events" ADD COLUMN IF NOT EXISTS "after_state_hash" text`);
  await admin.query(`ALTER TABLE "${schema}"."dicebound_action_events" ADD COLUMN IF NOT EXISTS "previous_event_commitment" text`);
  await admin.query(`ALTER TABLE "${schema}"."dicebound_action_events" ADD COLUMN IF NOT EXISTS "event_commitment" text`);
  const isolatedUrl = schemaUrl();
  const testFiles = (
    await Promise.all(
      ["lib", "routes"].map(async (directory) =>
        (await readdir(new URL(`../src/${directory}`, import.meta.url)))
          .filter((file) => file.endsWith(".test.ts"))
          .map((file) => `src/${directory}/${file}`),
      ),
    )
  ).flat();
  await run("pnpm", ["exec", "tsx", "--test", ...testFiles], {
    cwd: new URL("..", import.meta.url),
    env: { DATABASE_URL: isolatedUrl, NODE_ENV: "test" },
  });
} finally {
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
}