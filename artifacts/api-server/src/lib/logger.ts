import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "privateKey",
    "*.privateKey",
    "rawSignedTransaction",
    "*.rawSignedTransaction",
    "serializedTransaction",
    "*.serializedTransaction",
    "webhookUrl",
    "*.webhookUrl",
    "TOKEN_PAYOUT_INCIDENT_WEBHOOK_URL",
    "*.TOKEN_PAYOUT_INCIDENT_WEBHOOK_URL",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
