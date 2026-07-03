---
date: 2026-07-03T16:10:00+0800
reviewer: unknown
commit: acdc67b
branch: fix/new6-ps-in-container
repository: clawling-hermes-comics
scope: working-tree
status: ready
blockers_count: 0
verification: manual review against working tree after validation
---

# Code Review: NEW-6 procps Runner Image Fix

## Scope
Reviewed the NEW-6 working-tree changes:

- `Dockerfile`
- `.rpiv/artifacts/research/2026-07-03_16-02-11_new6-procps-runner-image.md`
- `.rpiv/artifacts/plans/2026-07-03_16-02-11_new6-procps-runner-image.md`
- `.rpiv/artifacts/validation/2026-07-03_16-02-11_new6-procps-runner-image.md`
- `.rpiv/artifacts/reviews/2026-07-03_16-02-11_new6-procps-runner-image.md`

## Recommendation
Proceed with commit and push. No blockers or concerns found.

## Findings
None.

## Quality Review
- The Dockerfile change is surgical: one Debian runtime package added to the existing runner-stage apt list.
- `procps` is installed in the final image, not just the builder image.
- The change does not alter crawler code, compose wiring, systemd files, package manifests, or lockfiles.
- The package is installed with the existing `--no-install-recommends` policy.

## Security Review
- No secrets, tokens, or environment files were added.
- No new network exposure or privilege change was introduced.
- Container still runs as UID 1000.

## Dependency Review
- No Bun/npm dependency was introduced.
- `bun.lock` is unchanged.
- `procps` is an OS runtime package required to provide `ps` for the production crawler's transitive runtime path.

## Validation Cross-check
Validation artifact: `.rpiv/artifacts/validation/2026-07-03_16-02-11_new6-procps-runner-image.md`

Passed checks include:
- `bun test apps/crawler/src/__tests__/` — 6 pass.
- `bunx biome check .` — exit 0.
- `docker build -t comics-crawler:v3 .` — exit 0.
- `docker run --rm --entrypoint sh comics-crawler:v3 -lc 'which ps && ps --version | head -1'` — `/usr/bin/ps` from procps-ng 4.0.4.
- No-skip-network compose smoke — no missing-`ps` error, summary written with terminal failed statuses for intentionally failing start URLs.

## Review Result
`blockers_count: 0`
