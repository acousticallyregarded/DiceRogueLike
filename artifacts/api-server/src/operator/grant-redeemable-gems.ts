import { grantRedeemableGems } from "../lib/token-purchases";

function argument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`Missing ${prefix}<value>`);
  return value;
}

async function main(): Promise<void> {
  const amountText = argument("amount");
  if (!/^[0-9]+$/.test(amountText)) throw new Error("--amount must be a positive integer");
  const result = await grantRedeemableGems({
    walletAddress: argument("wallet"),
    amount: Number(amountText),
    reason: argument("reason"),
    operationKey: argument("operation-key"),
    authorization: argument("authorization"),
  });
  process.stdout.write(JSON.stringify(result) + "\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Grant failed";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
});