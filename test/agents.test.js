import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentPipeline } from '../agents.js';

test('agent pipeline prioritizes failures and drafts actionable tickets', () => {
  const result = runAgentPipeline([
    { name: 'Content-Security-Policy', status: 'failed', detail: 'Content-Security-Policy header is missing.' },
    { name: 'HTTP response', status: 'passed', detail: 'Received HTTP 200.' },
    { name: 'Leaked debug information', status: 'failed', detail: 'Demo fixture exposes a stack trace.' }
  ], { kind: 'demo', target: 'fixture' });

  assert.equal(result.mode, 'deterministic-multi-agent');
  assert.equal(result.agents.length, 5);
  assert.equal(result.findings.length, 2);
  assert.equal(result.tickets.length, 2);
  assert.equal(result.severityCounts.critical, 1);
  assert.ok(result.findings.every(item => item.verified === false));
  assert.match(result.disclaimer, /not trained or autonomous AI models/i);
});

test('agent pipeline handles a clean run without inventing failures', () => {
  const result = runAgentPipeline([{ name: 'Health', status: 'passed', detail: 'HTTP 200.' }]);
  assert.equal(result.findings.length, 0);
  assert.equal(result.tickets.length, 0);
  assert.match(result.summary, /No failed checks/);
});
