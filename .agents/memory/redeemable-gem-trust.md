---
name: Redeemable gem trust boundary
description: Why token-redeemable gems must remain separate from Dicebound's campaign gem economy.
---

Token-redeemable gems are a separate server-authoritative balance that starts at zero. Campaign gems remain game-only and must never be accepted for real-value token purchases.

**Why:** The game engine and cloud saves are client-authored, so campaign rewards cannot prove legitimate earnings strongly enough to back transfers with monetary value. The user selected zero-start balances credited only by trusted server or operator sources.

**How to apply:** Any future grants must use an auditable, idempotent server-side ledger path. Do not merge, migrate lazily, or infer redeemable balances from campaign saves or browser state.