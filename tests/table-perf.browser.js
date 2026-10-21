/* REV-088 (perf, Tim 23:35 ET): behaviour kept by the speed-ups, at 1,872 jobs. Phone rows built in stages end complete and in
   the desktop order; sticky columns aligned; opening / closing a job rebuilds only the opened row; a late-built row opens.
   Run: node tests/table-perf.browser.js */
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
  // REV-081: every tab, every <details> opened: no text in the drawer under 11 px
  const under11=async page=>{const out=[];for(const tab of ['overview','posting','fit','application','documents','history']){
      await page.locator('#detail-tabs button[data-dtab="'+tab+'"]').tap();await page.waitForTimeout(500);
      out.push(...await page.evaluate(tab=>{const d=document.getElementById('drawer');d.querySelectorAll('details').forEach(x=>x.open=true);const r=[];
        d.querySelectorAll('*').forEach(e=>{if(!e.getClientRects().length)return;const cs=getComputedStyle(e);if(cs.visibility==='hidden')return;
          if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return;const fs=parseFloat(cs.fontSize);if(fs<11)r.push(tab+': '+e.tagName+'.'+(typeof e.className==='string'?e.className:'')+' '+fs+'px "'+e.textContent.trim().slice(0,24)+'"')});return r},tab));}
    await page.locator('#detail-tabs button[data-dtab="overview"]').tap();await page.waitForTimeout(400);return out};
  const lines=fixture.split('\n'),rowsIdx=lines.map((l,i)=>/^\d+ \| V2X-[0-9A-F]+ \|/.test(l)?i:-1).filter(i=>i>=0),tpls=rowsIdx.map(i=>lines[i]),extra=[];
  for(let i=0;extra.length<1872-tpls.length;i++){const tp=tpls[i%tpls.length];extra.push(tp.replace(/^\d+ \| V2X-[0-9A-F]+/,(1000+i)+' | V2X-'+(0xA00000000000+i).toString(16).toUpperCase()))}
  const last=rowsIdx[rowsIdx.length-1],big=lines.slice(0,last+1).concat(extra,lines.slice(last+1)).join('\n');
  const rowsNow=page=>page.evaluate(()=>[...document.querySelectorAll('#grid tbody tr[data-id]')].map(tr=>tr.dataset.id));
  for(const vp of [[390,844],[2560,1440]]){const phone=vp[0]<500,t=vp.join('x')+': ';
    const {ctx,page,errors}=await open(phone?{phone:vp,master:big}:{master:big});
    // staged rows (phone): the table ends with every row in order, the same set the desktop builds at once
    await page.waitForFunction(()=>{const n=document.querySelectorAll('#grid tbody tr[data-id]').length;return n>0&&n===window.__lastN&&n>=Number(window.__lastN2);},null,{timeout:1}).catch(()=>{});
    let prev=-1,n=0;for(let k=0;k<40;k++){n=(await rowsNow(page)).length;if(n===prev)break;prev=n;await page.waitForTimeout(500)}
    const ids=await rowsNow(page);assert(ids.length>=800,t+'all matching rows built: '+ids.length);assert.equal(new Set(ids).size,ids.length,t+'no duplicate rows');
    if(phone)global.__phoneIds=ids;else assert.deepEqual(ids,global.__phoneIds,t+'phone staged rows = desktop rows, same order');
    // sticky columns: body cells sit at the header offsets (fixSticky from <col> widths)
    const st=await page.evaluate(()=>{const g=document.getElementById('grid'),ths=[...g.querySelectorAll('thead th.sticky')],tr=g.querySelectorAll('tbody tr[data-id]')[5];
      return ths.map(th=>{const td=tr.children[th.cellIndex];return [th.getBoundingClientRect().left,td.getBoundingClientRect().left,getComputedStyle(th).left,getComputedStyle(td).left]})});
    st.forEach((s,i)=>{assert(Math.abs(s[0]-s[1])<=1,t+'sticky column '+i+' aligned: '+JSON.stringify(s));assert.equal(s[2],s[3],t+'sticky left th = td')});
    // opening and closing a job rebuilds only the opened row: the other rows keep their nodes
    await page.evaluate(()=>{document.querySelectorAll('#grid tbody tr[data-id]').forEach(tr=>tr.__keep=1)});
    const pick=ids[7];await page.locator('#grid tbody tr[data-id="'+pick+'"]').click();await page.waitForTimeout(900);
    const after=await page.evaluate(id=>{const trs=[...document.querySelectorAll('#grid tbody tr[data-id]')];return {n:trs.length,kept:trs.filter(tr=>tr.__keep).length,focus:trs.filter(tr=>tr.classList.contains('focus')).map(tr=>tr.dataset.id),openedSeen:trs.find(tr=>tr.dataset.id===id).classList.contains('seen')}},pick);
    assert.equal(after.n,ids.length,t+'same row count after open');assert(after.kept>=ids.length-2,t+'other rows untouched on open: '+after.kept+'/'+ids.length);
    assert.deepEqual(after.focus,[pick],t+'focus moved to the opened row');assert(after.openedSeen,t+'opened row marked seen');
    if(phone){await page.locator('#d-back').tap();await page.waitForTimeout(700);
      const cl=await page.evaluate(()=>{const trs=[...document.querySelectorAll('#grid tbody tr[data-id]')];return {kept:trs.filter(tr=>tr.__keep).length,focus:trs.filter(tr=>tr.classList.contains('focus')).length,n:trs.length}});
      assert.equal(cl.n,ids.length);assert(cl.kept>=ids.length-2,t+'other rows untouched on close');assert.equal(cl.focus,0,t+'no focus after close');
      // a late-built row still opens the sheet
      await page.locator('#grid tbody tr[data-id="'+ids[ids.length-3]+'"]').scrollIntoViewIfNeeded();await page.locator('#grid tbody tr[data-id="'+ids[ids.length-3]+'"]').tap();await page.waitForTimeout(800);
      assert(await page.evaluate(()=>document.getElementById('drawer').classList.contains('pe-sheet')),t+'late-built row opens the sheet');}
    assert.deepEqual(errors,[]);await ctx.close();}
  await browser.close();server.close();console.log('table-perf.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
