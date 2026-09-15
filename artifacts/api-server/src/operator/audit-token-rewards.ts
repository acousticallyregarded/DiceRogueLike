import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
import { auditTokenRewardProvenance } from "../lib/token-reward-provenance";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const manifestPath = args.find((arg) => !arg.startsWith("--"));

if (!manifestPath) {
  console.error("Usage: pnpm audit-token-rewards <manifest.json> [--apply]");
  process.exitCode = 2;
} else {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const result = await auditTokenRewardProvenance(manifest, { apply });
    console.log(JSON.stringify(result, null, 2));
    if (!apply) console.log("Dry run only. Re-run with --apply after a second operator reviews the manifest and counts.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}