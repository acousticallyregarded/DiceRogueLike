import { reviewDiceboundDeath } from "../lib/dicebound-review";

function argument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`Missing ${prefix}<value>`);
  return value;
}

async function main(): Promise<void> {
  const evidence = JSON.parse(argument("evidence")) as unknown;
  const result = await reviewDiceboundDeath({
    deathRollId: argument("death-roll"),
    reviewerId: argument("reviewer"),
    evidence,
    authorization: argument("authorization"),
  });
  process.stdout.write(JSON.stringify(result) + "\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Review failed"}\n`);
  process.exitCode = 1;
});