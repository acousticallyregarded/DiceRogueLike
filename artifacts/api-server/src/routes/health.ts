import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getTokenPayoutIncidentDeliveryHealth } from "../lib/token-payout-incident-channel";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/token-payout-incident-delivery", (_req, res) => {
  const health = getTokenPayoutIncidentDeliveryHealth();
  res.status(health.status === "ok" ? 200 : 503).json(health);
});

export default router;
