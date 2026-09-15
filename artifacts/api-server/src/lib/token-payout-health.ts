export type TokenSymbol = "GLD" | "SLV";

export const STALE_RESERVATION_THRESHOLD_MS = 15 * 60 * 1000;
export const TOKEN_MONITOR_INTERVAL_MS = 60_000;
export const DEFAULT_MIN_INVENTORY_PAYOUTS = 5;
export const DEFAULT_MIN_NATIVE_GAS = "0.01";
export const TOKEN_ALERT_REPEAT_MS = 30 * 60 * 1000;

export interface TokenPayoutHealthSnapshot {
  checkedAt: Date;
  configured: boolean;
  nativeGasBaseUnits: bigint | null;
  minimumNativeGasBaseUnits: bigint;
  tokens: Array<{
    symbol: TokenSymbol;
    quoteHealthy: boolean;
    quoteTimestamp: Date | null;
    availableBaseUnits: bigint | null;
    payoutAmountBaseUnits: bigint | null;
    unresolvedCount: number;
    oldestUnresolvedAt: Date | null;
    stuckNonceCount: number;
    oldestStuckNonceAt: Date | null;
  }>;
}

export interface TokenPayoutAlert {
  key: string;
  severity: "warning" | "critical";
  condition: string;
  symbol?: TokenSymbol;
  action: string;
  details: Record<string, string | number | boolean | null>;
}

export function evaluateTokenPayoutHealth(
  snapshot: TokenPayoutHealthSnapshot,
  minimumInventoryPayouts = DEFAULT_MIN_INVENTORY_PAYOUTS,
): TokenPayoutAlert[] {
  const alerts: TokenPayoutAlert[] = [];
  if (!snapshot.configured) {
    alerts.push({
      key: "payout-configuration",
      severity: "critical",
      condition: "payout_not_configured",
      action: "Verify TOKEN_PURCHASES_ENABLED and that the escrow signer matches the configured escrow address.",
      details: { configured: false },
    });
  }
  if (snapshot.nativeGasBaseUnits === null) {
    alerts.push({
      key: "native-gas-unavailable",
      severity: "critical",
      condition: "native_gas_unavailable",
      action: "Check Robinhood Chain RPC connectivity before enabling token payouts.",
      details: { minimumNativeGasBaseUnits: snapshot.minimumNativeGasBaseUnits.toString() },
    });
  } else if (snapshot.nativeGasBaseUnits < snapshot.minimumNativeGasBaseUnits) {
    alerts.push({
      key: "native-gas-low",
      severity: "critical",
      condition: "native_gas_low",
      action: "Send native RBH gas to the escrow address, then confirm its pending balance is above the configured minimum.",
      details: {
        nativeGasBaseUnits: snapshot.nativeGasBaseUnits.toString(),
        minimumNativeGasBaseUnits: snapshot.minimumNativeGasBaseUnits.toString(),
      },
    });
  }
  for (const token of snapshot.tokens) {
    if (!token.quoteHealthy) {
      alerts.push({
        key: `${token.symbol}-quote`,
        severity: "critical",
        condition: "quote_unhealthy",
        symbol: token.symbol,
        action: "Check Massive API availability and ticker configuration; keep purchases disabled until a valid previous-close quote is returned.",
        details: { quoteTimestamp: token.quoteTimestamp?.toISOString() ?? null },
      });
    }
    const required = token.payoutAmountBaseUnits === null
      ? null
      : token.payoutAmountBaseUnits * BigInt(minimumInventoryPayouts);
    if (token.availableBaseUnits === null || required === null) {
      alerts.push({
        key: `${token.symbol}-inventory-unavailable`,
        severity: "critical",
        condition: "inventory_unavailable",
        symbol: token.symbol,
        action: `Check ${token.symbol} contract RPC reads and reservations before accepting purchases.`,
        details: { minimumInventoryPayouts },
      });
    } else if (token.availableBaseUnits < required) {
      alerts.push({
        key: `${token.symbol}-inventory-low`,
        severity: token.availableBaseUnits < token.payoutAmountBaseUnits! ? "critical" : "warning",
        condition: "inventory_low",
        symbol: token.symbol,
        action: `Refill ${token.symbol} at the escrow address or resolve obsolete reservations.`,
        details: {
          availableBaseUnits: token.availableBaseUnits.toString(),
          requiredBaseUnits: required.toString(),
          minimumInventoryPayouts,
        },
      });
    }
    if (
      token.oldestUnresolvedAt &&
      snapshot.checkedAt.getTime() - token.oldestUnresolvedAt.getTime() >= STALE_RESERVATION_THRESHOLD_MS
    ) {
      alerts.push({
        key: `${token.symbol}-reservations`,
        severity: "warning",
        condition: "unresolved_reservations_old",
        symbol: token.symbol,
        action: "Inspect the recovery worker and transaction receipts; do not delete reservations until chain outcome and gem accounting are reconciled.",
        details: {
          unresolvedCount: token.unresolvedCount,
          oldestUnresolvedAt: token.oldestUnresolvedAt.toISOString(),
        },
      });
    }
    if (token.stuckNonceCount > 0) {
      alerts.push({
        key: `${token.symbol}-stuck-nonce`,
        severity: "critical",
        condition: "signer_nonce_stuck",
        symbol: token.symbol,
        action: "Pause payouts and follow the stuck-transaction recovery runbook; rebroadcast the durable transaction before considering replacement.",
        details: {
          stuckNonceCount: token.stuckNonceCount,
          oldestStuckNonceAt: token.oldestStuckNonceAt?.toISOString() ?? null,
        },
      });
    }
  }
  return alerts;
}