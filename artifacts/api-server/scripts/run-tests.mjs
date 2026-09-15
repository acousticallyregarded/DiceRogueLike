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
    "redeemable_gem_accounts",
    "redeemable_gem_ledger",
    "token_purchases",
  ]) {
    await admin.query(
      `CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`,
    );
  }
  const isolatedUrl = schemaUrl();
  const testFiles = (await readdir(new URL("../src/lib", import.meta.url)))
    .filter((file) => file.endsWith(".test.ts"))
    .map((file) => `src/lib/${file}`);
  await run("pnpm", ["exec", "tsx", "--test", ...testFiles], {
    cwd: new URL("..", import.meta.url),
    env: { DATABASE_URL: isolatedUrl, NODE_ENV: "test" },
  });
} finally {
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
}