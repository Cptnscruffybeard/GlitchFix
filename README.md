# GlitchFix Beta 0.4

GlitchFix is a runnable beta for automated QA checks of public websites, safe read-only API endpoints, and public GitHub repository manifests. It includes a responsive dashboard, demo failures, persistent run/project history, heuristic investigations, optional server-side AI diagnosis, and a check-rerun workflow.

## Run

Requirements: Node.js 20+, npm, and Playwright Chromium installed (`npm install` then `npx playwright install chromium`). For the browser-ready Docker image, use `docker build -t glitchfix .` and run it with a persistent data volume plus a strong `GLITCHFIX_API_TOKEN`.

```bash
npm install
npx playwright install chromium
npm start
```

Open http://localhost:3000 and choose **Run Demo Test** or **Run Browser QA**. Run automated tests with `npm test`.

## Features

- Responsive dashboard with run history, evidence detail, project saving, and result summaries.
- Demo suite with intentionally seeded failures.
- Public website status, content-type, and basic security-header checks.
- Chromium browser QA: page navigation/status, document title, H1 presence, JavaScript console errors, uncaught page errors, failed requests, HTTP 400+ responses, network safety-filter events, and viewport screenshot evidence.
- Read-only API checks for GET/HEAD/OPTIONS, expected HTTP status, and optional top-level JSON field.
- Public GitHub repository manifest inspection: repository metadata, package.json parsing, and test/lint/build script presence.
- Local JSON persistence under `data/state.json` (override with `GLITCHFIX_DATA_DIR`).
- Five specialist passes: triage, security, reliability, root-cause hypotheses, and ticket drafting.
- Persistent tickets generated from failed checks, with severity, status tracking, and reviewed feedback labels.
- A human-reviewed feedback dataset that adjusts confidence for matching future findings and can support later retrieval/model evaluation; it does not fine-tune model weights.
- Optional live AI diagnosis through the OpenAI Responses API with strict JSON-schema output validation.
- Rerun workflow for previous checks.
- URL validation for HTTP(S), credentials, common private/reserved IP ranges, and DNS-resolved private/reserved addresses. Website/API smoke checks do not follow redirects; Chromium follows redirects while filtering each network request.
- Security headers on API and static responses.
- Optional bearer-token protection, fail-closed production API access, and basic per-IP rate limiting.
- Automated integration coverage for health, security headers, history, projects, ticket feedback, production API locking, and real Chromium browser QA.
- GitHub Actions, Dockerfile, Render Blueprint, and automated tests.

## Important limits

- Browser QA is now real Chromium automation, but it is a limited smoke-test suite. It does **not** execute repository code, run customer unit tests, crawl entire applications, or apply/verify code patches.
- GitHub inspection is read-only and limited to public repositories.
- Rerunning checks is not patch verification.
- Website/API checks are smoke tests, not a penetration test.
- Local JSON persistence is for a single-instance beta, not multi-tenant production storage.
- A shared bearer token is an interim launch gate, not full account-based authentication or tenant isolation.
- DNS validation reduces risk but is not a complete SSRF defense against DNS rebinding.
- The browser worker is a child process in the same service container, not a security sandbox. Do not expose this beta directly to the public internet until per-user authentication, stronger rate limiting, infrastructure-enforced outbound network restrictions, and disposable isolated browser/code workers are in place.

## Agents and feedback

The five specialist roles are deterministic rule-based passes. When optional AI is enabled, a server-side model adds structured diagnostic hypotheses and draft ticket suggestions. These components are coordinated analysis steps, not independently learning autonomous agents. Operators can label a ticket diagnosis useful, partly correct, or incorrect; labels are stored in the feedback dataset for later evaluation or a future retrieval/model-training pipeline. Feedback collection is not model training, and the system must not treat its own unreviewed output as ground truth.

To enable live AI diagnosis, set `OPENAI_API_KEY`, set `GLITCHFIX_AI_ENABLED=true`, and optionally set `GLITCHFIX_AI_MODEL` (default `gpt-6-astra`). API calls may incur provider charges. The key remains server-side; AI output is unverified and never applies patches or opens external tickets.

## Production access protection

Set `GLITCHFIX_API_TOKEN` to a long random secret of at least 32 characters in the hosting provider's secret/environment settings. In `NODE_ENV=production`, API routes other than `/api/health` fail closed if the token is missing. The dashboard accepts the token and keeps it in the current browser tab's session storage. Rotate the token if it is exposed. Basic in-process rate limiting is not a substitute for gateway-level rate limiting or authentication with individual user accounts.

## Deployment

Use `npm start` with a writable persistent disk for `data/state.json`. Set `PORT` and optionally `GLITCHFIX_DATA_DIR`. Production work still required includes tenant-aware authentication/authorization, a database, a background queue, secret encryption, controlled egress, and isolated test workers. The shared bearer token is an interim gate, not multi-tenant account security.
