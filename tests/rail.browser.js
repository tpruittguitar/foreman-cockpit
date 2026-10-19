/* RAIL-1 (Grok Bot, 2026-10-18 23:59 ET): the side rail must not move under the cursor. Icon size and position are identical
   collapsed, while the hover opens (+60 ms), once it has opened, and with keyboard focus; only the label column is revealed.
   Checked at 2560x1440 and 1440x900. L-1: inset 2 px focus ring, labels >= 11 px uppercase in both states.
   Run: node tests/rail.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for tests/mobile.browser.js) */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const TOL=0.5;

// every visible rail icon, plus the page frame around the rail and the rail width
const snap=page=>page.evaluate(()=>{
  const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}};
  const vis=e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return b.width>0&&b.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  const icons=[...document.querySelectorAll('#rail .rail-group > button > svg, #rail .rail-foot button > svg, #rail .rail-foot button > .sys-dot')].filter(vis);
  const labels=[...document.querySelectorAll('#rail .nav-short, #rail .nav-full, #rail .rail-foot .rl, #rail .rail-brand .rl')].filter(e=>vis(e)&&parseFloat(getComputedStyle(e).opacity)>0&&e.textContent.trim())
    .map(e=>({t:e.textContent.trim(),fs:parseFloat(getComputedStyle(e).fontSize),tt:getComputedStyle(e).textTransform}));
  const q=s=>{const e=document.querySelector(s);return e?r(e):null};
  return {icons:icons.map(r),labels,rail:q('#rail'),header:q('header'),view:q('#view-pipeline'),railIn:q('#rail .rail-in')};
});
function same(a,b,what){
  assert.equal(a.icons.length,b.icons.length,what+': same number of rail icons');
  a.icons.forEach((p,i)=>{const q=b.icons[i];['x','y','w','h'].forEach(k=>assert(Math.abs(p[k]-q[k])<=TOL,what+': icon '+i+' '+k+' '+p[k]+' -> '+q[k]))});
  ['rail','header','view'].forEach(n=>{if(!a[n])return;['x','y','w','h'].forEach(k=>assert(Math.abs(a[n][k]-b[n][k])<=TOL,what+': #'+n+' '+k+' '+a[n][k]+' -> '+b[n][k]))});
}
function labelsOk(s,what){
  assert(s.labels.length>0,what+': rail labels are visible');
  s.labels.forEach(l=>{assert(l.fs>=11,what+': label "'+l.t+'" is '+l.fs+' px (>= 11)');assert.equal(l.tt,'uppercase',what+': label "'+l.t+'" is uppercase')});
}

(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  for(const vp of [{width:2560,height:1440},{width:1440,height:900}]){
    const what=vp.width+'x'+vp.height;
    const ctx=await browser.newContext({viewport:vp}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');return r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:a==='writer_status'?{ok:true,level:'ok',warnings:[],queue:{processing:[]}}:{ok:true}})});
    await page.goto(base+'/pipeline.html');await page.waitForSelector('#rail .rail-group > button > svg');await page.waitForTimeout(600);
    const away=async()=>{await page.mouse.move(vp.width*0.5,vp.height*0.5);await page.waitForTimeout(450)};
    await away();
    const collapsed=await snap(page);labelsOk(collapsed,what+' collapsed');
    ['STATUS','REFRESH','PIPELINE'].forEach(t=>assert(collapsed.labels.some(l=>l.t.toUpperCase()===t),what+' collapsed: the '+t+' label shows under its icon'));

    // hover the second group's icon (the measured case: the icon must stay under the cursor)
    const btn=page.locator('#rail .rail-group > button').nth(1),ic=collapsed.icons[1],cx=ic.x+ic.w/2,cy=ic.y+ic.h/2;
    await page.mouse.move(cx,cy);await page.waitForTimeout(60);
    same(collapsed,await snap(page),what+' hover +60 ms');
    await page.waitForTimeout(400);
    const open=await snap(page);same(collapsed,open,what+' hover settled');labelsOk(open,what+' hover');
    assert(open.railIn.w-collapsed.railIn.w>100,what+': hover widens the rail ('+collapsed.railIn.w+' -> '+open.railIn.w+')');
    assert(await page.evaluate(([x,y])=>{const b=document.querySelectorAll('#rail .rail-group > button')[1],e=document.elementFromPoint(x,y);return !!e&&b.contains(e)},[cx,cy]),what+': the hovered button is still under the cursor');
    void btn;

    // keyboard focus: Tab into the rail; the ring is inset (not clipped by .rail-in) and the labels open
    await away();await page.evaluate(()=>{if(document.activeElement)document.activeElement.blur()});
    let inRail=false;for(let i=0;i<12&&!inRail;i++){await page.keyboard.press('Tab');inRail=await page.evaluate(()=>{const a=document.activeElement;return !!a&&!!a.closest('#rail')&&a.matches(':focus-visible')})}
    assert(inRail,what+': Tab reaches a rail button');
    await page.waitForTimeout(400);
    const kb=await snap(page);same(collapsed,kb,what+' keyboard focus');labelsOk(kb,what+' keyboard focus');
    assert(kb.railIn.w-collapsed.railIn.w>100,what+': keyboard focus opens the rail labels');
    const ring=await page.evaluate(()=>{const s=getComputedStyle(document.activeElement);return {w:parseFloat(s.outlineWidth),o:parseFloat(s.outlineOffset),st:s.outlineStyle}});
    assert(ring.st!=='none'&&ring.w>=2,what+': focused rail button has a >= 2 px outline ('+JSON.stringify(ring)+')');
    assert(ring.o<=-ring.w,what+': focus ring is inset (offset '+ring.o+' <= -'+ring.w+')');

    assert.deepEqual(errors,[],what+': no page errors');
    await ctx.close();
  }
  await browser.close();server.close();console.log('rail browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
