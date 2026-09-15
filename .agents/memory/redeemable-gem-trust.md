---
name: Redeemable gem trust boundary
description: Why token-redeemable gems must remain separate from Dicebound's campaign gem economy.
---

Token-redeemable gems are a separate server-authoritative balance that starts at zero. Campaign gems remain game-only and must never be accepted for real-value token purchases. Value-bearing campaign outcomes require the complete action lifecycle to pass through server authority, including timer-driven animation completions and movement steps.

**Why:** Routing only visible player choices through the server is insufficient: local automatic transitions can leave the client ahead of canonical state and make legitimate play stall. The browser must never be able to turn campaign state into monetary value on its own.

**How to apply:** Any future grant must use an auditable, idempotent server-side ledger path. Route user actions and automatic reducer transitions through one serialized authoritative dispatcher; treat browser state only as a presentation of canonical server state.