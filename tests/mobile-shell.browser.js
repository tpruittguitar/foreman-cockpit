/* Mobile shell (handoff Stage 2): phones open the new shell (header, Decide / Jobs / Status tabs, More sheet), the desktop
   cockpit and its queue filter bar are not shown on phones (known issue 1), the header hides on scroll, the More sheet opens
   and closes, desktop and touch tablets never get the shell, and crossing the breakpoint switches without a reload.
   Run: node tests/mobile-shell.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for the other browser tests)
   MOBILE_SHOTS=<dir> also writes screenshots. */
require('./helpers/block-production-writer.cjs'); // no request to the production Writer
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2'};
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const shots=process.env.MOBILE_SHOTS;
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const phone=(w,h)=>({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
  async function open(opts){
    const ctx=await browser.newContext(opts),page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    await page.route('**/script.google.com/**',r=>r.abort());await page.route('**/script.googleusercontent.com/**',r=>r.abort());   // never reach the production Writer
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{}}));await page.route('**/raw.githubusercontent.com/**',r=>r.fulfill({body:''}));
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');
      if(a==='master')return r.fulfill({json:{ok:true,text:fixture,modifiedTime:new Date().toISOString(),fetchedAt:new Date().toISOString()}});
      return r.fulfill({json:{ok:true}})});
    await page.goto(base+'/pipeline.html?src=writer');
    return {ctx,page,errors};
  }
  const visible=(page,sel)=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'},sel);

  // 1. Phones (portrait and a landscape phone): the shell is up, desktop cockpit and its queue filter bar are not rendered.
  for(const [name,opts] of [['390x844',phone(390,844)],['375x667',phone(375,667)],['844x390',phone(844,390)]]){
    const {ctx,page,errors}=await open(opts);await page.waitForSelector('#m-root .m-tabs');await page.waitForTimeout(600);
    const v=await page.evaluate(()=>{const h=document.getElementById('m-hd').getBoundingClientRect(),t=document.querySelector('.m-tabs').getBoundingClientRect();
      return {shell:document.documentElement.classList.contains('m-shell'),header:Math.round(h.height),tabs:Math.round(t.height),tabBottom:Math.round(t.bottom),ih:innerHeight,
        sel:[...document.querySelectorAll('#m-root [role=tab]')].map(b=>b.textContent+':'+b.getAttribute('aria-selected')),sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}});
    assert.ok(v.shell,name+': html.m-shell');assert.strictEqual(v.header,52,name+': header 52px');assert.strictEqual(v.tabs,opts.viewport.height<=520?44:64,name+': tab bar 64px (44px icon-only on a landscape phone)');
    assert.strictEqual(v.tabBottom,v.ih,name+': tab bar on the bottom edge');
    assert.deepStrictEqual(v.sel,['Decide:true','Jobs:false','Status:false'],name+': opens on Decide');
    assert.strictEqual(await page.evaluate(()=>Math.round(document.getElementById('m-main').getBoundingClientRect().width)),opts.viewport.width,name+': content spans the full width');
    assert.ok(v.sw<=v.cw,name+': no horizontal scroll '+v.sw+'>'+v.cw);
    for(const s of ['#app','#wip-queue-bar','#drawer','#bottombar','#pipeline-health-alert','#rail'])assert.ok(!(await visible(page,s)),name+': '+s+' not shown on the phone');
    const sys=await page.textContent('#m-sys-word');assert.match(sys,/^SYS (OK|DELAYED|FAULT)$/,name+': header system readout');
    const col=await page.evaluate(()=>({brand:getComputedStyle(document.querySelector('.m-brand')).color,sys:getComputedStyle(document.getElementById('m-sys')).color,cls:document.getElementById('m-sys').className,glyph:!!document.querySelector('#m-sys-ic svg'),tab:getComputedStyle(document.getElementById('m-tab-decide')).color}));
    assert.strictEqual(col.brand,'rgb(232, 232, 232)',name+': wordmark in primary text color');assert.ok(col.glyph,name+': state glyph next to the word');
    assert.strictEqual(col.sys,{'m-sys m-ok':'rgb(111, 191, 74)','m-sys m-delayed':'rgb(227, 195, 65)','m-sys m-fault':'rgb(222, 94, 90)'}[col.cls],name+': readout colored by state ('+col.cls+')');
    assert.strictEqual(col.tab,'rgb(217, 217, 217)',name+': active tab light gray');
    if(shots)await page.screenshot({path:path.join(shots,'stage2-decide-'+name+'.png')});
    assert.deepStrictEqual(errors,[],name+': no page errors');await ctx.close();
  }

  // 2. Tabs, keyboard, search, header hide on scroll, More sheet (Escape and scrim close it), a desktop view and back.
  let {ctx,page,errors}=await open(phone(390,844));await page.waitForSelector('#m-root .m-tabs');await page.waitForTimeout(400);
  await page.click('#m-tab-status');assert.ok(!(await page.isHidden('#m-pane-status'))&&(await page.isHidden('#m-pane-decide')),'Status tab shows its pane');
  await page.focus('#m-tab-status');await page.keyboard.press('ArrowLeft');assert.strictEqual(await page.getAttribute('#m-tab-jobs','aria-selected'),'true','arrow keys move between tabs');
  await page.click('#m-sys');assert.strictEqual(await page.getAttribute('#m-tab-status','aria-selected'),'true','system readout opens Status');
  await page.click('#m-search');assert.strictEqual(await page.getAttribute('#m-tab-jobs','aria-selected'),'true','search opens Jobs');
  await page.evaluate(()=>{const p=document.getElementById('m-pane-jobs');p.insertAdjacentHTML('beforeend','<div id="tall" style="height:3000px"></div>')});
  await page.mouse.wheel(0,400);await page.waitForTimeout(350);
  const hid=await page.evaluate(()=>document.getElementById('m-hd').getBoundingClientRect().bottom);assert.ok(hid<=0,'header hides on scroll down ('+hid+')');
  const chrome=await page.evaluate(()=>{const t=document.querySelector('.m-tabs').getBoundingClientRect();return Math.round(t.height+Math.max(0,document.getElementById('m-hd').getBoundingClientRect().bottom))});
  assert.ok(chrome<=110,'fixed chrome while scrolling <= 110px ('+chrome+')');
  await page.mouse.wheel(0,-200);await page.waitForTimeout(350);
  assert.ok(await page.evaluate(()=>document.getElementById('m-hd').getBoundingClientRect().top>=0),'header returns on scroll up');
  await page.click('#m-more');assert.ok(await page.isVisible('#m-more-sheet'),'More sheet opens');
  const rows=await page.$$eval('#m-more-sheet [data-m-desk]',b=>b.map(x=>({t:x.querySelector('b').textContent,h:x.getBoundingClientRect().height})));
  assert.deepStrictEqual(rows.map(r=>r.t),['Map','Trends','Compare','My Rulings','Intake','Settings'],'More sheet rows');assert.ok(rows.every(r=>r.h>=52),'52px rows');
  if(shots)await page.screenshot({path:path.join(shots,'stage2-more-390x844.png')});
  const look=await page.evaluate(()=>{const cs=s=>getComputedStyle(document.querySelector(s));return {t:cs('#m-more-sheet [data-m-desk] b').textTransform,ts:cs('#m-more-sheet [data-m-desk] b').fontSize,d:cs('#m-more-sheet [data-m-desk] small').textTransform,ds:cs('#m-more-sheet [data-m-desk] small').fontSize,scrim:cs('#m-scrim').backgroundColor}});
  assert.deepStrictEqual(look,{t:'none',ts:'16px',d:'none',ds:'14px',scrim:'rgba(0, 0, 0, 0.4)'},'More sheet: sentence case 16/14px, page behind dimmed not blacked out');
  await page.click('#m-more-x');assert.ok(await page.isHidden('#m-more-sheet'),'✕ closes the More sheet');
  await page.click('#m-more');await page.keyboard.press('Escape');assert.ok(await page.isHidden('#m-more-sheet'),'Escape closes the More sheet');
  await page.click('#m-more');await page.mouse.click(195,60);assert.ok(await page.isHidden('#m-more-sheet'),'scrim closes the More sheet');
  await page.click('#m-more');await page.click('[data-m-desk="settings"]');await page.waitForTimeout(300);
  assert.ok(await visible(page,'#view-settings'),'a desktop view opens from More');assert.ok(await page.isVisible('#m-return'),'Mobile return button shown');
  await page.click('#m-return');
  if(shots){await page.click('#m-tab-decide');await page.click('#m-more');await page.screenshot({path:path.join(shots,'stage2-more-over-decide-390x844.png')});await page.keyboard.press('Escape')}assert.ok(!(await visible(page,'#app'))&&(await page.isVisible('.m-tabs')),'returns to the shell');
  // Labels >= 12px, tap targets >= 44px in the shell chrome.
  const small=await page.evaluate(()=>[...document.querySelectorAll('#m-root .m-hd *, #m-root .m-tabs *')].filter(e=>e.childNodes.length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<12).map(e=>e.textContent));
  assert.deepStrictEqual(small,[],'no chrome text under 12px');
  const taps=await page.evaluate(()=>[...document.querySelectorAll('#m-root .m-hd button, #m-root .m-tabs button')].map(b=>{const r=b.getBoundingClientRect();return [b.id||b.textContent,Math.round(r.width),Math.round(r.height)]}).filter(x=>x[1]<44||x[2]<44));
  assert.deepStrictEqual(taps,[],'tap targets >= 44px');
  assert.deepStrictEqual(errors,[],'no page errors');
  // 3. Crossing the breakpoint switches without a reload.
  await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(300);
  assert.ok(!(await page.evaluate(()=>document.documentElement.classList.contains('m-shell'))),'wide window leaves the shell');assert.ok(await visible(page,'#app'),'desktop cockpit shown again');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('m-shell')),'narrow window returns to the shell');
  await ctx.close();

  // 4. Desktop and a touch tablet never get the shell.
  for(const [name,opts] of [['1440x900',{viewport:{width:1440,height:900}}],['1024x768',{viewport:{width:1024,height:768}}],['tablet-820x1180',{viewport:{width:820,height:1180},isMobile:true,hasTouch:true}]]){
    const o=await open(opts);await o.page.waitForTimeout(800);
    const v=await o.page.evaluate(()=>({shell:document.documentElement.classList.contains('m-shell'),root:!!document.getElementById('m-root')}));
    assert.deepStrictEqual(v,{shell:false,root:false},name+': no mobile shell');assert.ok(await visible(o.page,'#app'),name+': cockpit shown');
    assert.deepStrictEqual(o.errors,[],name+': no page errors');await o.ctx.close();
  }
  await browser.close();server.close();console.log('mobile-shell: all checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
