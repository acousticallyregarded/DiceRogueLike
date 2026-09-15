import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { isTrustedOrigin } from "./lib/wallet-security";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

/**
 * Reflect only an explicitly configured origin.  In particular, this must not
 * become `origin: "*"` with credentials once wallet cookies are in use.
 * Same-origin requests do not need these headers; published domains are
 * explicitly supplied through the runtime origin allowlist.
 */
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (!origin) {
    next();
    return;
  }
  if (!isTrustedOrigin(req, origin)) {
    if (req.path.startsWith("/api/wallet")) {
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }
    next();
    return;
  }
  res.vary("Origin");
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-CSRF-Token, X-Wallet-Address, Idempotency-Key",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Keep malformed JSON and parser size errors JSON-shaped for API consumers.
app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 400;
  res.status(status === 413 ? 413 : 400).json({
    error: status === 413 ? "payload_too_large" : "invalid_json",
  });
});

export default app;
