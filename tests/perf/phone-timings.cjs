/* REV-088: phone timings at 390x844, 4x CPU throttle, synthetic 1,872-job master (mocked Writer). Not part of npm test.
   Run: N=1872 RUNS=5 node tests/perf/phone-timings.cjs   (REPO=<checkout> measures another tree). Prints medians in ms. */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=process.env.REPO||path.resolve(__dirname,'../..');
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
    await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(2500);
    return {ctx,page,errors,posts,W};
  }
  const tok=(page,v)=>page.evaluate(v=>{const d=document.createElement('i');d.style.color='var('+v+')';document.body.appendChild(d);const c=getComputedStyle(d).color;d.remove();return c},v);
  // REV-081: every tab, every <details> opened: no text in the drawer under 11 px
  const under11=async page=>{const out=[];for(const tab of ['overview','posting','fit','application','documents','history']){
      await page.locator('#detail-tabs button[data-dtab="'+tab+'"]').tap();await page.waitForTimeout(500);
      out.push(...await page.evaluate(tab=>{const d=document.getElementById('drawer');d.querySelectorAll('details').forEach(x=>x.open=true);const r=[];
        d.querySelectorAll('*').forEach(e=>{if(!e.getClientRects().length)return;const cs=getComputedStyle(e);if(cs.visibility==='hidden')return;
          if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return;const fs=parseFloat(cs.fontSize);if(fs<11)r.push(tab+': '+e.tagName+'.'+(typeof e.className==='string'?e.className:'')+' '+fs+'px "'+e.textContent.trim().slice(0,24)+'"')});return r},tab));}
    await page.locator('#detail-tabs button[data-dtab="overview"]').tap();await page.waitForTimeout(400);return out};
  const lines=fixture.split('\n'),rowsIdx=lines.map((l,i)=>/^\d+ \| V2X-[0-9A-F]+ \|/.test(l)?i:-1).filter(i=>i>=0),tpls=rowsIdx.map(i=>lines[i]),extra=[];
  const N=+process.env.N||1872;for(let i=0;extra.length<N-tpls.length;i++){const tp=tpls[i%tpls.length];extra.push(tp.replace(/^\d+ \| V2X-[0-9A-F]+/,(1000+i)+' | V2X-'+(0xA00000000000+i).toString(16).toUpperCase()))}
  const last=rowsIdx[rowsIdx.length-1];const big=lines.slice(0,last+1).concat(extra,lines.slice(last+1)).join('\n');
  const RUNS=+process.env.RUNS||3,out={load:[],open:[],tab:[],scroll:[],close:[]};
  for(let run=0;run<RUNS;run++){
    const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});const page=await ctx.newPage();
    const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));await page.route('**/geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[]}}));
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');if(r.request().method()==='POST')return r.fulfill({json:{ok:true}});
      return r.fulfill({json:a==='master'?{ok:true,id:'m',text:big,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:a==='scoring'?{ok:true,exists:true,model:{publishedRevision:26,modelVersion:'test'}}:a==='state'?{ok:true,state:{seen:{},reviewed:{}}}:{ok:true}})});
    const t0=Date.now();await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#grid tbody tr[data-id]',{timeout:120000});
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));out.load.push(Date.now()-t0);
    const nrows=await page.evaluate(()=>document.querySelectorAll('#grid tbody tr[data-id]').length);
    await page.waitForTimeout(3000);
    const tap=async(sel,done)=>{const t=Date.now();await page.locator(sel).first().tap({timeout:60000});await page.waitForFunction(done,null,{timeout:60000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return Date.now()-t};
    out.open.push(await tap('#grid tbody tr[data-id] >> nth=3','(document.getElementById("drawer").classList.contains("pe-sheet")||document.body.classList.contains("pe-sheet"))'));await page.waitForTimeout(800);
    out.tab.push(await tap('#detail-tabs button[data-dtab="posting"]','document.querySelector("#detail-tabs button.on").dataset.dtab==="posting"'));await page.waitForTimeout(500);
    out.close.push(await tap('#d-back','!(document.getElementById("drawer").classList.contains("pe-sheet")||document.body.classList.contains("pe-sheet"))'));await page.waitForTimeout(800);
    out.scroll.push(await page.evaluate(async()=>{const w=document.getElementById('gridwrap');let sc=w;if(w.scrollHeight<=w.clientHeight+1){sc=w.parentElement;while(sc&&!(sc.scrollHeight>sc.clientHeight+1&&/auto|scroll/.test(getComputedStyle(sc).overflowY)))sc=sc.parentElement}
      const frames=[];let last=performance.now();const max=sc.scrollHeight-sc.clientHeight,step=Math.max(200,max/40);
      for(let y=0;y<=Math.min(max,8000);y+=step){sc.scrollTop=y;await new Promise(r=>requestAnimationFrame(r));const n=performance.now();frames.push(n-last);last=n}
      frames.sort((a,b)=>a-b);return {frames:frames.length,p50:Math.round(frames[frames.length>>1]),p95:Math.round(frames[Math.floor(frames.length*.95)]),max:Math.round(frames[frames.length-1]),scroller:sc.id||sc.className}}));
    if(run===0)console.log('rows rendered',nrows);
    await ctx.close();}
  const med=a=>a.slice().sort((x,y)=>x-y)[a.length>>1];
  console.log(JSON.stringify({N,load_ms:med(out.load),open_ms:med(out.open),tab_ms:med(out.tab),close_ms:med(out.close),scroll:out.scroll[out.scroll.length>>1],raw:out}));
  await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
