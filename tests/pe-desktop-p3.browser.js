/* P3 follow-up: at 1440 the countdown chip is the only visible refresh control.
   #rail-refresh must stay display:none even though #rail .rail-foot button is display:grid !important.
   Run: node tests/pe-desktop-p3.browser.js */
require('./helpers/block-production-writer.cjs');
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path'),http=require('http');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');

(async()=>{
  const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const vp={width:1440,height:900};
  const ctx=await browser.newContext({viewport:vp}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
  await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
  await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');return r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:a==='writer_status'?{ok:true,level:'ok',warnings:[],queue:{processing:[]}}:{ok:true}})});
  await page.goto(base+'/pipeline.html?src=writer&open=jobs');
  await page.waitForSelector('#rail');
  const shot=await page.evaluate(()=>{
    const vis=e=>{if(!e)return {exists:false,visible:false};const s=getComputedStyle(e),b=e.getBoundingClientRect();const visible=!!(b.width>0&&b.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0');return {exists:true,id:e.id||'',text:(e.textContent||'').replace(/\s+/g,' ').trim().slice(0,80),display:s.display,visibility:s.visibility,w:b.width,h:b.height,visible}};
    const headerRefresh=vis(document.getElementById('refresh'));
    const railRefresh=vis(document.getElementById('rail-refresh'));
    const chips=[...document.querySelectorAll('header [data-refresh-now], header [aria-label="Refresh now"]')].map(vis);
    const visibleRefresh=[headerRefresh,railRefresh,...chips].filter(x=>x.visible);
    return {headerRefresh,railRefresh,chips,visibleRefresh,docW:document.documentElement.clientWidth};
  });
  assert.equal(shot.docW,1440,'viewport is 1440');
  assert.equal(shot.railRefresh.display,'none','#rail-refresh display is none, got '+JSON.stringify(shot.railRefresh));
  assert.equal(shot.railRefresh.visible,false,'#rail-refresh is not visible');
  assert.equal(shot.headerRefresh.visible,false,'header #refresh is not visible, got '+JSON.stringify(shot.headerRefresh));
  assert.ok(shot.chips.some(c=>c.visible),'the countdown chip is visible, got '+JSON.stringify(shot.chips));
  assert.equal(shot.visibleRefresh.length,1,'exactly one refresh control is visible at 1440, got '+JSON.stringify(shot.visibleRefresh));
  assert.deepEqual(errors,[],'no page errors');
  await browser.close();server.close();
  console.log('pe-desktop-p3 browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
