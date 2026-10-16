# GlitchFix Beta 0.2

GlitchFix is a runnable beta for automated QA checks of public websites, safe read-only API endpoints, and public GitHub repository manifests. It includes a responsive dashboard, demo failures, persistent run/project history, heuristic investigations, optional server-side AI diagnosis, and a check-rerun workflow.

## Run

Requirements: Node.js 20+.

```bash
npm start
```

Open http://localhost:3000 and choose **Run Demo Test**. No third-party packages are required. Run tests with `npm test`.

## Features

- Responsive dashboard with run history, evidence detail, project saving, and result summaries.
- Demo suite with intentionally seeded failures.
- Public website status, content-type, and basic security-header checks.
- Read-only API checks for GET/HEAD/OPTIONS, expected HTTP status, and optional top-level JSON field.
- Public GitHub repository manifest inspection: repository metadata, package.json parsing, and test/lint/build script presence.
- Local JSON persistence under `data/state.json` (override with `GLITCHFIX_DATA_DIR`).
- Heuristic bug investigation and proposed fix summaries.
- Optional server-side AI investigation via `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`) and `OPENAI_BASE_URL`.
- Rerun workflow for previous checks.
- URL validation for HTTP(S), credentials, localhost, common private/reserved IPs, and DNS-resolved private/reserved addresses. Redirects are not followed.
- GitHub Actions, Dockerfile, Render Blueprint, and unit tests.

## Important limits

- This beta does **not** launch a real browser automation engine, execute repository code, run customer unit tests, or apply/verify code patches.
- GitHub inspection is read-only and limited to public repositories.
- Rerunning checks is not patch verification.
- Website/API checks are smoke tests, not a penetration test.
- Local JSON persistence is for a single-instance beta, not multi-tenant production storage.
- DNS validation reduces risk but is not a complete SSRF defense against DNS rebinding.
- Do not expose this beta directly to the public internet without authentication, rate limiting, infrastructure-enforced outbound network restrictions, and disposable isolated workers for untrusted browser/code workloads.

## Optional AI setup

Set `OPENAI_API_KEY` on the server, optionally configure `OPENAI_MODEL` and `OPENAI_BASE_URL`, then restart. AI output is a suggestion, not proof of root cause or a verified fix. Never put API keys in frontend code.

## Deployment

Use `npm start` with a writable persistent disk for `data/state.json`. Set `PORT` and optionally `GLITCHFIX_DATA_DIR`. Production work still required includes tenant-aware authentication/authorization, a database, a background queue, secret encryption, controlled egress, and isolated test workers.
