import test from 'node:test';
import assert from 'node:assert/strict';

test('GlitchFix package metadata is valid', async () => {
  const pkg = await import('../package.json', { with: { type: 'json' } });
  assert.equal(pkg.default.name, 'glitchfix-beta');
  assert.equal(typeof pkg.default.scripts.start, 'string');
  assert.equal(typeof pkg.default.scripts.test, 'string');
});

test('dashboard contains GlitchFix branding and test actions', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /GlitchFix/);
  assert.match(html, /Run Demo Test/);
  assert.match(html, /Inspect GitHub Repository/);
});
