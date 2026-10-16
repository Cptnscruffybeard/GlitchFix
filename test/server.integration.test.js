import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

let server;
let base;
let dataDir;

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

before(async () => {
  const port = await freePort();
  dataDir = await mkdtemp(join(tmpdir(), 'glitchfix-test-'));
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [new URL('../server.js', import.meta.url).pathname], {
    env: { ...process.env, PORT: String(port), GLITCHFIX_DATA_DIR: dataDir },
    stdio: 'ignore'
  });
  let ready = false;
  for (let i = 0; i < 50; i++) {
    if (server.exitCode !== null) throw new Error('GlitchFix server exited before startup');
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('GlitchFix server did not become ready');
});

after(async () => {
  if (server && server.exitCode === null) server.kill('SIGTERM');
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test('health endpoint returns version and security headers', async () => {
  const response = await fetch(`${base}/api/health`);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.app, 'GlitchFix');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});

test('demo run is saved and appears in history', async () => {
  const response = await fetch(`${base}/api/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'demo' })
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.run.kind, 'demo');
  assert.ok(data.run.results.some(item => item.status === 'failed'));
  const history = await fetch(`${base}/api/runs`).then(r => r.json());
  assert.equal(history.runs[0].id, data.run.id);
  assert.equal(data.run.investigation.agents.length, 5);
  const tickets = await fetch(`${base}/api/tickets`).then(r => r.json());
  assert.ok(tickets.tickets.length >= 1);
  assert.equal(tickets.tickets[0].runId, data.run.id);
});

test('saved project requires a name and can be created', async () => {
  const bad = await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: ' ' })
  });
  assert.equal(bad.status, 400);
  const good = await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Integration test project', url: 'https://example.com' })
  });
  assert.equal(good.status, 201);
  assert.equal((await good.json()).project.name, 'Integration test project');
});

test('demo rerun workflow works and clearly does not claim patch verification', async () => {
  const first = await fetch(`${base}/api/run`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'demo' })
  }).then(r => r.json());
  const response = await fetch(`${base}/api/verify`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: first.run.id })
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.run.kind, 'demo');
  assert.match(data.run.verificationNote, /no patch was applied or verified/i);
});

test('unknown verification run returns 404', async () => {
  const response = await fetch(`${base}/api/verify`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: 'missing' })
  });
  assert.equal(response.status, 404);
});

test('agent catalogue is transparent about rule-based behavior', async () => {
  const response = await fetch(`${base}/api/agents`);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.agents.length, 5);
  assert.match(data.disclaimer, /not trained AI models/i);
});

test('ticket status can only be changed to an allowed value', async () => {
  const created = await fetch(`${base}/api/run`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'demo' })
  }).then(r => r.json());
  const listed = await fetch(`${base}/api/tickets`).then(r => r.json());
  const ticket = listed.tickets.find(item => item.runId === created.run.id);
  assert.ok(ticket);
  const bad = await fetch(`${base}/api/tickets/${ticket.id}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'delete-everything' })
  });
  assert.equal(bad.status, 400);
});

test('human feedback is validated and retained as review data', async () => {
  const created = await fetch(`${base}/api/run`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'demo' })
  }).then(r => r.json());
  const listed = await fetch(`${base}/api/tickets`).then(r => r.json());
  const ticket = listed.tickets.find(item => item.runId === created.run.id);
  assert.ok(ticket);
  const response = await fetch(`${base}/api/tickets/${ticket.id}/feedback`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'partially-correct', note: 'Test review' })
  });
  const data = await response.json();
  assert.equal(response.status, 201);
  assert.equal(data.feedback.label, 'partially-correct');
  const summary = await fetch(`${base}/api/feedback`).then(r => r.json());
  assert.ok(summary.feedbackCount >= 1);
});
