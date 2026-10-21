/* REV-068 (Track M step 2; Grok Bot 18:57 / 19:28 ET): on the phone, score colours come from the percentile bands as on
   desktop: table scores and the drawer ring. 390 x 844 and landscape 874 x 402, 141 open jobs (bands on); fixture
   (bands off) keeps Secondary. Run: node tests/phone-score-colours.browser.js */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const JOB='V2X-A4CCD49EE686';
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  async function open(opts){
    const ctx=await browser.newContext(opts.phone?{viewport:{width:opts.phone[0],height:opts.phone[1]},deviceScaleFactor:3,isMobile:true,hasTouch:true}:{viewport:{width:2560,height:1440},deviceScaleFactor:1});const page=await ctx.newPage(),errors=[],posts=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    if(opts.ls)await page.addInitScript(ls=>{Object.keys(ls).forEach(k=>localStorage.setItem(k,ls[k]))},opts.ls);
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[]}}));
    const W={old:!!opts.oldWriter,refuse:opts.refuse||0,stateFail:opts.stateFail||0,stateReads:0,inFlight:0,maxInFlight:0,store:opts.keepState?{seen:{},reviewed:{}}:null,lie:opts.lie||0};   // old Writer (before REV-053): answers ok with no "reviewed" count and keeps nothing
    await page.route('**/writer*',async r=>{const q=r.request();if(q.method()==='POST'){let b={};try{b=JSON.parse(q.postData()||'{}')}catch(e){}posts.push(b);
        if(b.action==='state'&&opts.postDelay){W.inFlight++;W.maxInFlight=Math.max(W.maxInFlight,W.inFlight);await new Promise(x=>setTimeout(x,opts.postDelay));W.inFlight--}
        if(b.action==='state'&&W.store){Object.assign(W.store.reviewed,(b.state||{}).reviewed||{});Object.assign(W.store.seen,(b.state||{}).seen||{});
          if(W.lie>0){W.lie--;return r.fulfill({json:{ok:false,error:'Lock timeout: another process was holding the lock for too long.'}})}}
        if(b.action==='state'&&W.refuse>0){W.refuse--;return r.fulfill({json:{ok:false,error:'Writer busy (test)'}})}
        return r.fulfill({json:W.old||b.action!=='state'?{ok:true}:{ok:true,seen:Object.keys((b.state||{}).seen||{}).length,incidents:0,reviewed:Object.keys((b.state||{}).reviewed||{}).length}})}
      if(opts.stateDelay&&new URL(q.url()).searchParams.get('action')==='state')await new Promise(x=>setTimeout(x,opts.stateDelay));
      const a=new URL(q.url()).searchParams.get('action');if(a==='state'){W.stateReads++;if(W.stateFail>0){W.stateFail--;return r.abort('failed')}}
      return r.fulfill({json:a==='master'?{ok:true,id:'m',text:opts.master||fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:
        a==='scoring'?(opts.model===false?{ok:true,exists:false}:{ok:true,exists:true,model:{publishedRevision:26,modelVersion:'test'}}):
        a==='state'?{ok:true,state:W.store?JSON.parse(JSON.stringify(W.store)):opts.state||{seen:{},reviewed:{}}}:{ok:true}})});
    await page.goto(base+'/pipeline.html?src=writer&open=jobs');await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(2500);
    return {ctx,page,errors,posts,W};
  }
  const tok=(page,v)=>page.evaluate(v=>{const d=document.createElement('i');d.style.color='var('+v+')';document.body.appendChild(d);const c=getComputedStyle(d).color;d.remove();return c},v);
  const lines=fixture.split('\n'),tpl=lines.find(l=>/\| READY_TO_PURSUE \|/.test(l)),extra=[];for(let i=0;i<130;i++)extra.push(tpl.replace(/^\d+ \| V2X-[0-9A-F]+/,(900+i)+' | V2X-'+String(900+i).padStart(12,'0')));
  const big=lines.slice(0,lines.indexOf(tpl)).concat(extra,lines.slice(lines.indexOf(tpl))).join('\n');
  // 1. Phone, bands on: every score colour = its percentile band token; the old band() class never decides the colour
  for(const [w,h] of [[390,844],[874,402]]){
    const {ctx,page,errors}=await open({phone:[w,h],master:big});
    const want={TOP:await tok(page,'--pe-band-top'),UPPER:await tok(page,'--pe-band-upper'),MID:await tok(page,'--pe-band-mid'),LOW:await tok(page,'--pe-band-low'),HOLD:await tok(page,'--pe-text-secondary'),NONE:await tok(page,'--pe-text-secondary')};
    const cells=await page.$$eval('#grid tbody tr[data-id] .score-badge',els=>els.map(e=>({cls:e.className,col:getComputedStyle(e).color})));
    assert(cells.length>10,'score cells on the phone: '+cells.length);
    let strongNotTop=0;cells.forEach(c=>{const b=(c.cls.match(/band-(top|upper|mid|low|hold|none)/)||[])[1];assert(b,'band class: '+c.cls);assert.equal(c.col,want[b.toUpperCase()],w+'x'+h+' '+c.cls);if(/\bstrong\b/.test(c.cls)&&b!=='top')strongNotTop++});
    if(w===390){
      // drawer ring follows the band too
      const first=await page.$eval('#grid tbody tr[data-id] .score-badge',e=>({id:e.closest('tr').dataset.id,b:(e.className.match(/band-(top|upper|mid|low|hold|none)/)||[])[1]}));
      await page.locator('#grid tbody tr[data-id]').first().tap();await page.waitForTimeout(900);
      const ring=await page.$eval('#drawer .ws-ring',e=>({cls:e.className,ring:getComputedStyle(e).getPropertyValue('--ring').trim()}));
      const ringWant=await page.evaluate(v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim(),'--pe-band-'+first.b);
      assert.equal(ring.ring,ringWant,'phone ring = band token: '+JSON.stringify(ring)+' want '+ringWant);}
    assert.deepEqual(errors,[]);await ctx.close();}

  // 2. Phone, bands off (fixture < 40 eligible): scores in Secondary, never the old green
  {const {ctx,page,errors}=await open({phone:[390,844]});const sec=await tok(page,'--pe-text-secondary');
    const cols=await page.$$eval('#grid tbody tr[data-id] .score-badge',els=>els.map(e=>getComputedStyle(e).color));
    assert(cols.length>0);cols.forEach(c=>assert.equal(c,sec,'bands off: Secondary'));assert.deepEqual(errors,[]);await ctx.close();}

  await browser.close();server.close();console.log('phone-score-colours.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
