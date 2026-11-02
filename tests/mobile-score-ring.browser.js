/* Mobile job detail: the radial score ring is coloured by the app's percentile score band (pipeline-bands.js, the same bands as
   the desktop score colours): TOP green, UPPER yellow, MID orange, LOW red (phone tokens --m-ok / --m-caution / --m-attn /
   --m-fault). The track stays gray, the number stays neutral light gray, a text label names the band (no colour-only meaning),
   the ring passes 3:1 against its panel, and the fill animates once on open (<= 250ms; none under reduced motion). Decide card
   scores use the same band colour, with the band glyph beside the number (Tim 2026-11-02).
   Tim, 2026-11-02. Run: node tests/mobile-score-ring.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for the
   other browser tests). MOBILE_SHOTS=<dir> also writes screenshots. */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2'};
const shots=process.env.MOBILE_SHOTS;
// 120 needs-decision clones of one open job with fit 20..99 spread the scores across all four bands (bands need >= 40 open
// scored jobs). Each clone has its own id, requisition and source URL so identity rules keep them apart. One more clone is a
// strong fit whose pay is below what the location needs (the "green ring next to a red pay warning" case Tim asked to see).
const lines=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8').split('\n');
const tpl=lines.find(l=>/^455 \| /.test(l)),extra=[];
function clone(i,fit,pay){const c=tpl.split(' | ');c[0]=String(2000+i);c[1]='V2X-RING'+String(i).padStart(8,'0');c[2]='Company-R'+i;c[3]='Director, Operations '+i;c[4]='TIM_DECISION_REQUIRED';c[7]='R-RING'+i;
  // The template posts $163.5K-$239.8K; each clone carries its own range instead (posted salary would win over an estimate).
  return c.join(' | ').replace('example.invalid/job/32c9afb4','example.invalid/job/ring'+i).replace(/SALARY_BASE_EST=\$\d+-\$\d+/,'SALARY_BASE_EST=$'+pay[0]+'-$'+pay[1]).replace(/SALARY_MIDPOINT=\$\d+/,'SALARY_MIDPOINT=$'+Math.round((+pay[0]+ +pay[1])/2)).replace(/; FLOOR_STATUS=[^;]*/,'').replace(/; AUDIT_2026-09-29=[^;]*(;|$)/,'$1')+'; SCOPE_FIT_RAW='+fit+'; FIT_CONF=MED; SALARY_BASE_LOW='+pay[0]+'; SALARY_BASE_HIGH='+pay[1]+'; SALARY_BASIS=FORGE-ESTIMATE'}
for(let i=0;i<120;i++)extra.push(clone(i,20+Math.round(i*79/119),['190000','240000']));
const BELOW='V2X-RING'+String(500).padStart(8,'0');extra.push(clone(500,96,['120000','140000']));
const fixture=lines.slice(0,lines.indexOf(tpl)).concat(extra,lines.slice(lines.indexOf(tpl))).join('\n');
// MID is gray as on desktop (Tim 2026-11-02: orange stays for constraints and QUEUE DOWN).
const TOKEN={TOP:'--m-ok',UPPER:'--m-caution',MID:'--m-text-2',LOW:'--m-fault'},GLYPH={TOP:'▲',UPPER:'◆',MID:'●',LOW:'▽'};
function lum(rgb){const v=rgb.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)});return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]}
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  async function open(extraCtx){
    const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,...(extraCtx||{})}),page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'})));
    await page.route('**/script.google.com/**',r=>r.abort());await page.route('**/script.googleusercontent.com/**',r=>r.abort());   // never reach the production Writer
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{}}));await page.route('**/raw.githubusercontent.com/**',r=>r.fulfill({body:''}));
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');
      if(a==='master')return r.fulfill({json:{ok:true,text:fixture,modifiedTime:new Date().toISOString(),fetchedAt:new Date().toISOString()}});return r.fulfill({json:{ok:true}})});
    await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#m-pane-decide .m-card');await page.waitForTimeout(400);
    return {ctx,page,errors};
  }
  const tok=(page,v)=>page.evaluate(v=>{const d=document.createElement('i');d.style.color='var('+v+')';document.getElementById('m-root').appendChild(d);const c=getComputedStyle(d).color;d.remove();return c},v);
  async function openDetail(page,id){await page.evaluate(id=>{const b=document.querySelector('.m-card[data-m-card="'+id+'"] [data-m-open]');b.scrollIntoView({block:'center'})},id);
    await page.click('.m-card[data-m-card="'+id+'"] [data-m-open]');await page.waitForSelector('#m-detail:not([hidden]) .m-ring');}
  async function closeDetail(page){await page.keyboard.press('Escape');await page.waitForSelector('#m-detail',{state:'hidden'});}
  const ringInfo=page=>page.evaluate(()=>{const s=document.querySelector('#m-detail .m-ring'),arc=s.querySelector('.m-ring-arc'),track=s.querySelector('circle'),n=s.querySelector('.m-ring-n');
    let e=s,bg='rgba(0, 0, 0, 0)';while(e&&(bg=getComputedStyle(e).backgroundColor)==='rgba(0, 0, 0, 0)')e=e.parentElement;
    const lab=document.querySelector('#m-detail [data-m-band]');
    return {band:s.getAttribute('data-band'),arc:getComputedStyle(arc).stroke,track:track.getAttribute('stroke'),num:getComputedStyle(n).fill,bg,label:lab&&lab.textContent.trim(),labelColor:lab&&getComputedStyle(lab).color,
      anim:getComputedStyle(arc).animationName,dur:parseFloat(getComputedStyle(arc).animationDuration)}});

  // 1. Bands are on and the population covers all four.
  let {ctx,page,errors}=await open();
  const views=await page.evaluate(()=>{const b=PEMobileBridge;return b.decideRows().map(r=>b.view(r)).map(v=>({id:v.id,band:v.band,score:v.score}))});
  const pick={};views.forEach(v=>{if(TOKEN[v.band]&&!pick[v.band]&&v.id!==BELOW)pick[v.band]=v});
  assert.deepStrictEqual(Object.keys(pick).sort(),['LOW','MID','TOP','UPPER'],'test data covers every band ('+JSON.stringify(Object.keys(pick))+')');
  const text=await tok(page,'--m-text'),gray=await tok(page,'--m-text-2');

  // 2. Each band's Decide card: the score number in the band colour with the band glyph beside it; the card agrees with the ring.
  for(const band of ['TOP','UPPER','MID','LOW']){
    const c=await page.evaluate(id=>{const s=document.querySelector('.m-card[data-m-card="'+id+'"] .m-score'),b=s.querySelector('b');
      return {band:s.getAttribute('data-band'),color:getComputedStyle(b).color,g:b.getAttribute('data-g'),before:getComputedStyle(b,'::before').content,num:b.textContent.trim(),label:s.getAttribute('aria-label')}},pick[band].id);
    assert.strictEqual(c.band,band,band+': card has the same band as the ring');assert.strictEqual(c.color,await tok(page,TOKEN[band]),band+': card score in '+TOKEN[band]+' ('+c.color+')');
    assert.strictEqual(c.g,GLYPH[band],band+': band glyph '+GLYPH[band]+' beside the number');assert.strictEqual(c.before,'"'+GLYPH[band]+'"','glyph is drawn');
    assert.match(c.num,/^\d+$/,band+': the number itself stays a plain number');assert.match(c.label,new RegExp(band.toLowerCase()+' \\d+% of open jobs'),band+': screen readers hear the band ('+c.label+')');
    if(shots){await page.evaluate(id=>document.querySelector('.m-card[data-m-card="'+id+'"]').scrollIntoView({block:'center'}),pick[band].id);
      await page.locator('.m-card[data-m-card="'+pick[band].id+'"]').screenshot({path:path.join(shots,'stage5-card-'+band.toLowerCase()+'-390.png')});}
  }
  await page.evaluate(()=>scrollTo(0,0));

  // 3. Each band: ring colour = its token, gray track, neutral number, a text label naming the band, ring >= 3:1 on its panel.
  for(const band of ['TOP','UPPER','MID','LOW']){
    await openDetail(page,pick[band].id);const r=await ringInfo(page),want=await tok(page,TOKEN[band]);
    assert.strictEqual(r.band,band,band+': ring knows its band');assert.strictEqual(r.arc,want,band+': ring colour is '+TOKEN[band]+' ('+r.arc+')');
    assert.strictEqual(r.track,'#2E2E2E',band+': track stays gray');assert.strictEqual(r.num,text,band+': the number stays neutral light gray');
    assert.match(r.label||'',new RegExp('^[▲◆●▽] '+band+' \\d+% of open jobs$'),band+': text label names the band ('+r.label+')');assert.strictEqual(r.labelColor,want,band+': label in the band colour');
    const cr=contrast(r.arc,r.bg);assert.ok(cr>=3,band+': ring '+cr.toFixed(2)+':1 against its panel '+r.bg+' (needs 3:1)');
    console.log('  '+band+' score '+pick[band].score+': ring '+r.arc+', '+cr.toFixed(2)+':1 on '+r.bg+', "'+r.label+'"');
    if(shots)await page.locator('#m-detail .m-verdict').screenshot({path:path.join(shots,'stage5-ring-'+band.toLowerCase()+'-390.png')});
    if(shots&&band==='TOP')await page.screenshot({path:path.join(shots,'stage5-ring-detail-top-390x844.png')});
    await closeDetail(page);
  }

  // 4. Animation: once on open (<= 250ms), not replayed by a later repaint of the same sheet.
  await openDetail(page,pick.TOP.id);let r=await ringInfo(page);
  assert.strictEqual(r.anim,'m-ring-fill','fill animates on open');assert.ok(r.dur>0&&r.dur<=0.25,'animation <= 250ms ('+r.dur+'s)');
  await page.evaluate(()=>{document.querySelector('#m-detail .m-ring')._t=1});await page.waitForTimeout(400);   // past the 250ms fill
  assert.strictEqual(await page.evaluate(()=>document.querySelector('#m-detail .m-ring').classList.contains('m-ring-in')),false,'the fill ran once and its class is gone');
  await page.evaluate(()=>PEMobile.refresh());await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(()=>document.querySelector('#m-detail .m-ring')._t),1,'a refresh of the unchanged sheet does not repaint it (so the fill does not replay)');

  // 5. The pay-below case: a strong band next to the red pay warning (both shown, each with its own glyph and words).
  await closeDetail(page);await openDetail(page,BELOW);r=await ringInfo(page);
  const pay=await page.evaluate(()=>{const p=document.querySelector('#m-detail .m-pay');return p&&{cls:p.className,text:p.textContent.trim()}});
  assert.ok(pay&&/fault/.test(pay.cls),'pay below need is shown in red ('+JSON.stringify(pay)+')');
  console.log('  pay-below job: band '+r.band+' ring '+r.arc+' beside "'+pay.text+'"');
  if(shots)await page.locator('#m-detail .m-verdict').screenshot({path:path.join(shots,'stage5-ring-pay-below-390.png')});
  assert.deepStrictEqual(errors,[],'no page errors');await ctx.close();

  // 6. Reduced motion: no ring animation.
  ({ctx,page,errors}=await open({reducedMotion:'reduce'}));
  await openDetail(page,(await page.evaluate(()=>PEMobileBridge.decideRows()[0].id)));r=await ringInfo(page);
  assert.strictEqual(r.anim,'none','no ring animation under reduced motion');
  assert.deepStrictEqual(errors,[],'no page errors (reduced motion)');await ctx.close();

  await browser.close();server.close();console.log('mobile score ring browser: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
