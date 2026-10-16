import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GlitchFix package metadata is valid', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.name, 'glitchfix-beta');
  assert.equal(typeof pkg.scripts.start, 'string');
  assert.equal(typeof pkg.scripts.test, 'string');
});

test('dashboard contains GlitchFix branding and test actions', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /GlitchFix/);
  assert.match(html, /Run Demo Test/);
  assert.match(html, /Inspect GitHub Repository/);\n  assert.match(html, /Rerun checks/);
});
