import assert from "node:assert/strict";
import type { Server } from "node:http";
import test, { afterEach } from "node:test";
import app from "../app";
import {
  deliverTokenPayoutIncident,
  resetTokenPayoutIncidentDeliveryHealthForTest,
} from "../lib/token-payout-incident-channel";

let server: Server | null = null;

afterEach(async () => {
  delete process.env.TOKEN_PAYOUT_INCIDENT_WEBHOOK_URL;
  resetTokenPayoutIncidentDeliveryHealthForTest();
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => error ? reject(error) : resolve());
    });
    server = null;
  }
});

async function healthRequest(): Promise<Response> {
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return fetch(
    `http://127.0.0.1:${address.port}/api/healthz/token-payout-incident-delivery`,
  );
}

test("mounted incident delivery health route reports ok and degraded states", async () => {
  const healthy = await healthRequest();
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), {
    status: "ok",
    consecutiveFailures: 0,
    lastFailureAt: null,
    lastSuccessAt: null,
  });

  await new Promise<void>((resolve, reject) => {
    server?.close((error) => error ? reject(error) : resolve());
  });
  server = null;

  await deliverTokenPayoutIncident({
    status: "firing",
    alertKey: "route-test",
    severity: "critical",
    condition: "test",
    action: "test",
    details: {},
    occurredAt: new Date().toISOString(),
  });

  const degraded = await healthRequest();
  assert.equal(degraded.status, 503);
  const body = await degraded.json() as Record<string, unknown>;
  assert.equal(body.status, "degraded");
  assert.equal(body.consecutiveFailures, 1);
  assert.deepEqual(
    Object.keys(body).sort(),
    ["consecutiveFailures", "lastFailureAt", "lastSuccessAt", "status"],
  );
});