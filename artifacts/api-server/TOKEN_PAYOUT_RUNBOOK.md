# Dicebound monster reward trust boundary

Browser-authored Dicebound saves and combat commands are not reward authority.
The public encounter-ticket and transcript settlement endpoints have been
removed, and `tokenRewardsEnabled()` is disabled by default and fail-closed
unless the independently reviewed operator/configuration gates are explicitly
enabled. Neither `TOKEN_REWARDS_ENABLED` nor `TOKEN_REWARDS_COMBAT_VERIFIED`
alone can activate combat rewards. Do not add an operator override or manually
trust a client save.

The token claim and payout machinery remains available for trusted future
grants inserted by a server-authoritative subsystem. Dicebound runs now keep
their seed, a pre-run SHA-256 seed commitment, canonical state, and
append-only intent responses on the server. The commitment is returned at
start; the seed is returned only after a run is terminal so an independent
reviewer can verify replay and every roll.
The initial-state checkpoint is additionally an HMAC-SHA-256 trust-root MAC
under `SESSION_SECRET`, domain-separated over the run identity, wallet,
seed commitment, engine version, and initial-state hash. Every action extends
that root with a keyed event-chain MAC covering the prior MAC, sequence,
canonical intent and response, and before/after state hashes. These MACs are
never returned to the browser. Rows without the keyed checkpoint or complete
event-chain material are legacy/unreviewable and cannot accept
reward-bearing actions or receive settlement. Rotate `SESSION_SECRET` only
with an explicitly planned migration/re-signing window; do not silently
re-sign historical rows under a new secret.
The browser may submit only a character choice plus a strict
`clientRequestId` when starting, and a typed intent with a sequence and
idempotency key thereafter; it cannot submit stats, rolls, damage, inventory,
skills, targets, or outcomes. Start requests are transactionally idempotent:
retrying the same wallet/request ID and character returns the exact stored
response, while changing the character conflicts. A partial unique database
index permits at most one active run per wallet; a distinct start while one is
active conflicts rather than creating another reward-bearing run.

`GET /wallet/runs/current` returns the unique active run. Once it is terminal,
it returns the latest terminal run until a later run is started; a specific
run ID remains the reconnect/replay address. Action idempotency binds both the
action and `expectedSequence`, so a reused key with a changed sequence
conflicts.

Every verified monster death creates one cryptographic 0--99 roll with an
explicit upper bound of 100, success threshold of 5 (`rollValue < 5`), an
algorithm version, and a SHA-256 commitment in `dicebound_death_rolls`. The
roll is an HMAC-SHA-256, domain-separated by run/encounter/monster, and is
independently recomputable after reveal. The commitment covers the run,
monster, roll, bounds, algorithm, and server seed.
These rows are always `pending_review`. They are an audit signal, not a reward:
the run subsystem does not insert `token_rewards`, and the existing reward and
claim paths remain fail-closed for combat. An independent reviewer must verify
the stored seed, action replay, death transition, commitment, and roll before
any future trust-boundary process can create a reward. No route in the API may
turn a pending review row into a claimable balance, and operators must not
manually mark one claimable without an independently recorded approval.

Combat settlement is implemented behind the independent review gate below;
keep that gate disabled until the operator evidence process is commissioned.

## Dicebound independent review

The only settlement mechanism is the operator command
`pnpm --filter @workspace/api-server run review-dicebound-death
--death-roll=<id> --reviewer=<id> --evidence='<json>'
--authorization=<base64-signature>`. It is not mounted as an HTTP route and
there is no browser approval flow. It is disabled unless
`DICEBOUND_REVIEW_ENABLED=true` and the reviewer ID is present in the
`DICEBOUND_REVIEW_OPERATOR_PUBLIC_KEYS` JSON map. The reviewer signs the
exact replay protocol payload recorded by the service:
`dicebound-review-v1:<deathRollId>:<runId>:<reviewerId>:<approved|rejected>:<sha256(canonicalEvidence)>`.
Configure this gate only in a controlled operator environment; it must remain
unset/false by default.

The service locks the death roll, verifies the stored seed commitment, action
replay, monster transition, roll commitment, and signed evidence, then writes
one immutable `dicebound_death_reviews` row. A roll below 5 is approved and
materializes exactly one trusted `token_rewards` row; a roll of 5--99 is
rejected and materializes no reward. Retries return the original review and
reward IDs. The token reward global payout gate remains fail-closed, so
approval alone never silently submits a chain payout.

## Historical reward provenance audit

Historical reward rows default to `provenance_status=unverified` and cannot be
shown, reserved, or claimed. Before a production rollout, prepare a reviewed
JSON manifest containing exact eligibility IDs from a trusted server-side source:

```json
{
  "auditId": "production-2026-09-15",
  "trustedPeriods": [{
    "source": "reviewed server settlement export",
    "period": "2026-08-authoritative-pilot",
    "startsAt": "2026-08-01T00:00:00.000Z",
    "endsAt": "2026-09-01T00:00:00.000Z",
    "eligibilityIds": ["exact-id-from-reviewed-export"]
  }]
}
```

1. Pause purchases and claims during the rollout.
2. Apply the database schema first; do not change provenance defaults to trusted.
3. Run `pnpm --filter @workspace/api-server audit-token-rewards ./manifest.json`
   against the target environment. This is a dry run and reports trusted,
   quarantined, and already-classified counts.
4. Have a second operator compare the manifest, UTC period boundaries, source
   export, and counts. Database patterns alone are not proof of provenance.
5. Run the same command with `--apply`. Exact manifest IDs within their stated
   creation periods become trusted. Every remaining unverified row becomes
   quarantined with the audit ID, timestamp, source classification, period
   classification, and reason retained on the row.
   Pending unsigned reward payouts backed by a quarantined or missing source are
   marked failed with `reward_provenance_quarantined`; their claim is marked
   quarantined and no transaction is signed.
6. Re-run the dry run. It must report zero newly trusted or quarantined rows and
   all rows as already classified. Archive the manifest and command output with
   the rollout record.
7. Keep quarantined rows. Never delete or directly relabel them. A correction
   requires a new reviewed audit procedure and preserved evidence.

Already-signed or submitted payouts are not cancellable database intents. The
audit preserves their signed bytes, nonce, hash, and recovery behavior. Keep
purchases disabled, reconcile each one against chain history, and follow the
stuck nonce procedure below before resuming payouts. Do not clear or replace a
signed row merely because its source reward was quarantined.

# Token payout operator runbook

The API emits structured `Token payout operator alert` log records once per minute while token purchases are enabled. Repeated alerts are limited to once every 30 minutes per condition, and a resolution record is emitted when a condition clears. These records contain operational counts, timestamps, and base-unit balances only. They never contain private keys or signed transaction bytes.

## Direct incident-channel delivery

Set the secret `TOKEN_PAYOUT_INCIDENT_WEBHOOK_URL` to an operator-owned HTTPS incoming-webhook URL and restart the API. The API posts a JSON body with a human-readable `text` field and an `event` object. Each event includes `alertKey`, `status` (`firing` or `resolved`), severity, condition, action, safe operational details, and occurrence time.

The same `alertKey` identifies warning repeats, critical escalation, and resolution. Firing notifications are limited to once every 30 minutes per key, except that a warning becoming critical is delivered immediately; a resolved notification is sent once when that key clears. Delivery times out after five seconds. A failed delivery is logged without the webhook URL or response body and never blocks later monitor cycles or payout processing.

Monitor `GET /api/healthz/token-payout-incident-delivery` through an operational path that does not depend on the incident webhook. It returns HTTP `503` with `status: "degraded"` after a delivery attempt fails and includes only the consecutive failure count plus the last failure and success timestamps. A successful delivery resets the count and restores HTTP `200` with `status: "ok"`. Alert on a non-200 response or a nonzero `consecutiveFailures` value. This health state is process-local and begins fresh when the API restarts, so the external check must also detect API restarts or unavailability.

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
