const SECURITY_TERMS = /security|content-security-policy|tls|https|certificate|x-frame-options|x-content-type-options|leak|secret|expos|cors|auth/i;
const RELIABILITY_TERMS = /http response|api http status|timeout|content type|package\.json|script:|health|network|availability/i;

function severityFor(result) {
  const text = `${result.name} ${result.detail}`;
  if (/secret|credential|stack trace|debug information|private key/i.test(text)) return 'critical';
  if (SECURITY_TERMS.test(text)) return 'high';
  if (RELIABILITY_TERMS.test(text)) return 'medium';
  return 'low';
}

function adviceFor(result) {
  const text = `${result.name} ${result.detail}`.toLowerCase();
  if (/content-security-policy/.test(text)) return 'Define a restrictive Content-Security-Policy, test required scripts/styles, then validate with a browser security scan.';
  if (/strict-transport-security|https|tls|certificate/.test(text)) return 'Check HTTPS certificate validity, redirect policy, and TLS configuration; verify from an external client.';
  if (/x-content-type-options/.test(text)) return 'Return X-Content-Type-Options: nosniff on all relevant responses.';
  if (/stack trace|debug information|leak/.test(text)) return 'Disable production debug output and remove sensitive details from client-visible errors; add a regression test.';
  if (/content type/.test(text)) return 'Return the correct Content-Type for the response body and add a contract test.';
  if (/api http status|http response/.test(text)) return 'Reproduce the request with the captured method, URL, and expected status; inspect server logs and add a regression test.';
  if (/script:/.test(text)) return 'Add the missing package script if required, then run it in CI to verify it works rather than only checking that it exists.';
  if (/package\.json/.test(text)) return 'Verify the manifest exists at the expected path and parses as valid JSON.';
  return 'Reproduce this finding, capture relevant logs and request/response evidence, then add a regression test before changing code.';
}

function agent(name, role, findings) {
  return { name, role, findings };
}

export function runAgentPipeline(results, context = {}) {
  const failed = results.filter(item => ['failed', 'error'].includes(item.status));
  const priorTickets = Array.isArray(context.tickets) ? context.tickets : [];
  const feedback = Array.isArray(context.feedback) ? context.feedback : [];
  const priorLabel = item => { const ticket=priorTickets.find(t=>String(t.title||'').endsWith(item.name)&&t.feedbackLabel); return ticket ? { label:ticket.feedbackLabel, count:feedback.filter(f=>f.ticketId===ticket.id).length } : null; };
  const confidenceFor = item => { const prior=priorLabel(item); return prior?.label==='incorrect'?0.4:prior?.label==='useful'?0.78:prior?.label==='partially-correct'?0.58:0.65; };
  const security = failed.filter(item => SECURITY_TERMS.test(`${item.name} ${item.detail}`));
  const reliability = failed.filter(item => RELIABILITY_TERMS.test(`${item.name} ${item.detail}`));
  const agents = [
    agent('Triage Agent', 'Prioritizes failed checks and separates observed evidence from assumptions.', failed.map(item => ({
      check: item.name, severity: severityFor(item), evidence: item.evidence || {}, observed: item.detail,
      confidence: 0.92, status: 'needs-human-review'
    }))),
    agent('Security Agent', 'Reviews security-related findings; it does not perform penetration testing.', security.map(item => ({
      check: item.name, severity: severityFor(item), observed: item.detail,
      recommendation: adviceFor(item), confidence: 0.82, status: 'needs-human-review'
    }))),
    agent('Reliability Agent', 'Reviews availability, response contracts, and build-manifest findings.', reliability.map(item => ({
      check: item.name, severity: severityFor(item), observed: item.detail,
      recommendation: adviceFor(item), confidence: 0.78, status: 'needs-human-review'
    }))),
    agent('Root-Cause Agent', 'Ranks likely causes using check names and evidence; conclusions are hypotheses.', failed.map(item => ({
      check: item.name, likelyCause: item.detail, nextStep: adviceFor(item),
      confidence: confidenceFor(item), priorFeedback: priorLabel(item), verified: false
    }))),
    agent('Ticket Agent', 'Creates actionable draft tickets from findings, without filing external tickets.', failed.map(item => ({
      title: `[${severityFor(item).toUpperCase()}] ${item.name}`.slice(0, 180),
      severity: severityFor(item), description: item.detail,
      acceptanceCriteria: ['Reproduce the issue reliably', 'Implement a scoped fix', 'Add a regression test', 'Rerun checks and attach evidence'],
      priorFeedback: priorLabel(item), status: 'open', source: 'GlitchFix'
    })))
  ];
  const uniqueFindings = failed.map(item => ({
    check: item.name, severity: severityFor(item), observed: item.detail,
    likelyCause: item.detail, proposedFix: adviceFor(item), confidence: 0.65,
    verified: false, evidence: item.evidence || {}
  }));
  const counts = Object.fromEntries(['critical','high','medium','low'].map(level => [level, uniqueFindings.filter(f => f.severity === level).length]));
  return {
    mode: 'deterministic-multi-agent',
    disclaimer: 'These are rule-based specialist passes, not trained or autonomous AI models. Root causes and fixes are hypotheses; nothing is patched or externally ticketed.',
    summary: failed.length ? `${failed.length} failed check(s) reviewed by ${agents.length} specialist agents.` : 'No failed checks to triage.',
    severityCounts: counts,
    agents,
    findings: uniqueFindings,
    tickets: agents.find(item => item.name === 'Ticket Agent').findings,
    learningSignals: { reviewedExamples: feedback.length, labels: Object.fromEntries(['useful','incorrect','partially-correct'].map(label=>[label,feedback.filter(item=>item.label===label).length])), method: 'reviewed-feedback-confidence-adjustment', modelTraining: false },
    context: { kind: String(context.kind || 'unknown'), target: String(context.target || '') }
  };
}
