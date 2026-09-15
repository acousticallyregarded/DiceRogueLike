---
name: Playwright on Replit Nix
description: Environment requirements for running repository-owned Playwright browser checks in this workspace.
---

Repository-owned Playwright tests require the matching browser binary plus Chromium's shared runtime libraries declared in the Replit Nix configuration.

**Why:** Installing the JavaScript package and browser download alone still allowed the runner to start but failed at launch on missing shared libraries.

**How to apply:** When adding or upgrading Playwright, keep its Chromium runtime dependencies in the workspace environment and confirm linked libraries before diagnosing failures as application bugs.