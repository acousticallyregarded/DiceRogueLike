import { logger } from "./logger";
import type { TokenPayoutAlert } from "./token-payout-health";

const DELIVERY_TIMEOUT_MS = 5_000;

export interface TokenPayoutIncidentEvent {
  status: "firing" | "resolved";
  alertKey: string;
  severity: "warning" | "critical";
  condition: string;
  symbol?: string;
  action: string;
  details: Record<string, string | number | boolean | null>;
  occurredAt: string;
}

type IncidentFetch = typeof fetch;
let incidentFetch: IncidentFetch = fetch;

function incidentWebhookUrl(): string | null {
  const configured = process.env.TOKEN_PAYOUT_INCIDENT_WEBHOOK_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function incidentEventForAlert(
  alert: TokenPayoutAlert,
  occurredAt: Date,
): TokenPayoutIncidentEvent {
  return {
    status: "firing",
    alertKey: alert.key,
    severity: alert.severity,
    condition: alert.condition,
    symbol: alert.symbol,
    action: alert.action,
    details: alert.details,
    occurredAt: occurredAt.toISOString(),
  };
}

export function resolvedIncidentEvent(
  alert: TokenPayoutAlert,
  occurredAt: Date,
): TokenPayoutIncidentEvent {
  return {
    ...incidentEventForAlert(alert, occurredAt),
    status: "resolved",
  };
}

export async function deliverTokenPayoutIncident(
  event: TokenPayoutIncidentEvent,
): Promise<boolean> {
  const url = incidentWebhookUrl();
  if (!url) return false;
  const summary = `[Dicebound payout ${event.status}] ${event.alertKey}: ${event.condition}`;
  try {
    const response = await incidentFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: summary,
        event,
      }),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn({
        alertKey: event.alertKey,
        status: event.status,
        responseStatus: response.status,
      }, "Token payout incident delivery failed");
      return false;
    }
    return true;
  } catch {
    // Do not attach the error: HTTP client errors can include request details,
    // including the secret webhook URL. Incident delivery must never stop the monitor.
    logger.warn({
      alertKey: event.alertKey,
      status: event.status,
    }, "Token payout incident delivery failed");
    return false;
  }
}

/** Test-only seam for deterministic webhook responses. */
export function setTokenPayoutIncidentTestFetch(override: IncidentFetch | null): void {
  incidentFetch = override ?? fetch;
}