import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  deliverTokenPayoutIncident,
  incidentEventForAlert,
  resolvedIncidentEvent,
  setTokenPayoutIncidentTestFetch,
} from "./token-payout-incident-channel";

afterEach(() => {
  delete process.env.TOKEN_PAYOUT_INCIDENT_WEBHOOK_URL;
  setTokenPayoutIncidentTestFetch(null);
});

const alert = {
  key: "GLD-inventory-low",
  severity: "critical" as const,
  condition: "inventory_low",
  symbol: "GLD" as const,
  action: "Refill GLD.",
  details: { availableBaseUnits: "1" },
};

test("incident events retain the alert key for firing and resolved grouping", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");
  assert.equal(incidentEventForAlert(alert, now).alertKey, alert.key);
  assert.equal(resolvedIncidentEvent(alert, now).alertKey, alert.key);
  assert.equal(resolvedIncidentEvent(alert, now).status, "resolved");
});

test("incident delivery sends only the sanitized event payload", async () => {
  process.env.TOKEN_PAYOUT_INCIDENT_WEBHOOK_URL = "https://incident.example.test/hook";
  let body = "";
  setTokenPayoutIncidentTestFetch(async (_input, init) => {
    body = String(init?.body);
    return new Response(null, { status: 204 });
  });
  assert.equal(await deliverTokenPayoutIncident(
    incidentEventForAlert(alert, new Date("2026-09-15T12:00:00.000Z")),
  ), true);
  assert.match(body, /GLD-inventory-low/);
  assert.doesNotMatch(body, /rawSignedTransaction|serializedTransaction|privateKey/);
});

test("incident delivery failures are contained", async () => {
  process.env.TOKEN_PAYOUT_INCIDENT_WEBHOOK_URL = "https://incident.example.test/hook";
  setTokenPayoutIncidentTestFetch(async () => {
    throw new Error("secret request context");
  });
  assert.equal(await deliverTokenPayoutIncident(
    incidentEventForAlert(alert, new Date()),
  ), false);
});