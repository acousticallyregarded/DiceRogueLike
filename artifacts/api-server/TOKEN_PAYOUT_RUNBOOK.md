# Token payout operator runbook

The API emits structured `Token payout operator alert` log records once per minute while token purchases are enabled. Repeated alerts are limited to once every 30 minutes per condition, and a resolution record is emitted when a condition clears. These records contain operational counts, timestamps, and base-unit balances only. They never contain private keys or signed transaction bytes.

## Direct incident-channel delivery

Set the secret `TOKEN_PAYOUT_INCIDENT_WEBHOOK_URL` to an operator-owned HTTPS incoming-webhook URL and restart the API. The API posts a JSON body with a human-readable `text` field and an `event` object. Each event includes `alertKey`, `status` (`firing` or `resolved`), severity, condition, action, safe operational details, and occurrence time.

The same `alertKey` identifies warning repeats, critical escalation, and resolution. Firing notifications are limited to once every 30 minutes per key, except that a warning becoming critical is delivered immediately; a resolved notification is sent once when that key clears. Delivery times out after five seconds. A failed delivery is logged without the webhook URL or response body and never blocks later monitor cycles or payout processing.

Keep the webhook URL in Replit Secrets, not in source control or deployment logs. Configure the receiving channel to group or thread events by `event.alertKey`. The endpoint must accept an HTTPS `POST` with JSON; Slack-compatible incoming webhooks can display the top-level `text` field, while general incident receivers can inspect the complete `event`.

### Send a test notification

1. Create a temporary HTTPS request-bin endpoint or a dedicated test incoming webhook owned by the on-call team.
2. Store its URL as `TOKEN_PAYOUT_INCIDENT_WEBHOOK_URL` and restart the API.
3. Temporarily set `TOKEN_ESCROW_MIN_NATIVE_GAS` above the escrow's current native balance, then restart the API. Do not change escrow funds or signer data for this test.
4. Confirm the channel receives a `firing` event whose `alertKey` is `native-gas-low`, with no signed transaction or secret fields.
5. Restore the normal gas threshold and restart the API. Confirm the same `alertKey` receives one `resolved` event.
6. Remove the temporary endpoint and retain only the production incident webhook secret.

## Alert settings

- `TOKEN_ESCROW_MIN_NATIVE_GAS`: minimum native RBH balance for transaction fees. Default: `0.01`.
- `TOKEN_ESCROW_MIN_INVENTORY_PAYOUTS`: warn when available GLD or SLV cannot cover this many current-price payouts. Default: `5`.
- Quotes must be valid Massive previous-close prices from an allowed prior UTC trading day.
- Reservations older than 15 minutes warn. Signed or submitted transactions older than 30 minutes are treated as stuck and pause new signing.

## Refill GLD or SLV

1. Confirm the alert's token symbol and available base-unit balance.
2. Transfer the correct token contract to escrow address `0x6efDa0f76c9B5D23a0dD777A773FAa876fc10C95` on Robinhood Mainnet (chain ID `4663`).
3. Verify the token contract, recipient, network, and amount before submitting. Start with a small transfer when using a new source wallet.
4. Wait for confirmation. The monitor clears after chain balance minus unresolved reservations covers the configured number of payouts.
5. Do not delete unresolved purchase rows to make inventory appear available. Reconcile each reservation against its chain transaction and gem ledger first.

## Refill native transaction gas

1. Transfer native RBH on Robinhood Mainnet to the escrow address above.
2. Keep the pending native balance above `TOKEN_ESCROW_MIN_NATIVE_GAS`, with additional margin for traffic and gas-price changes.
3. Confirm the monitor emits an alert resolution before relying on new payouts.

## Recover stale reservations and stuck signer nonces

1. Pause new purchases by setting `TOKEN_PURCHASES_ENABLED=false` and restart the API. Existing durable purchase and accounting records remain intact.
2. Find the oldest unresolved purchase using its purchase ID, status, nonce, and transaction hash. Never copy or log `raw_signed_transaction`.
3. Query the transaction hash and signer nonce on Robinhood Mainnet:
   - If confirmed successfully, allow the recovery worker to record confirmation.
   - If definitively reverted, allow the recovery path to mark failure and issue the idempotent gem refund.
   - If pending or absent, compare the escrow account's latest and pending nonce with the purchase nonce.
4. For an absent transaction whose nonce is still available, restart with purchases enabled so the worker rebroadcasts the already-durable signed transaction. It must not sign a second payout at that nonce.
5. If the nonce is blocked by a genuinely pending transaction, use the wallet/provider's same-nonce replacement procedure with a higher fee. Preserve the original recipient, token call, and amount. Have a second operator verify the replacement before broadcast.
6. If the chain nonce has already advanced past the stored nonce without the expected receipt, stop. Reconcile chain history, the purchase row, and gem ledger before changing status or refunding; do not guess from an RPC timeout.
7. Re-enable purchases only after the oldest nonce is confirmed or definitively failed, reservations are reconciled, gas and inventory are healthy, and operator alerts clear.

## Pricing alerts

Check Massive service availability, `MASSIVE_API_KEY`, and `MASSIVE_GLD_TICKER` / `MASSIVE_SLV_TICKER`. Keep purchases disabled if the previous-close result is missing, malformed, future-dated, or too old. Do not substitute an unapproved live or cached price.