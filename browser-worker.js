import { chromium } from 'playwright';
import dns from 'node:dns/promises';
import net from 'node:net';

function isPrivate(ip) {
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

const allowLocal = process.env.GLITCHFIX_ALLOW_LOCAL_TEST_TARGETS === '1';
const dnsCache = new Map();
async function validateRequestUrl(raw) {
  let u;
  try { u=new URL(raw); } catch { throw Error('Invalid request URL'); }
  if (['data:','blob:','about:'].includes(u.protocol)) return;
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password) throw Error('Blocked non-web or credential URL');
  const host=u.hostname.toLowerCase();
  const local=host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
    (net.isIP(host)&&isPrivate(host));
  if (local && allowLocal) return;
  if (local) throw Error('Blocked local or private network request');
  if (net.isIP(host)) { if(isPrivate(host)) throw Error('Blocked private IP'); return; }
  let rows=dnsCache.get(host);
  if (!rows) { rows=await dns.lookup(host,{all:true,verbatim:true}); dnsCache.set(host,rows); }
  if (!rows.length || rows.some(row=>isPrivate(row.address))) throw Error('Blocked host resolving to private or reserved IP');
}

async function main(input) {
  let browser;
  const consoleErrors=[], pageErrors=[], failedRequests=[], badResponses=[], blockedRequests=[];
  try {
    const target=new URL(String(input.url||''));
    await validateRequestUrl(target.href);
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1280,height:720},ignoreHTTPSErrors:false});
    const page=await context.newPage();
    page.setDefaultNavigationTimeout(15000);
    page.setDefaultTimeout(5000);
    page.on('console',msg=>{if(msg.type()==='error'&&consoleErrors.length<30)consoleErrors.push(msg.text().slice(0,500));});
    page.on('pageerror',err=>{if(pageErrors.length<30)pageErrors.push(String(err.message||err).slice(0,500));});
    page.on('requestfailed',req=>{if(failedRequests.length<30)failedRequests.push({url:req.url().slice(0,500),failure:req.failure()?.errorText||'request failed'});});
    page.on('response',res=>{if(res.status()>=400&&badResponses.length<30)badResponses.push({url:res.url().slice(0,500),status:res.status()});});
    await page.route('**/*',async route=>{
      try { await validateRequestUrl(route.request().url()); await route.continue(); }
      catch(error) { blockedRequests.push({url:route.request().url().slice(0,500),reason:error.message}); await route.abort('blockedbyclient'); }
    });
    const response=await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:15000});
    await page.waitForTimeout(750);
    const title=await page.title().catch(()=> '');
    const headingCount=await page.locator('h1').count().catch(()=>0);
    const screenshot=await page.screenshot({type:'jpeg',quality:45,fullPage:false,timeout:5000});
    const results=[
      {name:'Browser navigation',status:response&&response.status()<400?'passed':'failed',detail:response?('Received HTTP '+response.status()+'.'):'No main-document response.',evidence:{status:response?.status()||null,url:page.url(),title}},
      {name:'Page title',status:title.trim()?'passed':'failed',detail:title.trim()?'Page has a document title.':'Document title is empty.',evidence:{title}},
      {name:'Main heading',status:headingCount>0?'passed':'failed',detail:headingCount?'Found '+headingCount+' h1 heading(s).':'No h1 heading found.',evidence:{headingCount}},
      {name:'Browser console errors',status:consoleErrors.length?'failed':'passed',detail:consoleErrors.length?consoleErrors.length+' console error(s) captured.':'No console errors captured.',evidence:{items:consoleErrors}},
      {name:'Uncaught page errors',status:pageErrors.length?'failed':'passed',detail:pageErrors.length?pageErrors.length+' uncaught page error(s) captured.':'No uncaught page errors captured.',evidence:{items:pageErrors}},
      {name:'Failed network requests',status:failedRequests.length?'failed':'passed',detail:failedRequests.length?failedRequests.length+' failed request(s) captured.':'No failed requests captured.',evidence:{items:failedRequests}},
      {name:'HTTP error responses',status:badResponses.length?'failed':'passed',detail:badResponses.length?badResponses.length+' response(s) returned HTTP 400 or higher.':'No HTTP 400+ responses captured.',evidence:{items:badResponses}},
      {name:'Network safety filter',status:blockedRequests.length?'skipped':'passed',detail:blockedRequests.length?blockedRequests.length+' request(s) blocked by private-network filter.':'No private-network requests blocked.',evidence:{items:blockedRequests}},
      {name:'Viewport screenshot',status:'passed',detail:'Captured a 1280×720 viewport screenshot.',evidence:{dataUrl:'data:image/jpeg;base64,'+screenshot.toString('base64')}}
    ];
    return {results,meta:{title,url:page.url(),browser:'Chromium',blockedRequestCount:blockedRequests.length}};
  } finally {
    if(browser) await browser.close().catch(()=>{});
  }
}

let input='';
for await (const chunk of process.stdin) input+=chunk;
try {
  const result=await main(JSON.parse(input||'{}'));
  process.stdout.write(JSON.stringify(result));
} catch(error) {
  process.stdout.write(JSON.stringify({error:String(error.message||error).slice(0,1000)}));
  process.exitCode=1;
}
