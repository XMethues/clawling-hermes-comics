---
date: 2026-07-03T16:02:11+0800
author: unknown
commit: acdc67b
branch: fix/new6-ps-in-container
repository: clawling-hermes-comics
topic: "NEW-6 install procps for production runner image"
tags: [research, deploy, container, crawler]
status: ready
last_updated: 2026-07-03T16:02:11+0800
last_updated_by: unknown
---

# Research: NEW-6 Install procps for Production Runner Image

## Research Question
Why does the containerized production crawler fail with `Executable not found in $PATH: "ps"`, and what is the smallest safe fix?

## Summary
The runtime image is built from `oven/bun:1.3.14-slim` and installs browser/runtime libraries in `Dockerfile`, but it does not install Debian's `procps` package. That package provides `/usr/bin/ps`. The failure reported in NEW-6 occurs only in the real production runner path because `PRODUCTION_CRAWLER_SKIP_NETWORK=true` returns synthetic run records before Crawlee/Playwright starts a browser-backed crawl. The minimal fix is to add `procps` to the runner-stage apt package list only.

## Detailed Findings

### Runtime image is the affected boundary
- `Dockerfile` uses `oven/bun:${BUN_VERSION}-slim` for the `runner` stage.
- The runner-stage `apt-get install -y --no-install-recommends` block contains browser support libraries but no package that provides `ps`.
- The builder stage does not matter for this bug; `ps` must exist in the final runtime image.

### Production runner reaches Crawlee only without SKIP_NETWORK
- `apps/crawler/src/scripts/production.ts` has a `PRODUCTION_CRAWLER_SKIP_NETWORK` branch in `runSiteMode` that returns a synthetic `RunRecord` before launching the site script.
- The real path launches package scripts via `runWorkspaceCommand`, which then starts Crawlee/Playwright. That path is where dependencies can shell out to `ps`.

### Minimal fix
- Debian's `procps` package provides `/usr/bin/ps`.
- Adding `procps` to the existing runner-stage apt list keeps the change at the deployment boundary.
- No crawler business logic, site logic, DB schema, package manifest, or lockfile changes are required.

## Decision
Install `procps` in the runner stage of `Dockerfile`.

## What We're Not Doing
- No crawler code changes.
- No dependency/package manifest changes.
- No workaround inside Crawlee/Playwright/Bun internals.
- No changes to compose, systemd, DB, or MCP behavior.

## Code References
- `Dockerfile` — runner-stage apt package list where `procps` belongs.
- `apps/crawler/src/scripts/production.ts` — `PRODUCTION_CRAWLER_SKIP_NETWORK` synthetic early return explains why prior smoke validation did not expose this.

## Open Questions
None.
