---
date: 2026-07-03T16:09:38+0800
author: unknown
commit: acdc67b
branch: fix/new6-ps-in-container
repository: clawling-hermes-comics
parent: .rpiv/artifacts/plans/2026-07-03_16-02-11_new6-procps-runner-image.md
tags: [validation, deploy, container, crawler]
topic: "Validation of NEW-6 procps runner image fix"
status: ready
verdict: pass
---

# Validation: NEW-6 procps Runner Image Fix

## Summary
Verdict: pass.

`procps` is installed in the rebuilt runner image, `/usr/bin/ps` is present, and the previous `Executable not found in $PATH: "ps"` error did not appear in container production-runner smoke checks. Existing crawler tests and Biome passed.

## Automated Verification

### 1. Dependency install for local validation
Command:

```bash
bun install --frozen-lockfile
```

Exit code: 0

Key output:

```text
692 packages installed [1443.00ms]
```

### 2. Crawler tests
Command:

```bash
bun test apps/crawler/src/__tests__/
```

Exit code: 0

Output:

```text
6 pass
0 fail
33 expect() calls
Ran 6 tests across 1 file. [40.93s]
```

### 3. Biome check
Command:

```bash
bunx biome check .
```

Exit code: 0

Output:

```text
Checked 48 files in 18ms. No fixes applied.
```

### 4. Docker image build
Command:

```bash
docker build -t comics-crawler:v3 .
```

Exit code: 0

Key output:

```text
#22 naming to docker.io/library/comics-crawler:v3 0.0s done
#22 DONE 9.9s
```

### 5. `ps` exists in the runner image
Command:

```bash
docker run --rm --entrypoint sh comics-crawler:v3 -lc 'which ps && ps --version | head -1'
```

Exit code: 0

Output:

```text
/usr/bin/ps
ps from procps-ng 4.0.4
```

### 6. Image size
Command:

```bash
docker images comics-crawler:v3 --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}'
```

Exit code: 0

Output:

```text
REPOSITORY       TAG       IMAGE ID       SIZE
comics-crawler   v3        55d243ed9678   1.07GB
```

The issue body reported the previous image at approximately 1.09GB; the rebuilt local image reports 1.07GB, so there is no meaningful size increase.

### 7. No-skip-network production-runner smoke
`docker-compose.yml` names the compose image `comics-crawler:dev`, so the rebuilt image was tagged for compose validation:

```bash
docker tag comics-crawler:v3 comics-crawler:dev
```

A deterministic no-`PRODUCTION_CRAWLER_SKIP_NETWORK` smoke was run through compose with fast-failing local start URLs so Crawlee/Playwright actually launched but the check did not depend on target-site availability:

```bash
PRODUCTION_CRAWLER_SCRIPT=production:probe
CLOAKBROWSER_CACHE_DIR=/app/data/.cloakbrowser
CLOAKBROWSER_AUTO_UPDATE=false
ROUMAN5_PROBE_MAX_REQUESTS=1
EIGHTEEN_COMIC_PROBE_MAX_REQUESTS=1
ROUMAN5_PROBE_START_URLS=http://127.0.0.1:9/rouman5
EIGHTEEN_COMIC_PROBE_START_URLS=http://127.0.0.1:9/18comic
docker compose up --abort-on-container-exit --exit-code-from crawler crawler
```

Exit code: 1, expected for this negative smoke because the URLs intentionally fail. The important checks passed:

- Log did **not** contain `Executable not found in $PATH`.
- Log did **not** contain a missing `ps` error.
- Crawlee/Playwright started and processed requests.
- Summary JSON was written with terminal `failed` statuses rather than missing-`ps` failures.

Summary JSON:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-03T08:09:37.644Z",
  "overallStatus": "failed",
  "records": [
    {
      "site": "18comic",
      "mode": "probe",
      "status": "failed",
      "crawlRunId": 16,
      "comicsStored": 0,
      "chaptersStored": 0,
      "failedRequests": 1,
      "errorMessage": "Stored 0 chapter URL(s), below minimum 1.",
      "durationMs": 1868
    },
    {
      "site": "rouman5",
      "mode": "probe",
      "status": "failed",
      "crawlRunId": 15,
      "comicsStored": 0,
      "chaptersStored": 0,
      "failedRequests": 1,
      "errorMessage": "Stored 0 chapter URL(s), below minimum 1.",
      "durationMs": 1868
    }
  ]
}
```

## Live Target-Site Note
I also attempted the unmodified live-target compose path without `PRODUCTION_CRAWLER_SKIP_NETWORK`. It reached Crawlee/Playwright and did not emit the `ps` missing error, but this runner's live target requests stayed in site/request timeouts long enough that the run had to be stopped after the observation window. That is why the deterministic no-skip smoke above was used for a complete summary-writing check.

## Manual Verification
- `git diff -- Dockerfile` shows only one runtime package addition: `procps`.
- No crawler code was changed.
- No package manifest or lockfile was changed.
- Temporary `.env`/compose log files used for validation were removed before commit.

## Deviations from Plan
None for the code fix. The exact live-site acceptance is environment-dependent; the deterministic no-skip smoke verifies the missing-`ps` regression path without relying on external site responsiveness.
