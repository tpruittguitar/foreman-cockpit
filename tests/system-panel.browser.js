/* SYS-1 (Grok Bot, 2026-10-19): the System panel (#writer-panel) wraps every line; no sideways scroll at any size.
   Cause: the panel is a DOM child of header .writer-identity (white-space: nowrap) and inherited it.
   Checked at 2560x1440, 1440x900 and 390x844 (phone) with long content appended: no horizontal overflow, nothing past its box,
   no ellipsis, no text under 11 px (L-1), close button size, phone panel above the bottom bar.
   Run: node tests/system-panel.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for tests/mobile.browser.js) */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');

(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const sizes=[{viewport:{width:2560,height:1440}},{viewport:{width:1440,height:900}},{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3}];
  for(const opt of sizes){
    const vp=opt.viewport,what=vp.width+'x'+vp.height,phone=!!opt.isMobile;
    const ctx=await browser.newContext(opt),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');return r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:a==='writer_status'?{ok:true,level:'ok',warnings:[],queue:{processing:[]}}:{ok:true}})});
    await page.goto(base+'/pipeline.html');await page.waitForSelector('#writer-badge');await page.waitForTimeout(500);
    await page.evaluate(()=>document.getElementById('writer-badge').click());await page.waitForSelector('#writer-panel:not([hidden])');await page.waitForTimeout(200);
    // long content, the kinds that overflowed (build rows with PR titles and a SHA, AI usage rows, work cards with mono errors)
    await page.evaluate(()=>{
      const p=document.getElementById('writer-panel'),long='REV-028 · F01 no-job panel, full-width KPI row, BUILD 3–5 (build step 4) with an extra long tail to force wrapping (#128)';
      const sha='d9b417f3d3982eba48e6b225e1d8ff09c6861ff5d9b417f3d3982eba48e6b225e1d8ff09c6861ff5';
      let h='<div class="build-row"><span class="build-key">LIVE CODE</span><span class="build-value">'+long+'</span></div>'+
        '<div class="build-row"><span class="build-key">SCORING</span><span class="build-value">model rev 24 · published 2026-10-18 23:41 · canonical rules TIM_PIPELINE_RULES_CANONICAL v12 · weights 35/30/15/10/5/5/0/0</span></div>'+
        '<div class="build-row"><span class="build-key">FRONTEND</span><span class="build-value"><span class="pill ok">LIVE</span> '+long+' <span class="mono">'+sha+'</span></span></div>';
      const now=Date.now(),proj=['claude','chatgpt','grok','claude','chatgpt'].map((pv,i)=>({provider:pv,label:'weekly all-models limit window number '+i+' with a long label',usedPct:20+i*15,verdict:['LASTS','BEFORE_RESET','OUT','UNKNOWN','RESET_PASSED'][i],resetsAt:now+86400000*(i+1),runOutAt:now+3600000*(i+2),rate:1.25+i,basis:'last two readings over 6 h',ageH:i+.5}));
      if(window.PipelineAiUsage)h+=PipelineAiUsage.html(proj);
      h+=[1,2].map(i=>'<div class="inc-work-item"><div class="inc-work-title">OPERATION-ID-FORGE-WEB-CHATGPT-B0'+i+'-20261019T004500Z-WRITER-QUEUE-RETRY-LONG-IDENTIFIER-'+i+'</div><div class="inc-work-error">Error: Exception: Service invoked too many times for one day: urlfetch. at fetchMaster_(Code:412:17) at runWriterQueue_(Code:901:5) payload=/queue/hold/FORGE-WEB-CHATGPT-B0'+i+'.json</div><div class="inc-work-next">Next: retry after the quota resets; nothing is lost, the payload is kept in /queue/hold.</div></div>').join('');
      p.insertAdjacentHTML('beforeend',h);
    });
    await page.waitForTimeout(150);
    const m=await page.evaluate(()=>{
      const p=document.getElementById('writer-panel'),cs=getComputedStyle(p),pr=p.getBoundingClientRect();
      const contentRight=pr.left+p.clientLeft+p.clientWidth-parseFloat(cs.paddingRight);
      const bad=[],ell=[],small=[];
      const clipped=e=>{for(let a=e.parentElement;a&&a!==p;a=a.parentElement){const s=getComputedStyle(a);if(s.overflowX==='hidden'||s.overflowX==='clip'||s.overflow==='hidden')return true}return false};
      p.querySelectorAll('*').forEach(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();if(s.display==='none'||!r.width)return;
        const hasText=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
        if(!hasText&&(s.position==='absolute'||clipped(e)))return;
        const par=e.parentElement,ps=getComputedStyle(par),pb=par.getBoundingClientRect(),parRight=pb.left+par.clientLeft+par.clientWidth-parseFloat(ps.paddingRight);
        const lim=Math.min(contentRight,par===p?contentRight:Math.max(parRight,pb.right-par.clientLeft));
        if(r.right>lim+0.5)bad.push((e.className||e.tagName)+' '+r.right.toFixed(1)+'>'+lim.toFixed(1));
        if(s.textOverflow==='ellipsis'&&hasText)ell.push(e.className||e.tagName);
        if(hasText&&parseFloat(s.fontSize)<10.95)small.push((e.className||e.tagName)+' '+s.fontSize+' "'+e.textContent.trim().slice(0,20)+'"');});
      const x=document.getElementById('sys-close').getBoundingClientRect();
      const hitEl=document.elementFromPoint(innerWidth-30,innerHeight-8);
      return {sw:p.scrollWidth,cw:p.clientWidth,docW:document.documentElement.scrollWidth,vw:innerWidth,ws:cs.whiteSpace,w:pr.width,bad,ell,small,close:[x.width,x.height],bottomInPanel:!!hitEl&&p.contains(hitEl)};
    });
    assert(m.sw<=m.cw,what+': panel scrollWidth '+m.sw+' <= clientWidth '+m.cw);
    assert(m.docW<=m.vw,what+': page has no sideways scroll ('+m.docW+' > '+m.vw+')');
    assert.equal(m.ws,'normal',what+': panel white-space');
    assert.deepEqual(m.bad,[],what+': nothing runs past its box');
    assert.deepEqual(m.ell,[],what+': no ellipsis in the panel');
    assert.deepEqual(m.small,[],what+': no text under 11 px');
    if(phone){
      assert(Math.abs(m.w-vp.width)<=0.5,what+': phone panel is full width ('+m.w+')');
      assert(m.close[0]>=44&&m.close[1]>=44,what+': close >= 44x44 ('+m.close+')');
      assert(m.bottomInPanel,what+': the bottom of the panel is not covered by the bottom bar');
    }else{
      assert(m.w>=460-0.5&&m.w<=600+0.5,what+': panel width '+m.w+' in 460-600');
      assert(m.close[0]>=32&&m.close[1]>=32,what+': close >= 32x32 ('+m.close+')');
    }
    assert.deepEqual(errors,[],what+': no page errors');
    await ctx.close();
  }
  await browser.close();server.close();console.log('system panel browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
