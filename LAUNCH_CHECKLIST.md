# GlitchFix Sunday Launch Gate

Target date: Sunday, 2026-10-18.

This checklist separates a limited invite-only preview from a public commercial launch. Do not mark a gate complete until it is actually verified.

## Built in the repository

- [x] Chromium smoke-test runner captures navigation/status, title, H1, console errors, uncaught page errors, failed requests, HTTP errors, blocked private-network requests, and a viewport screenshot.
- [x] Five specialist analysis passes: triage, security, reliability, root-cause hypotheses, and ticket drafting.
- [x] Persistent internal ticket list, severity, status changes, and human feedback labels.
- [x] Reviewed feedback adjusts confidence for matching future findings; it does not train model weights.
- [x] Optional server-side OpenAI Responses API diagnosis with strict structured output validation; disabled unless explicitly configured.
- [x] Shared bearer token support, fail-closed production API access if the token is missing, basic in-process rate limiting, security headers, and improved private/reserved IP filtering.
- [x] CI installs Chromium, runs JavaScript syntax checks, runs tests, and performs a health smoke test.

## Required before invite-only preview

- [ ] Deploy the Docker image to the intended host.
- [ ] Configure a long random `GLITCHFIX_API_TOKEN` in host secrets and verify unauthorized API requests are rejected.
- [ ] Decide whether to enable AI; if enabled, configure `OPENAI_API_KEY`, set `GLITCHFIX_AI_ENABLED=true`, choose an allowed model, and confirm provider billing/limits.
- [ ] Verify persistent storage survives a redeploy.
- [ ] Test the deployed app from a phone and desktop using a project the operator owns.
- [ ] Verify browser tests reject local/private network targets and time out safely.
- [ ] Confirm a support/contact route and privacy notice are present before inviting outside users.

## Blockers for a public paid launch

- [ ] Replace shared-token access with real user accounts, authorization, and tenant isolation.
- [ ] Move run/ticket state from a single JSON file to a transactional database.
- [ ] Enforce outbound network restrictions at infrastructure level; application DNS checks alone do not eliminate SSRF/DNS-rebinding risk.
- [ ] Move Chromium into disposable, resource-limited, network-restricted worker containers. The current browser child process is not a security sandbox.
- [ ] Add queueing, cancellation, concurrency limits, per-user quotas, and gateway-level rate limiting.
- [ ] Add reproducible code checkout, isolated test/build execution, test-result ingestion, and genuine patch verification.
- [ ] Add explicit customer approval before any write action; keep auto-merge and auto-deploy disabled.
- [ ] Add retention/deletion controls, audit logs, monitoring/alerts, backup/restore tests, and incident response procedures.
- [ ] Run a security review against a deployed environment and fix all critical/high findings.
- [ ] Add service terms, privacy documentation, support process, pricing/billing, and a tested onboarding flow.

## Definition of a credible launch demo

1. Browser-test an authorized site.
2. Capture a reproducible failure with evidence.
3. Produce a diagnosis with confidence and clear uncertainty.
4. Create an internal ticket with acceptance criteria.
5. Review the diagnosis as useful/partly correct/incorrect.
6. Show that feedback changes confidence on a later matching finding.
7. Demonstrate that no code was changed and no fix is called verified unless a real isolated regression run passes.

**Launch policy:** A successful CI run is necessary but not sufficient. Until the public-launch blockers are completed, the appropriate label is *invite-only preview*, not a fully autonomous production QA platform.
