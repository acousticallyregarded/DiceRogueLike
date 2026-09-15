import app from "./app";
import { logger } from "./lib/logger";
import { startTokenPayoutMonitor, startTokenPurchaseWorker } from "./lib/token-purchases";
import { recoverPendingRewardClaims } from "./lib/token-rewards";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  if (process.env.TOKEN_PURCHASES_ENABLED === "true") {
    startTokenPurchaseWorker();
    setInterval(() => void recoverPendingRewardClaims().catch(() => {
      logger.warn("Token reward recovery cycle failed");
    }), 15_000);
    startTokenPayoutMonitor();
    logger.info("Token purchase recovery worker started");
    logger.info("Token payout health monitor started");
  }
});
