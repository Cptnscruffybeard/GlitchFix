import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { runAgentPipeline } from './agents.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(root, 'public');
const dataDir = process.env.GLITCHFIX_DATA_DIR || join(root, 'data');
const statePath = join(dataDir, 'state.json');
const port = Number(process.env.PORT || 3000);
const apiToken = process.env.GLITCHFIX_API_TOKEN || '';
const rateWindows = new Map();
const state = { runs: [], projects: [], tickets: [], feedback: [] };
const securityHeaders = { 'x-content-type-options':'nosniff', 'x-frame-options':'DENY', 'referrer-policy':'no-referrer', 'permissions-policy':'camera=(), microphone=(), geolocation=()', 'cross-origin-resource-policy':'same-origin', 'x-permitted-cross-domain-policies':'none', 'content-security-policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'", 'cache-control':'no-store' };
const json = (res, status, value) => { res.writeHead(status, { ...securityHeaders, 'content-type':'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
async function loadState() { try { const saved = JSON.parse(await readFile(statePath,'utf8')); state.runs = saved.runs || []; state.projects = saved.projects || []; state.tickets = saved.tickets || []; state.feedback = saved.feedback || []; } catch {} }
async function saveState() { await mkdir(dataDir,{recursive:true}); await writeFile(statePath,JSON.stringify(state,null,2)); }
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const a=ip.split('.').map(Number);
    return a[0]===0 || a[0]===10 || a[0]===127 || a[0]>=224 ||
      (a[0]===100&&a[1]>=64&&a[1]<=127) ||
      (a[0]===169&&a[1]===254) ||
      (a[0]===172&&a[1]>=16&&a[1]<=31) ||
      (a[0]===192&&(a[1]===0||a[1]===2||a[1]===168)) ||
      (a[0]===192&&a[1]===88&&a[2]===99) ||
      (a[0]===198&&(a[1]===18||a[1]===19||a[1]===51&&a[2]===100)) ||
      (a[0]===203&&a[1]===0&&a[2]===113);
  }
  if (net.isIPv6(ip)) {
    const x=ip.toLowerCase();
    const first=parseInt(x.split(':')[0]||'0',16);
    return x==='::1'||x==='::'||x.startsWith('::ffff:')||
      x.startsWith('fc')||x.startsWith('fd')||
      /^fe[89ab]/.test(x)||x.startsWith('ff')||
      x.startsWith('2001:db8:')||!(first>=0x2000&&first<=0x3fff);
  }
  return true;
}
async function safeUrl(raw) {
  let u; try { u = new URL(raw); } catch { throw Error('Enter a valid absolute URL.'); }
  if (!['http:','https:'].includes(u.protocol)) throw Error('Only HTTP and HTTPS URLs are allowed.');
  if (u.username || u.password) throw Error('URLs containing credentials are blocked.');
  const allowLocal = process.env.GLITCHFIX_ALLOW_LOCAL_TEST_TARGETS === '1';
  if (u.hostname==='localhost' || u.hostname.endsWith('.localhost') || u.hostname.endsWith('.local')) { if(!allowLocal) throw Error('Local hostnames are blocked.'); else return u; }
  if (net.isIP(u.hostname)) { if (privateIp(u.hostname) && !allowLocal) throw Error('Private or reserved IP addresses are blocked.'); }
  else {
    let rows; try { rows = await dns.lookup(u.hostname,{all:true,verbatim:true}); } catch { throw Error('Host could not be resolved.'); }
    if (!rows.length || rows.some(x=>privateIp(x.address))) throw Error('Host resolves to a private or reserved address.');
  }
  return u;
}
async function request(raw, method='GET') {
  const u = await safeUrl(raw);
  const abort = AbortSignal.timeout(9000);
  return fetch(u,{method,redirect:'manual',signal:abort,headers:{'user-agent':'GlitchFix-Beta/0.4 authorized-qa-checks'}});
}
const check = (name,status,detail,evidence={}) => ({name,status,detail,evidence});
function investigate(results, context={}) { return runAgentPipeline(results, context); }
async function runBrowserChecks(rawUrl) {
  const target=await safeUrl(rawUrl);
  return await new Promise((resolvePromise,rejectPromise)=>{
    const child=spawn(process.execPath,[join(root,'browser-worker.js')],{env:process.env,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',finished=false;
    const timer=setTimeout(()=>{child.kill('SIGKILL');if(!finished){finished=true;rejectPromise(Error('Browser test timed out after 35 seconds.'));}},35000);
    child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>3_000_000)child.kill('SIGKILL');});
    child.stderr.on('data',chunk=>{stderr+=chunk.toString().slice(0,3000);});
    child.on('error',error=>{clearTimeout(timer);if(!finished){finished=true;rejectPromise(error);}});
    child.on('close',code=>{clearTimeout(timer);if(finished)return;finished=true;let data;try{data=JSON.parse(stdout);}catch{rejectPromise(Error('Browser worker returned invalid output. '+stderr.slice(0,500)));return;}if(code!==0||data.error){rejectPromise(Error(data.error||'Browser worker failed. '+stderr.slice(0,500)));return;}resolvePromise(data.results);});
    child.stdin.end(JSON.stringify({url:target.href}));
  });
}

async function runChecks(kind, body={}) {
  const results=[];
  if (kind==='browser') return await runBrowserChecks(body.url);
  if (kind==='demo') return [
    check('Landing page loads','passed','Demo fixture returned a page.'),
    check('Missing content security policy','failed','Content-Security-Policy header is missing.'),
    check('API health response','passed','Expected HTTP 200 response.'),
    check('Leaked debug information','failed','Demo fixture exposes a stack trace.'),
    check('HTTPS transport','passed','Demo fixture uses HTTPS.')
  ];
  if (kind==='site') {
    const u=await safeUrl(body.url);
    const r=await request(u.href);
    results.push(check('HTTP response',r.status>=200&&r.status<400?'passed':'failed',`Received HTTP ${r.status}.`,{status:r.status,finalUrl:u.origin+u.pathname}));
    const ct=r.headers.get('content-type')||'';
    results.push(check('Content type',ct?'passed':'failed',ct||'Content-Type header missing.',{contentType:ct}));
    for (const [header,label] of [['content-security-policy','Content-Security-Policy'],['x-content-type-options','X-Content-Type-Options'],['strict-transport-security','Strict-Transport-Security']]) {
      const value=r.headers.get(header); const skip=header==='strict-transport-security'&&u.protocol!=='https:';
      results.push(check(label,skip?'skipped':value?'passed':'failed',skip?'Only meaningful over HTTPS.':value?'Header present.':'Security header missing.',{value:value||null}));
    }
  } else if (kind==='api') {
    const base=await safeUrl(body.url); const target=new URL(body.path||'/api/health',base);
    if (target.origin!==base.origin) throw Error('API path must stay on the same origin as the base URL.');
    const method=['GET','HEAD','OPTIONS'].includes(body.method)?body.method:'GET';
    const r=await request(target.href,method); const expected=Number(body.expectedStatus||200);
    results.push(check('API HTTP status',r.status===expected?'passed':'failed',`Expected ${expected}; received ${r.status}.`,{status:r.status,method}));
    const ct=r.headers.get('content-type')||'';
    results.push(check('API content type',ct.includes('json')?'passed':'failed',ct||'Content-Type header missing.',{contentType:ct}));
    if (body.expectedJsonKey&&method!=='HEAD'&&ct.includes('json')) { let data; try { data=await r.json(); } catch {} const found=data&&Object.hasOwn(data,body.expectedJsonKey); results.push(check('JSON key: '+body.expectedJsonKey,found?'passed':'failed',found?'Expected top-level key found.':'Expected top-level JSON key missing.')); }
  } else if (kind==='repo') {
    const m=String(body.url||'').match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/i);
    if(!m) throw Error('Use a public GitHub repository URL like https://github.com/owner/repo.');
    const owner=m[1], name=m[2].replace(/\.git$/,'');
    const meta=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,{headers:{'user-agent':'GlitchFix-Beta/0.4','accept':'application/vnd.github+json'},signal:AbortSignal.timeout(9000)});
    if(!meta.ok) throw Error(`GitHub metadata request returned HTTP ${meta.status}.`);
    const info=await meta.json(); results.push(check('Repository accessible','passed',`Public repository found: ${info.full_name}.`,{stars:info.stargazers_count,defaultBranch:info.default_branch}));
    const raw=await fetch(`https://raw.githubusercontent.com/${owner}/${name}/${info.default_branch}/package.json`,{headers:{'user-agent':'GlitchFix-Beta/0.4'},signal:AbortSignal.timeout(9000)});
    if(!raw.ok) results.push(check('package.json manifest','failed','No package.json found on the default branch.'));
    else { let pkg; try {pkg=await raw.json();} catch {throw Error('package.json exists but is invalid JSON.');} results.push(check('package.json parses','passed',`Parsed ${pkg.name||'unnamed package'}.`)); for(const s of ['test','lint','build']) results.push(check(`Script: ${s}`,pkg.scripts&&pkg.scripts[s]?'passed':'failed',pkg.scripts&&pkg.scripts[s]?'Script is defined.':'No matching npm script is defined.')); }
  }
  return results;
}
async function bodyOf(req) { let s=''; for await (const chunk of req) { s+=chunk; if(s.length>100000) throw Error('Request body too large.'); } return s?JSON.parse(s):{}; }
const app = http.createServer(async (req,res) => {
  try {
    const u=new URL(req.url,'http://localhost');
    if (u.pathname.startsWith('/api/') && !(req.method==='GET' && u.pathname==='/api/health')) {
      if (process.env.NODE_ENV==='production' && !apiToken) return json(res,503,{error:'API is locked: configure GLITCHFIX_API_TOKEN before enabling production access.'});
      if (apiToken && req.headers.authorization !== 'Bearer '+apiToken) return json(res,401,{error:'Unauthorized. Enter the configured GlitchFix access token.'});
      const now=Date.now(), key=req.socket.remoteAddress||'unknown'; let window=rateWindows.get(key);
      if (!window || now-window.startedAt>=60000) window={startedAt:now,count:0}; window.count++; rateWindows.set(key,window);
      if (rateWindows.size>5000) for (const [ip,item] of rateWindows) if (now-item.startedAt>=60000) rateWindows.delete(ip);
      if (window.count>120) return json(res,429,{error:'Rate limit exceeded. Wait one minute before trying again.'});
    }
    if(req.method==='GET'&&u.pathname==='/api/health') return json(res,200,{status:'ok',app:'GlitchFix',version:'0.4.0'});
    if(req.method==='GET'&&u.pathname==='/api/runs') return json(res,200,{runs:state.runs.slice(0,50),projects:state.projects});
    if(req.method==='GET'&&u.pathname==='/api/agents') return json(res,200,{agents:[{name:'Triage Agent',role:'Severity and prioritization'},{name:'Security Agent',role:'Security-related findings'},{name:'Reliability Agent',role:'Availability and response contracts'},{name:'Root-Cause Agent',role:'Hypothesis generation from evidence'},{name:'Ticket Agent',role:'Draft actionable tickets'}],mode:'deterministic-multi-agent',disclaimer:'Rule-based specialist passes, not trained AI models.'});
    if(req.method==='GET'&&u.pathname==='/api/tickets') return json(res,200,{tickets:state.tickets.slice(0,200)});
    if(req.method==='GET'&&u.pathname==='/api/feedback') return json(res,200,{feedbackCount:state.feedback.length,labels:Object.fromEntries(['useful','incorrect','partially-correct'].map(label=>[label,state.feedback.filter(item=>item.label===label).length])),feedback:state.feedback.slice(0,100)});
    if(req.method==='POST'&&/^\/api\/tickets\/[^/]+\/feedback$/.test(u.pathname)) { const parts=u.pathname.split('/'); const id=decodeURIComponent(parts[3]); const b=await bodyOf(req); if(!['useful','incorrect','partially-correct'].includes(b.label)) return json(res,400,{error:'Feedback label must be useful, incorrect, or partially-correct.'}); const ticket=state.tickets.find(x=>x.id===id); if(!ticket) return json(res,404,{error:'Ticket not found.'}); const entry={id:crypto.randomUUID(),ticketId:id,runId:ticket.runId,label:b.label,note:String(b.note||'').slice(0,1000),createdAt:new Date().toISOString()}; state.feedback.unshift(entry); state.feedback=state.feedback.slice(0,1000); ticket.feedbackLabel=b.label; ticket.feedbackAt=entry.createdAt; await saveState(); return json(res,201,{feedback:entry,ticket}); }
    if(req.method==='POST'&&u.pathname.startsWith('/api/tickets/')) { const id=decodeURIComponent(u.pathname.slice('/api/tickets/'.length)); const b=await bodyOf(req); const ticket=state.tickets.find(x=>x.id===id); if(!ticket) return json(res,404,{error:'Ticket not found.'}); if(!['open','in-progress','resolved','wont-fix'].includes(b.status)) return json(res,400,{error:'Status must be open, in-progress, resolved, or wont-fix.'}); ticket.status=b.status; ticket.updatedAt=new Date().toISOString(); await saveState(); return json(res,200,{ticket}); }
    if(req.method==='POST'&&u.pathname==='/api/run') {
      const b=await bodyOf(req); const kind=['demo','site','api','repo','browser'].includes(b.kind)?b.kind:'demo'; const started=Date.now();
      let results; try { results=await runChecks(kind,b); } catch(e) { results=[check('Run setup','error',e.message)]; }
      const inv=investigate(results,{kind,target:b.url||'GlitchFix demo fixture'}); const input={url:String(b.url||''),path:String(b.path||'/api/health'),expectedStatus:Number(b.expectedStatus||200),expectedJsonKey:String(b.expectedJsonKey||''),method:String(b.method||'GET')};
      const run={id:crypto.randomUUID(),kind,target:b.url||'GlitchFix demo fixture',input,createdAt:new Date().toISOString(),durationMs:Date.now()-started,results,investigation:inv};
      state.runs.unshift(run); state.runs=state.runs.slice(0,100);
      for (const draft of inv.tickets || []) state.tickets.unshift({id:crypto.randomUUID(),runId:run.id,target:run.target,createdAt:run.createdAt,...draft});
      state.tickets=state.tickets.slice(0,300); await saveState(); return json(res,200,{run});
    }
    if(req.method==='POST'&&u.pathname==='/api/projects') { const b=await bodyOf(req); if(!String(b.name||'').trim()) return json(res,400,{error:'Project name is required.'}); const p={id:crypto.randomUUID(),name:String(b.name).slice(0,100),url:String(b.url||'').slice(0,2000),createdAt:new Date().toISOString()}; state.projects.unshift(p); await saveState(); return json(res,201,{project:p}); }
    if(req.method==='POST'&&u.pathname==='/api/verify') { const b=await bodyOf(req); const old=state.runs.find(x=>x.id===b.runId); if(!old) return json(res,404,{error:'Run not found.'}); const rerun=await runChecks(old.kind,old.input||{url:old.target}); const inv=investigate(rerun,{kind:old.kind,target:old.target}); const run={id:crypto.randomUUID(),kind:old.kind,target:old.target,input:old.input||{url:old.target},createdAt:new Date().toISOString(),results:rerun,investigation:inv,verificationNote:'Checks rerun only; no patch was applied or verified.'}; state.runs.unshift(run); state.runs=state.runs.slice(0,100); for (const draft of inv.tickets || []) state.tickets.unshift({id:crypto.randomUUID(),runId:run.id,target:run.target,createdAt:run.createdAt,...draft}); state.tickets=state.tickets.slice(0,300); await saveState(); return json(res,200,{run}); }
    if(req.method==='GET') {
      const path=resolve(publicDir,'.'+decodeURIComponent(u.pathname)); if(path!==publicDir&&!path.startsWith(publicDir+ (process.platform==='win32'?'\\\\':'/'))) return json(res,403,{error:'Forbidden'});
      const file=path===publicDir?join(publicDir,'index.html'):path;
      if(!existsSync(file)) return json(res,404,{error:'Not found'});
      const ext=file.split('.').pop(); res.writeHead(200,{...securityHeaders,'content-type':ext==='html'?'text/html; charset=utf-8':ext==='css'?'text/css':'text/javascript; charset=utf-8'}); return res.end(await readFile(file));
    }
    return json(res,404,{error:'Not found'});
  } catch(e) { return json(res,400,{error:e.message||'Request failed.'}); }
});
await loadState();
app.listen(port,'0.0.0.0',()=>console.log(`GlitchFix Beta 0.4.0 listening on ${port}`));
