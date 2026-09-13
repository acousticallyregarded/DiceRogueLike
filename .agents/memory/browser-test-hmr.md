---
name: Browser testing and hot reload
description: Avoid treating hook-order errors during concurrent edits as confirmed application defects.
---
Do not change hook structure while a browser verification pass is running.

**Why:** A live hook addition during a combat test caused a React hook-order crash through hot reload. A fresh context after restarting the workflow completed the same death flow without errors.

**How to apply:** Keep source stable during a browser pass. If a hook-order error coincides with active edits, inspect hook placement and verify from a hard reload before changing otherwise-correct state logic.