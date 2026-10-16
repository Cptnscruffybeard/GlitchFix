import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(root, 'public');
const dataDir = process.env.GLITCHFIX_DATA_DIR || join(root, 'data');
const statePath = join(dataDir, 'state.json');
const port = Number(process.env.PORT || 3000);
const state = { runs: [], projects: [] };
const securityHeaders = { 'x-content-type-options':'nosniff', 'x-frame-options':'DENY', 'referrer-policy':'no-referrer', 'permissions-policy':'camera=(), microphone=(), geolocation=()', 'cache-control':'no-store' };\nconst json = (res, status, value) => { res.writeHead(status, { ...securityHeaders, 'content-type':'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
async function loadState() { try { const saved = JSON.parse(await readFile(statePath,'utf8')); state.runs = saved.runs || []; state.projects = saved.projects || []; } catch {} }
async function saveState() { await mkdir(dataDir,{recursive:true}); await writeFile(statePath,JSON.stringify(state,null,2)); }
function privateIp(ip) {
  if (net.isIPv4(ip)) { const a=ip.split('.').map(Number); return a[0]===10 || a[0]===127 || a[0]===0 || a[0]===169&&a[1]===254 || a[0]===172&&a[1]>=16&&a[1]<=31 || a[0]===192&&a[1]===168 || a[0]>=224 || a[0]===100&&a[1]>=64&&a[1]<=127; }
  if (net.isIPv6(ip)) { const x=ip.toLowerCase(); return x==='::1'||x==='::'||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('fe80:')||x.startsWith('::ffff:127.')||x.startsWith('::ffff:10.'); }
  return true;
}
async function safeUrl(raw) {
  let u; try { u = new URL(raw); } catch { throw Error('Enter a valid absolute URL.'); }
  if (!['http:','https:'].includes(u.protocol)) throw Error('Only HTTP and HTTPS URLs are allowed.');
  if (u.username || u.password) throw Error('URLs containing credentials are blocked.');
  if (u.hostname==='localhost' || u.hostname.endsWith('.localhost') || u.hostname.endsWith('.local')) throw Error('Local hostnames are blocked.');
  if (net.isIP(u.hostname)) { if (privateIp(u.hostname)) throw Error('Private or reserved IP addresses are blocked.'); }
  else {
    let rows; try { rows = await dns.lookup(u.hostname,{all:true,verbatim:true}); } catch { throw Error('Host could not be resolved.'); }
    if (!rows.length || rows.some(x=>privateIp(x.address))) throw Error('Host resolves to a private or reserved address.');
  }
  return u;
}
async function request(raw, method='GET') {
  const u = await safeUrl(raw);
  const abort = AbortSignal.timeout(9000);
  return fetch(u,{method,redirect:'manual',signal:abort,headers:{'user-agent':'GlitchFix-Beta/0.3 authorized-qa-checks'}});
}
const check = (name,status,detail,evidence={}) => ({name,status,detail,evidence});
function investigate(results) {
  const failed=results.filter(x=>x.status==='failed'||x.status==='error');
  return { summary: failed.length ? `${failed.length} issue(s) need review.` : 'No failures detected in this run.', findings: failed.map(x=>({check:x.name,likelyCause:x.detail,proposedFix:x.name.toLowerCase().includes('https')?'Review TLS and redirect configuration.':'Inspect the failing response and reproduce in a controlled test.',verified:false})), note:'Fixes are proposals only. Rerunning checks does not verify a code patch.' };
}
async function runChecks(kind, body={}) {
  const results=[];
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
    const meta=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,{headers:{'user-agent':'GlitchFix-Beta/0.2','accept':'application/vnd.github+json'},signal:AbortSignal.timeout(9000)});
    if(!meta.ok) throw Error(`GitHub metadata request returned HTTP ${meta.status}.`);
    const info=await meta.json(); results.push(check('Repository accessible','passed',`Public repository found: ${info.full_name}.`,{stars:info.stargazers_count,defaultBranch:info.default_branch}));
    const raw=await fetch(`https://raw.githubusercontent.com/${owner}/${name}/${info.default_branch}/package.json`,{headers:{'user-agent':'GlitchFix-Beta/0.2'},signal:AbortSignal.timeout(9000)});
    if(!raw.ok) results.push(check('package.json manifest','failed','No package.json found on the default branch.'));
    else { let pkg; try {pkg=await raw.json();} catch {throw Error('package.json exists but is invalid JSON.');} results.push(check('package.json parses','passed',`Parsed ${pkg.name||'unnamed package'}.`)); for(const s of ['test','lint','build']) results.push(check(`Script: ${s}`,pkg.scripts&&pkg.scripts[s]?'passed':'failed',pkg.scripts&&pkg.scripts[s]?'Script is defined.':'No matching npm script is defined.')); }
  }
  return results;
}
async function bodyOf(req) { let s=''; for await (const chunk of req) { s+=chunk; if(s.length>100000) throw Error('Request body too large.'); } return s?JSON.parse(s):{}; }
const app = http.createServer(async (req,res) => {
  try {
    const u=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&u.pathname==='/api/health') return json(res,200,{status:'ok',app:'GlitchFix',version:'0.3.0'});
    if(req.method==='GET'&&u.pathname==='/api/runs') return json(res,200,{runs:state.runs.slice(0,50),projects:state.projects});
    if(req.method==='POST'&&u.pathname==='/api/run') {
      const b=await bodyOf(req); const kind=['demo','site','api','repo'].includes(b.kind)?b.kind:'demo'; const started=Date.now();
      let results; try { results=await runChecks(kind,b); } catch(e) { results=[check('Run setup','error',e.message)]; }
      const inv=investigate(results); const input={url:String(b.url||''),path:String(b.path||'/api/health'),expectedStatus:Number(b.expectedStatus||200),expectedJsonKey:String(b.expectedJsonKey||''),method:String(b.method||'GET')};\n      const run={id:crypto.randomUUID(),kind,target:b.url||'GlitchFix demo fixture',input,createdAt:new Date().toISOString(),durationMs:Date.now()-started,results,investigation:inv};
      state.runs.unshift(run); state.runs=state.runs.slice(0,100); await saveState(); return json(res,200,{run});
    }
    if(req.method==='POST'&&u.pathname==='/api/projects') { const b=await bodyOf(req); if(!String(b.name||'').trim()) return json(res,400,{error:'Project name is required.'}); const p={id:crypto.randomUUID(),name:String(b.name).slice(0,100),url:String(b.url||'').slice(0,2000),createdAt:new Date().toISOString()}; state.projects.unshift(p); await saveState(); return json(res,201,{project:p}); }
    if(req.method==='POST'&&u.pathname==='/api/verify') { const b=await bodyOf(req); const old=state.runs.find(x=>x.id===b.runId); if(!old) return json(res,404,{error:'Run not found.'}); const rerun=await runChecks(old.kind,old.input||{url:old.target}); const inv=investigate(rerun); const run={id:crypto.randomUUID(),kind:old.kind,target:old.target,input:old.input||{url:old.target},createdAt:new Date().toISOString(),results:rerun,investigation:inv,verificationNote:'Checks rerun only; no patch was applied or verified.'}; state.runs.unshift(run); await saveState(); return json(res,200,{run}); }
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
app.listen(port,'0.0.0.0',()=>console.log(`GlitchFix Beta 0.2.0 listening on ${port}`));
