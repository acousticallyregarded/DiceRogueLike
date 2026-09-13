---
name: Browser testing and hot reload
description: Avoid treating hook-order errors during concurrent edits as confirmed application defects.
---
Do not change hook structure while a browser verification pass is running.

**Why:** A live hook addition during a combat test caused a React hook-order crash through hot reload. A fresh context after restarting the workflow completed the same death flow without errors.

**How to apply:** Keep source stable during a browser pass. If a hook-order error coincides with active edits, inspect hook placement and verify from a hard reload before changing otherwise-correct state logic.

Measure animation timing inside one browser evaluation using performance timestamps, not across screenshot/tool calls.

**Why:** Screenshot latency made a correct 4200ms attack appear to resolve in 800ms. Polling HP and pending state from the same evaluation as the click confirmed the correct duration.

**How to apply:** Record the click timestamp and sample state in-page; collect screenshots separately as visual evidence, not as timing measurements.