---
date: 2026-07-03T16:02:11+0800
author: unknown
commit: acdc67b
branch: fix/new6-ps-in-container
repository: clawling-hermes-comics
topic: "NEW-6 install procps for production runner image"
tags: [plan, deploy, container, crawler]
status: ready
parent: .rpiv/artifacts/research/2026-07-03_16-02-11_new6-procps-runner-image.md
phase_count: 1
phases:
  - { n: 1, title: Add procps to runner image }
unresolved_phase_count: 0
last_updated: 2026-07-03T16:02:11+0800
last_updated_by: unknown
---

# NEW-6 procps Runner Image Plan

## Overview
Fix the container-only production runner failure by installing the OS package that provides `ps` in the final Docker runtime image.

## Requirements
- Add `procps` to the runner-stage apt package list in `Dockerfile`.
- Rebuild `comics-crawler:v3`.
- Verify `ps` exists in the container.
- Verify tests and Biome still pass.
- Exercise a no-`PRODUCTION_CRAWLER_SKIP_NETWORK` production-runner path enough to prove the previous `ps` lookup failure is gone.
- Keep the change to `Dockerfile` plus workflow artifacts only.
- Commit with message `fix(deploy): install procps in runner image` and push `fix/new6-ps-in-container`.

## Current State Analysis
- The image uses `oven/bun:1.3.14-slim` for the runner.
- The current runner apt list includes browser libraries but not `procps`.
- `ps` is needed by the real Crawlee/Playwright path, not the synthetic skip-network path.

## Desired End State
- `docker run --rm --entrypoint sh comics-crawler:v3 -lc 'which ps'` prints `/usr/bin/ps`.
- Production runner no longer reports `Executable not found in $PATH: "ps"`.
- Existing test and lint/format gates remain green.

## Phase 1: Add procps to runner image

### Changes Required

#### 1. Dockerfile
**File**: `Dockerfile`
**Change**: Add `procps` to the runner-stage apt install list, next to the other runtime OS packages.

```dockerfile
    libxshmfence1 \
    libxss1 \
    procps \
  && (apt-get install -y --no-install-recommends libasound2 || apt-get install -y --no-install-recommends libasound2t64) \
```

### Success Criteria

#### Automated Verification
- [x] `bun test apps/crawler/src/__tests__/` passes all 6 tests.
- [x] `bunx biome check .` exits 0.
- [x] `docker build -t comics-crawler:v3 .` exits 0.
- [x] `docker run --rm --entrypoint sh comics-crawler:v3 -lc 'which ps && ps --version | head -1'` prints `/usr/bin/ps`.
- [x] A no-skip-network production-runner smoke reaches Crawlee/Playwright and does not contain `Executable not found in $PATH: "ps"`.

#### Manual Verification
- [x] Only `Dockerfile` and `.rpiv/artifacts/**` are modified.
- [x] No crawler code, package manifest, or lockfile changes.
- [x] Image size remains effectively unchanged versus the prior reported 1.09GB baseline.

## Verification Notes
- `docker compose.yml` uses `comics-crawler:dev`, so local compose validation tagged the rebuilt `comics-crawler:v3` image as `comics-crawler:dev` before compose smoke checks.
- Live target-site validation on this runner is sensitive to site/network request timeouts. The deterministic no-skip-network smoke used fast-failing local start URLs to exercise Crawlee/Playwright and summary writing without `PRODUCTION_CRAWLER_SKIP_NETWORK`.

## References
- `.rpiv/artifacts/research/2026-07-03_16-02-11_new6-procps-runner-image.md`
- Issue NEW-6 description and PM workflow comment.
