# GlitchFix Beta 0.4

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
- Five specialist passes: triage, security, reliability, root-cause hypotheses, and ticket drafting.
- Persistent tickets generated from failed checks, with severity, status tracking, and reviewed feedback labels.
- A human-reviewed feedback dataset endpoint intended to support later retrieval or model evaluation; it does not train a model by itself.
- Rule-based investigation summaries with proposed next steps; live LLM diagnosis is not yet enabled.
- Rerun workflow for previous checks.
- URL validation for HTTP(S), credentials, localhost, common private/reserved IPs, and DNS-resolved private/reserved addresses. Redirects are not followed.
- Security headers on API and static responses.
- Optional bearer-token protection, fail-closed production API access, and basic per-IP rate limiting.
- Automated integration coverage for health, history, project creation, and rerun behavior.
- GitHub Actions, Dockerfile, Render Blueprint, and automated tests.

## Important limits

- This beta does **not** launch a real browser automation engine, execute repository code, run customer unit tests, or apply/verify code patches.
- GitHub inspection is read-only and limited to public repositories.
- Rerunning checks is not patch verification.
- Website/API checks are smoke tests, not a penetration test.
- Local JSON persistence is for a single-instance beta, not multi-tenant production storage.
- A shared bearer token is an interim launch gate, not full account-based authentication or tenant isolation.
- DNS validation reduces risk but is not a complete SSRF defense against DNS rebinding.
- Do not expose this beta directly to the public internet without authentication, rate limiting, infrastructure-enforced outbound network restrictions, and disposable isolated workers for untrusted browser/code workloads.

## Agents and feedback

The current specialist agents are deterministic rule-based passes, not trained or independently autonomous AI models. They produce ranked hypotheses and draft tickets from observed check failures. Operators can label a ticket diagnosis useful, partly correct, or incorrect; labels are stored in the feedback dataset for later evaluation or a future retrieval/model-training pipeline. Feedback collection is not model training, and the system must not treat its own unreviewed output as ground truth.

## Production access protection

Set `GLITCHFIX_API_TOKEN` to a long random secret in the hosting provider's secret/environment settings. In `NODE_ENV=production`, API routes other than `/api/health` fail closed if the token is missing. The dashboard accepts the token and keeps it in the current browser tab's session storage. Rotate the token if it is exposed. Basic in-process rate limiting is not a substitute for gateway-level rate limiting or authentication with individual user accounts.

## Deployment

Use `npm start` with a writable persistent disk for `data/state.json`. Set `PORT` and optionally `GLITCHFIX_DATA_DIR`. Production work still required includes tenant-aware authentication/authorization, a database, a background queue, secret encryption, controlled egress, and isolated test workers.
