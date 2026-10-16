import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseWithOpenAI } from '../ai-diagnosis.js';

const validOutput = {
  summary: 'One issue requires review.',
  diagnoses: [{
    check: 'HTTP response', agent: 'reliability', severity: 'medium',
    likelyCause: 'The service returned an unexpected response.',
    recommendation: 'Reproduce and inspect server logs.',
    confidence: 0.7, evidenceNeeded: ['Response headers']
  }],
  ticketSuggestions: [{
    title: 'Investigate response status', severity: 'medium',
    description: 'Confirm expected response contract.',
    acceptanceCriteria: ['Reproduce', 'Add regression test']
  }]
};

test('AI diagnosis sends bounded evidence and parses strict structured output', async () => {
  let requestBody;
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(validOutput) }] }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await diagnoseWithOpenAI({
    apiKey: 'test-key',
    model: 'test-model',
    results: [{ name: 'Browser screenshot', status: 'passed', detail: 'Captured.', evidence: { dataUrl: 'data:image/jpeg;base64,secret-large-payload', status: 200 } }],
    feedback: [{ label: 'useful', note: 'Helpful', ticketTitle: 'HTTP response' }],
    fetchImpl
  });
  assert.equal(result.model, 'test-model');
  assert.equal(result.verified, false);
  assert.equal(result.diagnoses[0].confidence, 0.7);
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.text.format.type, 'json_schema');
  assert.ok(!requestBody.input.includes('secret-large-payload'));
  assert.ok(requestBody.input.includes('HTTP response'));
});

test('AI diagnosis rejects malformed provider output', async () => {
  await assert.rejects(() => diagnoseWithOpenAI({
    apiKey: 'test-key',
    results: [],
    fetchImpl: async () => new Response(JSON.stringify({ status: 'completed', output: [] }), { status: 200 })
  }), /invalid structured output/i);
});

test('AI diagnosis reports provider HTTP errors without leaking credentials', async () => {
  await assert.rejects(() => diagnoseWithOpenAI({
    apiKey: 'secret-test-key',
    results: [],
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 })
  }), /HTTP 429: quota exceeded/i);
});
