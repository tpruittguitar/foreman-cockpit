/* Mobile shell Stage 3 (Decide): cards sorted by score with the score colour, reason line and badges always carrying a glyph
   or word; Pursue / Hold / Decline / Research go through the existing ruling sender (postRuling_ batch queue) and the Undo
   toast appears only once the decision is queued; Undo restores the card at its place and runs the existing undo path;
   swipe right / left on the top card = Pursue / Decline with the same buttons visible; long-press and ⋯ reach Research in
   two taps; the job detail sheet closes by back arrow, Escape, browser Back and swipe-down, and nothing bleeds over it.
   Run: node tests/mobile-decide.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for the other browser tests)
   MOBILE_SHOTS=<dir> also writes screenshots. */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2'};
const shots=process.env.MOBILE_SHOTS;
// Open rows become needs-decision with varied pay / fit so every badge state appears (the shared fixture has one).
let n=0;
const MEMPHIS='V2X-TESTMEMPHIS01';
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8').split('\n').map(l=>{
  const c=l.split(' | ');if(c.length<10||!/^\d+$/.test(c[0]))return l;
  if(!/^(READY_TO_PURSUE|MANUAL_RESEARCH|SCOUT_INTAKE|DISCOVERY_LEAD|TIM_DECISION_REQUIRED)$/.test(c[4]))return l;
  c[4]='TIM_DECISION_REQUIRED';const i=n++;
  const pay=[['190000','230000'],['250000','320000'],null,['150000','180000']][i%4];
  return c.join(' | ')+'; SCOPE_FIT_RAW='+(55+i*4)+'; FIT_CONF=MED'+(pay?'; SALARY_BASE_LOW='+pay[0]+'; SALARY_BASE_HIGH='+pay[1]+'; SALARY_BASIS=FORGE-ESTIMATE':'');
}).join('\n')+'\n'+(()=>{
  // One needs-decision job that is NOT Act Now (Grok Bot GUI, Stage 5 review 2026-11-02): a scored Director role in Memphis,
  // which the Act Now rule leaves out, so the Act now chip has to narrow the list (count below All, this card gone).
  const c=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8').split('\n').find(l=>l.startsWith('455 | ')).split(' | ');
  c[0]='9455';c[1]=MEMPHIS;c[2]='Company-20';c[4]='TIM_DECISION_REQUIRED';c[7]='R-0000001';c[8]='Memphis, TN';
  return c.join(' | ').replace('example.invalid/job/32c9afb4','example.invalid/job/memphis01')+'; SCOPE_FIT_RAW=30; FIT_CONF=MED; SALARY_BASE_LOW=150000; SALARY_BASE_HIGH=170000; SALARY_BASIS=FORGE-ESTIMATE'   // lowest score in the set, so earlier steps (which decide the top card) leave it in place;
})();
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const phone={viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'};
  async function open(o={}){
    const ctx=await browser.newContext({...phone,...(o.ctx||{})}),page=await ctx.newPage(),errors=[],posts=[];
    page.on('pageerror',e=>errors.push(e.message));
    // writer:false = a connection that reads but was not set on purpose (deliberate:false), so nothing can send.
    await page.addInitScript(([writer,ms])=>{localStorage.setItem('px.cfg',JSON.stringify(writer?{url:location.origin+'/writer',key:'test-only'}:{url:location.origin+'/writer',key:'test-only',deliberate:false}));window.PX_TEST_BATCH_MS=ms},[o.writer!==false,o.batchMs||150]);
    await page.route('**/script.google.com/**',r=>r.abort());await page.route('**/script.googleusercontent.com/**',r=>r.abort());   // never reach the production Writer
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{}}));await page.route('**/raw.githubusercontent.com/**',r=>r.fulfill({body:''}));
    await page.route('**/writer*',r=>{const req=r.request(),a=new URL(req.url()).searchParams.get('action');
      if(req.method()==='POST'){const b=JSON.parse(req.postData()||'{}');posts.push(b);
        if(b.action==='batch')return r.fulfill({json:{ok:true,mode:'BATCH_RULING_SINGLE_COMMIT',writeId:'W1',results:b.requests.map(q=>({ok:true,requestId:q.ruling.requestId}))}});
        return r.fulfill({json:{ok:true,receipt:{REQUEST_ID:b.ruling&&b.ruling.requestId}}})}
      if(a==='master')return r.fulfill({json:{ok:true,text:fixture,modifiedTime:new Date().toISOString(),fetchedAt:new Date().toISOString()}});
      if(a==='request_result')return r.fulfill({json:{ok:true,found:true,status:'COMPLETE'}});
      return r.fulfill({json:{ok:true}})});
    await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#m-pane-decide .m-card');await page.waitForTimeout(300);
    return {ctx,page,errors,posts};
  }
  const rulings=posts=>posts.flatMap(b=>b.action==='ruling'?[b.ruling]:b.action==='batch'?b.requests.map(q=>q.ruling):[]);
  const cards=page=>page.$$eval('#m-pane-decide .m-card',cs=>cs.map(c=>({id:c.getAttribute('data-m-card'),score:c.querySelector('.m-score b').textContent})));

  // 1. Decide: count, sort, first decision in one tap, glyph + word on every coloured state, sizes, no horizontal scroll.
  let {ctx,page,errors,posts}=await open();
  const c0=await cards(page);assert.ok(c0.length>=4,'several cards ('+c0.length+')');
  const nums=c0.map(c=>parseInt(c.score,10)).filter(x=>!isNaN(x));assert.deepStrictEqual(nums,[...nums].sort((a,b)=>b-a),'sorted by score, high first');
  assert.strictEqual(parseInt(await page.textContent('.m-count b'),10),c0.length,'counter matches the cards');
  const first=await page.evaluate(()=>{const b=document.querySelector('.m-card.m-top [data-m-do="pursue"]').getBoundingClientRect();return {top:b.top,bottom:b.bottom,ih:innerHeight}});
  assert.ok(first.bottom<first.ih-64,'Pursue on the first card is on screen: one tap to decide');
  const colour=await page.evaluate(()=>{const bad=[];
    document.querySelectorAll('#m-pane-decide .m-b.ok,#m-pane-decide .m-b.caution,#m-pane-decide .m-b.attn,#m-pane-decide .m-b.fault,#m-pane-decide .m-reason.ok,#m-pane-decide .m-reason.caution,#m-pane-decide .m-reason.fault,#m-pane-decide .m-score.ok').forEach(e=>{
      if(!e.querySelector('svg.m-g')&&!/^~/.test(e.textContent.trim()))bad.push(e.className+': '+e.textContent)});
    const states=new Set([...document.querySelectorAll('#m-pane-decide .m-b')].map(e=>e.className));return {bad,states:[...states]}});
  assert.deepStrictEqual(colour.bad,[],'every coloured score, reason and badge carries a glyph or "~"');
  ['m-b ok','m-b fault','m-b caution m-i'].forEach(s=>assert.ok(colour.states.includes(s),'badge state present: '+s+' in '+colour.states));
  // Every fit badge carries a glyph or "~", whatever badges sit around it; fits of 70+ are green with a check (Grok Bot GUI, Stage 5 review).
  const fits=await page.$$eval('#m-pane-decide .m-b',bs=>bs.filter(b=>/Fit/.test(b.textContent)).map(b=>({t:b.textContent.trim(),cls:b.className,g:!!b.querySelector('svg.m-g')})));
  assert.ok(fits.some(f=>parseInt(f.t.replace(/\D+/g,''),10)>=70),'test data has a strong fit');
  fits.forEach(f=>{assert.ok(f.g||/^~/.test(f.t),'fit badge has a glyph or "~": '+JSON.stringify(f));const n=parseInt(f.t.replace(/\D+/g,''),10);
    if(n>=70){assert.strictEqual(f.cls,'m-b ok','strong fit is green: '+JSON.stringify(f));assert.ok(f.g,'strong fit has the check glyph')}});
  // One close-up for review: a card whose fit is 70+ (green ✓), next to cards with a borderline "~" fit.
  if(shots){const strong=await page.$$('#m-pane-decide .m-card');for(const c of strong){if(await c.$$eval('.m-b.ok',bs=>bs.some(b=>/Fit \d+/.test(b.textContent)&&parseInt(b.textContent.replace(/\D+/g,''),10)>=70))){
    await c.scrollIntoViewIfNeeded();await c.screenshot({path:path.join(shots,'stage5-fit-strong-card-390.png')});break}}
    await page.evaluate(()=>scrollTo(0,0));}
  const sizes=await page.evaluate(()=>{const small=[],taps=[];document.querySelectorAll('#m-root *').forEach(e=>{if(!e.offsetParent&&getComputedStyle(e).position!=='fixed')return;
      if([...e.childNodes].some(x=>x.nodeType===3&&x.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<12)small.push(e.textContent.trim().slice(0,30))});
    document.querySelectorAll('#m-pane-decide button').forEach(b=>{const r=b.getBoundingClientRect();if(r.width&&(r.height<44||r.width<44)&&!b.classList.contains('m-chip'))taps.push(b.textContent.trim()+' '+Math.round(r.width)+'x'+Math.round(r.height))});
    const p=document.querySelector('.m-top [data-m-do="pursue"]').getBoundingClientRect(),dots=document.querySelector('.m-top [data-m-menu]').getBoundingClientRect(),d=document.querySelector('.m-top [data-m-do="decline"]').getBoundingClientRect();
    return {small,taps,gap:Math.round(d.left-dots.right),sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}});
  const clipped=await page.$$eval('#m-pane-decide .m-actions .m-btn',bs=>bs.filter(b=>b.scrollWidth>b.clientWidth+1).map(b=>b.textContent.trim()+' '+b.scrollWidth+'>'+b.clientWidth));
  assert.deepStrictEqual(clipped,[],'no action button label is clipped');
  assert.deepStrictEqual(sizes.small,[],'no text under 12px');assert.deepStrictEqual(sizes.taps,[],'buttons >= 44px');
  const chip=await page.textContent('[data-m-filter="act"]'),actN=parseInt(chip.replace(/\D+/g,' ').trim().split(' ').pop(),10);
  assert.match(chip,/^Act now · \d+$/,'Act Now chip shows its own count ('+chip+')');assert.ok(actN<=c0.length,'Act Now count never exceeds the full list');
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#m-pane-decide .m-card')].every(c=>!/Aging/.test(c.querySelector('.m-reason').textContent)||![...c.querySelectorAll('.m-b')].some(b=>/^\?\s*\d+d$/.test(b.textContent.trim())))),'no age badge when the reason line already gives the age');
  assert.ok(sizes.gap>=8,'Decline sits >= 8px from its neighbour ('+sizes.gap+')');assert.ok(sizes.sw<=sizes.cw,'no horizontal scroll');
  if(shots)await page.screenshot({path:path.join(shots,'stage3-decide-390x844.png')});

  // 2. Pursue: queued in the ruling sender, then the card leaves and the Undo toast shows; the ruling goes out as APPLY_NOW.
  const top=c0[0].id;await page.click('.m-card.m-top [data-m-do="pursue"]');
  await page.waitForSelector('#m-toast:not([hidden])');assert.match(await page.textContent('#m-toast b'),/Pursue queued/,'toast names the queued decision');
  assert.ok(await page.isVisible('#m-undo'),'Undo on the toast');
  if(shots)await page.screenshot({path:path.join(shots,'stage3-undo-toast-390x844.png')});
  await page.waitForTimeout(700);
  assert.ok(!(await cards(page)).some(c=>c.id===top),'decided card left the queue');
  const cover=await page.evaluate(()=>{const t=document.getElementById('m-toast').getBoundingClientRect();return [...document.querySelectorAll('.m-card.m-top .m-actions .m-btn')].filter(b=>{const r=b.getBoundingClientRect();return r.bottom>t.top&&r.top<t.bottom}).length});
  assert.strictEqual(cover,0,'the Undo toast never covers the action buttons of the card moving up');
  let r=rulings(posts);assert.strictEqual(r.length,1,'one ruling sent');assert.strictEqual(r[0].kind,'APPLY_NOW');assert.strictEqual(r[0].value,'YES');assert.strictEqual(r[0].primaryId,top);
  // 3. Undo within 5s: the card returns at its place; the saved decision is undone through the existing undo_ruling path.
  await page.click('#m-undo');await page.waitForTimeout(900);
  const c1=await cards(page);assert.strictEqual(c1[0].id,top,'Undo restores the card to the top');
  assert.ok(posts.some(p=>p.action==='undo_ruling'&&p.undo.primaryId===top),'Undo runs the existing undo_ruling for a sent decision');
  // 4. Toast ends after 5 seconds.
  await page.click('.m-card.m-top [data-m-do="hold"]');await page.waitForSelector('#m-toast:not([hidden])');await page.waitForTimeout(5300);
  assert.ok(await page.isHidden('#m-toast'),'toast gone after 5s');
  r=rulings(posts);assert.strictEqual(r[r.length-1].kind,'MANUAL_RESEARCH','Hold is a MANUAL_RESEARCH hold');
  // 5. Research in two taps: ⋯ then Research; and long-press opens the same menu.
  const t2=(await cards(page))[0].id;await page.click('.m-card.m-top [data-m-menu]');await page.click('.m-card.m-top [data-m-do="research"]');await page.waitForTimeout(500);
  r=rulings(posts);assert.strictEqual(r[r.length-1].kind,'MANUAL_RESEARCH');assert.match(r[r.length-1].note,/Research requested/,'Research note');assert.strictEqual(r[r.length-1].primaryId,t2);
  await page.waitForTimeout(5300);
  const lp=await page.$('.m-card.m-top .m-reason');const bb=await lp.boundingBox();await page.mouse.move(bb.x+10,bb.y+5);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
  assert.ok(await page.isVisible('.m-card.m-top .m-menu [data-m-do="research"]'),'long-press opens the Research menu');
  await page.keyboard.press('Escape');assert.ok(!(await page.isVisible('.m-menu')),'Escape closes the menu');
  // 6. Swipe: right = Pursue, left = Decline, buttons still visible on the card.
  async function swipe(dx){const c=await page.$('.m-card.m-top .m-reason'),b=await c.boundingBox(),x=b.x+b.width/2,y=b.y+4;await page.mouse.move(x,y);await page.mouse.down();for(let i=1;i<=8;i++){await page.mouse.move(x+dx*i/8,y);await page.waitForTimeout(16)}await page.mouse.up();await page.waitForTimeout(600)}
  assert.ok(await page.isVisible('.m-card.m-top [data-m-do="pursue"]')&&await page.isVisible('.m-card.m-top [data-m-do="decline"]'),'swipe card keeps visible Pursue and Decline buttons');
  let before=rulings(posts).length,sid=(await cards(page))[0].id;await swipe(160);r=rulings(posts);
  assert.strictEqual(r.length,before+1,'swipe right sends one ruling');assert.strictEqual(r[r.length-1].kind,'APPLY_NOW');assert.strictEqual(r[r.length-1].primaryId,sid);
  await page.waitForTimeout(5300);before=rulings(posts).length;sid=(await cards(page))[0].id;await swipe(-160);r=rulings(posts);
  assert.strictEqual(r[r.length-1].kind,'DECLINE','swipe left = Decline');assert.strictEqual(r[r.length-1].code,'TIM_EXPLICIT_DECLINE');assert.strictEqual(r[r.length-1].primaryId,sid);
  await page.waitForTimeout(5300);before=rulings(posts).length;await swipe(60);
  assert.strictEqual(rulings(posts).length,before,'a short swipe springs back and decides nothing');
  // 7. Detail sheet: opens over everything, sections closed, sticky actions, four ways to close.
  const d1=(await cards(page))[0].id;await page.click('.m-card.m-top [data-m-open]');await page.waitForSelector('#m-detail:not([hidden])');
  const dv=await page.evaluate(()=>{const d=document.getElementById('m-detail').getBoundingClientRect(),bar=document.querySelector('.m-dbar').getBoundingClientRect();
    const hit=[[195,180],[195,400],[195,700]].map(p=>document.elementFromPoint(p[0],p[1])).map(e=>!!e.closest('#m-detail'));
    return {full:d.top===0&&d.height===innerHeight,closed:[...document.querySelectorAll('#m-detail details')].every(x=>!x.open),secs:[...document.querySelectorAll('#m-detail summary')].map(s=>s.textContent),bar:Math.round(bar.bottom)===innerHeight,hit}});
  assert.ok(dv.full,'detail is full screen');assert.ok(dv.closed,'sections closed by default');assert.deepStrictEqual(dv.secs,['Posting','Fit & score','My application']);
  assert.ok(dv.bar,'action bar pinned to the bottom');
  const dup=await page.evaluate(()=>{const t=document.querySelector('#m-detail .m-db').innerText;return (t.match(/pending|not known yet|not posted/gi)||[]).length});
  if(await page.$('#m-detail .m-b.m-i'))assert.ok(dup<=2,'salary pending said once in the sentence plus one badge ('+dup+')');assert.deepStrictEqual(dv.hit,[true,true,true],'nothing from the page behind sits over the detail sheet');
  const dclip=await page.evaluate(()=>[...document.querySelectorAll('.m-dbar .m-btn')].filter(b=>b.scrollWidth>b.clientWidth+1).map(b=>b.textContent.trim()));
  assert.deepStrictEqual(dclip,[],'no detail action label is clipped');
  if(shots)await page.screenshot({path:path.join(shots,'stage3-detail-390x844.png')});
  // Narrower phones (CI 2026-11-02: Pursue had 0px to spare at 390 and was clipped at 375): every label whole with room to
  // spare (so a slightly wider text rasteriser does not clip it), the bar inside the screen, and Research-Decline >= 16px.
  for(const w of [375,360]){await page.setViewportSize({width:w,height:844});await page.waitForTimeout(150);
    const nb=await page.evaluate(()=>{const bs=[...document.querySelectorAll('.m-dbar .m-btn')],bar=document.querySelector('.m-dbar').getBoundingClientRect(),r=document.querySelector('.m-dbar .m-research'),d=document.querySelector('.m-dbar .m-danger');
      return {clip:bs.filter(b=>b.scrollWidth>b.clientWidth+1).map(b=>b.textContent.trim()),right:Math.max(...bs.map(b=>b.getBoundingClientRect().right)),bar:bar.right,
        spare:Math.round(d.getBoundingClientRect().left-r.getBoundingClientRect().right),pursueRoom:(()=>{const p=document.querySelector('.m-dbar .m-primary'),c=getComputedStyle(p);return p.clientWidth-parseFloat(c.paddingLeft)-parseFloat(c.paddingRight)-[...p.childNodes].reduce((s,n)=>{const g=document.createRange();g.selectNodeContents(n);return s+g.getBoundingClientRect().width},0)})()}});
    assert.deepStrictEqual(nb.clip,[],w+'px: no detail action label is clipped');assert.ok(nb.right<=nb.bar+0.5,w+'px: detail actions stay on screen '+JSON.stringify(nb));
    assert.ok(nb.spare>=16,w+'px: Research and Decline at least 16px apart ('+nb.spare+')');assert.ok(nb.pursueRoom>=0,w+'px: Pursue label fits ('+JSON.stringify(nb)+')');}
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
  await page.click('#m-d-back');assert.ok(await page.isHidden('#m-detail'),'back arrow closes');
  await page.click('.m-card.m-top [data-m-open]');await page.keyboard.press('Escape');assert.ok(await page.isHidden('#m-detail'),'Escape closes');
  await page.click('.m-card.m-top [data-m-open]');await page.goBack();await page.waitForTimeout(200);assert.ok(await page.isHidden('#m-detail'),'browser Back closes');
  assert.ok(await page.isVisible('#m-pane-decide .m-card'),'still on the Decide list after Back');
  await page.click('.m-card.m-top [data-m-open]');const h=await (await page.$('#m-dh')).boundingBox();
  await page.mouse.move(h.x+h.width/2,h.y+8);await page.mouse.down();for(let i=1;i<=8;i++){await page.mouse.move(h.x+h.width/2,h.y+8+200*i/8);await page.waitForTimeout(16)}await page.mouse.up();
  await page.waitForTimeout(200);assert.ok(await page.isHidden('#m-detail'),'swipe down on the handle closes');
  // A decision from the detail sheet closes it and queues like the card buttons.
  await page.click('.m-card.m-top [data-m-open]');await page.click('#m-detail [data-m-do="hold"]');await page.waitForSelector('#m-toast:not([hidden])');
  assert.ok(await page.isHidden('#m-detail'),'deciding in the sheet closes it');r=rulings(posts);await page.waitForTimeout(500);r=rulings(posts);assert.strictEqual(r[r.length-1].primaryId,d1);
  // 8. Act Now 10 chip narrows the list.
  const all8=await cards(page),chip8=parseInt((await page.textContent('[data-m-filter="act"]')).replace(/\D+/g,' ').trim().split(' ').pop(),10);
  assert.ok(all8.some(c=>c.id===MEMPHIS),'the Memphis job (not Act Now) is in All');
  await page.click('[data-m-filter="act"]');await page.waitForTimeout(150);const act=await cards(page);assert.ok(act.length<=10,'Act Now shows at most 10');
  assert.strictEqual(await page.getAttribute('[data-m-filter="act"]','aria-pressed'),'true');
  assert.ok(!act.some(c=>c.id===MEMPHIS),'Act now leaves the Memphis job out');assert.ok(act.length<all8.length,'Act now narrows the list ('+act.length+' of '+all8.length+')');
  assert.strictEqual(act.length,chip8,'the chip count is the number of cards Act now shows');
  if(shots)await page.screenshot({path:path.join(shots,'stage3-decide-act-now-390x844.png')});
  assert.deepStrictEqual(errors,[],'no page errors');await ctx.close();

  // 9. No Writer: nothing is queued, no success toast, the card stays and says why.
  ({ctx,page,errors,posts}=await open({writer:false}));
  const w0=(await cards(page))[0].id;await page.click('.m-card.m-top [data-m-do="pursue"]');await page.waitForTimeout(400);
  assert.ok(await page.isHidden('#m-toast'),'no success toast when nothing was queued');assert.strictEqual((await cards(page))[0].id,w0,'card stays');
  assert.match(await page.textContent('.m-card.m-top .m-say'),/Writer not connected/,'card says why');assert.strictEqual(rulings(posts).length,0,'nothing sent');
  assert.deepStrictEqual(errors,[],'no page errors (no Writer)');await ctx.close();

  // 10. Undo before the batch goes out: the decision is dropped on the device and never sent.
  ({ctx,page,errors,posts}=await open({batchMs:4000}));
  const u0=(await cards(page))[0].id;await page.click('.m-card.m-top [data-m-do="decline"]');await page.waitForSelector('#m-toast:not([hidden])');await page.waitForTimeout(300);
  await page.click('#m-undo');await page.waitForTimeout(400);assert.match(await page.textContent('#m-toast'),/not been sent/,'Undo explains it was never sent');
  await page.waitForTimeout(4200);assert.strictEqual(rulings(posts).length,0,'an undone queued decision is never sent');assert.strictEqual((await cards(page))[0].id,u0,'card back on top');
  assert.deepStrictEqual(errors,[],'no page errors (early undo)');await ctx.close();

  // 10b. A short phone (375x667): the toast still never covers the next card's action buttons.
  ({ctx,page,errors}=await open({ctx:{viewport:{width:375,height:667}}}));
  await page.click('.m-card.m-top [data-m-do="hold"]');await page.waitForSelector('#m-toast:not([hidden])');await page.waitForTimeout(700);
  assert.strictEqual(await page.evaluate(()=>{const t=document.getElementById('m-toast').getBoundingClientRect();return [...document.querySelectorAll('.m-card.m-top .m-actions .m-btn')].filter(b=>{const r=b.getBoundingClientRect();return r.bottom>t.top&&r.top<t.bottom}).length}),0,'375x667: toast clear of the next card actions');
  assert.deepStrictEqual(errors,[],'no page errors (375x667)');await ctx.close();

  // 11. Reduced motion: no transitions on the card or the sheet.
  ({ctx,page,errors}=await open({ctx:{reducedMotion:'reduce'}}));
  const rm=await page.evaluate(()=>getComputedStyle(document.querySelector('.m-card')).transitionDuration);assert.ok(/^0s/.test(rm),'reduced motion: card transition 0s ('+rm+')');
  await ctx.close();
  await browser.close();server.close();console.log('mobile-decide: all checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
