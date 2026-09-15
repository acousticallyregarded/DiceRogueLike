import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  deliverTokenPayoutIncident,
  getTokenPayoutIncidentDeliveryHealth,
  incidentEventForAlert,
  resetTokenPayoutIncidentDeliveryHealthForTest,
  resolvedIncidentEvent,
  setTokenPayoutIncidentTestFetch,
} from "./token-payout-incident-channel";

afterEach(() => {
  delete process.env.TOKEN_PAYOUT_INCIDENT_WEBHOOK_URL;
  setTokenPayoutIncidentTestFetch(null);
  resetTokenPayoutIncidentDeliveryHealthForTest();
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

test("incident delivery health counts consecutive failures and clears on success", async () => {
  process.env.TOKEN_PAYOUT_INCIDENT_WEBHOOK_URL = "https://incident.example.test/hook";
  setTokenPayoutIncidentTestFetch(async () => new Response(null, { status: 503 }));
  const event = incidentEventForAlert(alert, new Date());

  assert.equal(await deliverTokenPayoutIncident(event), false);
  assert.equal(await deliverTokenPayoutIncident(event), false);
  const degraded = getTokenPayoutIncidentDeliveryHealth();
  assert.equal(degraded.status, "degraded");
  assert.equal(degraded.consecutiveFailures, 2);
  assert.ok(degraded.lastFailureAt);
  assert.equal(degraded.lastSuccessAt, null);
  assert.deepEqual(
    Object.keys(degraded).sort(),
    ["consecutiveFailures", "lastFailureAt", "lastSuccessAt", "status"],
  );

  setTokenPayoutIncidentTestFetch(async () => new Response(null, { status: 204 }));
  assert.equal(await deliverTokenPayoutIncident(event), true);
  const recovered = getTokenPayoutIncidentDeliveryHealth();
  assert.equal(recovered.status, "ok");
  assert.equal(recovered.consecutiveFailures, 0);
  assert.equal(recovered.lastFailureAt, null);
  assert.ok(recovered.lastSuccessAt);
});

test("missing or invalid webhook configuration degrades delivery health", async () => {
  assert.equal(await deliverTokenPayoutIncident(
    incidentEventForAlert(alert, new Date()),
  ), false);
  assert.equal(getTokenPayoutIncidentDeliveryHealth().consecutiveFailures, 1);
});