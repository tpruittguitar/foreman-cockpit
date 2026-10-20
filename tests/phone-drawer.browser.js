/* REV-081 (Track M step 11; Grok Bot 22:18 ET, p42 item 13): no drawer text under 11 px on any tab (details opened).
   REV-080 (Track M step 10; Grok Bot 22:01 ET, p42 item 12): score breakdown as 4-column rows on the phone.
   REV-076 (Track M step 9; Grok Bot 21:22 ET, p42 item 11): Why label 11 px mono, Fit & Score an inline Cyan link.
   REV-074 (Track M step 8; Grok Bot 21:12 ET, p42 item 6): tabs as one 44 px scrolling underline row, 11 px mono, active in view.
   REV-073 (Track M step 7; Grok Bot 20:54 ET, p42 item 5): state card dropped when quiet, compact otherwise; pay right after the place.
   REV-072 (Track M step 6; Grok Bot 20:35 ET, p42 items 1-4): header row, ‹ Queue, title token, one meta line, ring clear of the decision row.
   REV-071 (Track M step 5; Grok Bot 20:21 ET, phone drawer vs v1.5 p42 B): ring (SVG, --pe-ring-phone 88 px, value 26 px,
   band text right), decision row pinned to the drawer bottom (52 px, no key hints, Pursue · Hold · Research │ Decline),
   evidence rows (44 px, 3 px state bar, glyph, 11 px word), materials after the drawer body (44 px, >= 11 px). 390 / 402.
   Run: node tests/phone-drawer.browser.js */
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
  const lines=fixture.split('\n'),tpl=lines.find(l=>/\| READY_TO_PURSUE \|/.test(l)),extra=[];for(let i=0;i<130;i++)extra.push(tpl.replace(/^\d+ \| V2X-[0-9A-F]+/,(900+i)+' | V2X-'+String(900+i).padStart(12,'0')));
  const big=lines.slice(0,lines.indexOf(tpl)).concat(extra,lines.slice(lines.indexOf(tpl))).join('\n');
  for(const [w,h] of [[390,844],[402,874]]){
    const {ctx,page,errors}=await open({phone:[w,h],master:big});
    await page.locator('#grid tbody tr[data-id]').first().tap();await page.waitForTimeout(1200);
    const r=await page.evaluate(()=>{const d=document.getElementById('drawer'),q=s=>d.querySelector(s),bx=e=>e&&e.getBoundingClientRect(),cs=e=>getComputedStyle(e);
      const under=root=>{const out=[];if(!root)return out;root.querySelectorAll('*').forEach(e=>{if(!e.offsetParent)return;const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());if(own&&parseFloat(cs(e).fontSize)<11)out.push(e.tagName+' '+cs(e).fontSize)});return out};
      const ring=q('.ws-ring'),dec=q('.wh-decide'),ev=q('.ck-checks'),acts=q('.wh-actions'),body=q('#d-body');
      return {ring:{w:bx(ring).width,svg:!!ring.querySelector('svg'),fs:cs(ring.querySelector('b')).fontSize,info:bx(q('.ws-score-info')).left>bx(ring).right-1},
        dec:{pos:cs(dec).position,bottom:cs(dec).bottom,btn:[...dec.querySelectorAll('button')].filter(b=>b.offsetParent).sort((a,b2)=>bx(a).left-bx(b2).left).map(b=>({t:b.innerText.trim(),h:bx(b).height,fs:cs(b).fontSize})),sub:[...dec.querySelectorAll('sub')].some(s=>s.offsetParent),fits:bx(dec).right<=bx(d).right+0.5},
        ev:[...ev.querySelectorAll('li')].map(li=>({c:li.className,h:bx(li).height,bar:cs(li).borderLeftWidth,glyph:getComputedStyle(li,'::before').content,sfs:li.querySelector('small')?cs(li.querySelector('small')).fontSize:null})),
        acts:{pos:cs(acts).position,after:bx(acts).top>=bx(body).bottom-1,btn:[...acts.querySelectorAll('button')].map(b=>({h:bx(b).height,fs:cs(b).fontSize}))},
        under:[].concat(under(q('.ws-score')),under(dec),under(ev),under(acts),under(q('.d-head')),under(q('.wh-top'))),
        hd:{h:bx(q('.d-head')).height,back:q('#d-back')&&q('#d-back').offsetParent?q('#d-back').innerText.trim():null,backH:bx(q('#d-back')).height,label:q('.d-label').innerText,lfs:cs(q('.d-label')).fontSize,
          lines:Math.round(bx(q('.d-label')).height/parseFloat(cs(q('.d-label')).lineHeight)),title:cs(q('#d-title')).fontSize,meta:{fs:cs(q('#d-meta')).fontSize,h:bx(q('#d-meta')).height,t:q('#d-meta').innerText},chips:!!q('.wh-chips').offsetParent},
        clear:{ringBottom:bx(ring).bottom,decTop:bx(dec).top,scoreBottom:bx(q('.ws-score')).bottom},qv:cs(document.getElementById('qh-view')).fontSize}});
    const t=w+'x'+h+': ';
    assert.equal(r.ring.w,88,t+'ring 88 px (--pe-ring-phone)');assert(r.ring.svg,t+'SVG ring');assert.equal(r.ring.fs,'26px',t+'ring value 26 px');assert(r.ring.info,t+'band text to the right of the ring');
    assert.equal(r.dec.pos,'sticky',t+'decision row pinned');assert.equal(r.dec.bottom,'0px');assert(r.dec.fits,t+'decision row inside the drawer');
    assert.deepEqual(r.dec.btn.map(b=>b.t.replace(/\s+/g,' ')),['✓ Pursue','Hold','Research','⊖ Decline'].map(x=>x),t+'decision buttons: '+JSON.stringify(r.dec.btn));
    r.dec.btn.forEach(b=>assert(b.h>=52,t+'decision target >= 52 px: '+JSON.stringify(b)));assert.equal(r.dec.sub,false,t+'no key hints on the phone');
    assert(r.ev.length===5,'five evidence lines');r.ev.forEach(e=>{assert(e.h>=44,t+'evidence row >= 44 px');assert.equal(e.bar,'3px');assert.match(e.glyph,/^"[✓✕?≈]"$/,t+'state glyph: '+JSON.stringify(r.ev));assert.equal(e.sfs,'11px')});
    assert.equal(r.acts.pos,'static',t+'materials not sticky');assert(r.acts.after,t+'materials after the drawer body');r.acts.btn.forEach(b=>{assert(b.h>=44,t+'materials target >= 44 px');assert(parseFloat(b.fs)>=11)});
    assert.deepEqual(r.under,[],t+'no text under 11 px in ring / decisions / evidence / materials');
    // REV-072 (p42 items 1-4): one 44 px header row with "‹ Queue", 11 px label with the bucket word and no JOB DRAWER / LOCKED ON MAP;
    // 22 px title; one 11 px meta line carrying pay; chips row gone; the ring is fully clear of the pinned decision row on first open.
    assert.equal(r.hd.h,44,t+'header row 44 px');assert.equal(r.hd.back,'‹ Queue',t+'back control');assert(r.hd.backH>=44,t+'back target >= 44 px');
    assert.equal(r.hd.lfs,'11px',t+'label 11 px');assert(!/JOB DRAWER|LOCKED ON MAP/.test(r.hd.label),t+'label: '+r.hd.label);assert.match(r.hd.label,/^◉ V2X-[0-9A-F]+ · [A-Z ]+$/,t+'label: '+r.hd.label);
    assert.equal(r.hd.title,'22px',t+'title --pe-fs-drawer-title-phone');assert.equal(r.hd.meta.fs,'11px');assert(r.hd.meta.h<=16,t+'meta is one line: '+JSON.stringify(r.hd.meta));assert.match(r.hd.meta.t,/\$|Pay unknown/,t+'meta carries pay');
    assert.equal(r.hd.chips,false,t+'chips row dropped');
    assert(r.clear.ringBottom<=r.clear.decTop,t+'ring clear of the decision row: '+JSON.stringify(r.clear));assert(r.clear.scoreBottom<=r.clear.decTop,t+'score block clear: '+JSON.stringify(r.clear));
    assert(parseFloat(r.qv)>=11,t+'.qh-view >= 11 px: '+r.qv);
    // REV-074 (p42 item 6): tabs are one 44 px underline row at 11 px mono, no boxes, scrolls sideways; the active tab is in view.
    const tb=await page.evaluate(()=>{const dt=document.getElementById('detail-tabs'),cs=e=>getComputedStyle(e),bs=[...dt.querySelectorAll('button')],r=dt.getBoundingClientRect();
      return {h:r.height,ox:cs(dt).overflowX,tops:[...new Set(bs.map(b=>Math.round(b.getBoundingClientRect().top)))],btn:bs.map(b=>({t:b.innerText,fs:cs(b).fontSize,h:b.getBoundingClientRect().height,bw:cs(b).borderTopWidth,bl:cs(b).borderLeftWidth,bg:cs(b).backgroundColor,on:b.classList.contains('on'),c:cs(b).color,u:getComputedStyle(b,'::after').height}))}});
    assert.equal(tb.h,44,t+'tab row 44 px');assert.equal(tb.ox,'auto',t+'tab row scrolls sideways');assert.equal(tb.tops.length,1,t+'tabs on one line: '+JSON.stringify(tb.tops));
    assert.equal(tb.btn.length,6,t+'six tabs');tb.btn.forEach(b=>{assert.equal(b.fs,'11px',t+'tab 11 px: '+b.t);assert(b.h>=44,t+'tab target 44 px');assert.equal(b.bw,'0px',t+'no box: '+b.t);assert.equal(b.bl,'0px');assert.equal(b.bg,'rgba(0, 0, 0, 0)',t+'no fill: '+b.t)});
    const on=tb.btn.filter(b=>b.on);assert.equal(on.length,1);assert.equal(on[0].c,await tok(page,'--pe-cyan'),t+'active tab cyan');assert.equal(on[0].u,'2px',t+'active underline 2 px');
    const sec=await tok(page,'--pe-text-secondary');tb.btn.filter(b=>!b.on).forEach(b=>assert.equal(b.c,sec,t+'resting tab Secondary: '+b.t));
    await page.locator('#detail-tabs button[data-dtab="history"]').tap();await page.waitForTimeout(500);
    const hv=await page.evaluate(()=>{const dt=document.getElementById('detail-tabs'),a=dt.querySelector('button.on'),r=dt.getBoundingClientRect(),b=a.getBoundingClientRect();return {t:a.dataset.dtab,inView:b.left>=r.left-1&&b.right<=r.right+1}});
    assert.equal(hv.t,'history');assert(hv.inView,t+'active tab scrolled into view');
    await page.locator('#detail-tabs button[data-dtab="overview"]').tap();await page.waitForTimeout(500);
    // REV-076 (p42 item 11): Why label mono 11 px, "Fit & Score ›" an inline Cyan link (no box, no capitals, 44 px touch), opens Fit & Score.
    const wy=await page.evaluate(()=>{const d=document.getElementById('d-body'),cs=e=>getComputedStyle(e),l=d.querySelector('.why-link'),lab=[...d.querySelectorAll('.sec-label')].find(e=>/^why$/i.test(e.innerText.trim())),w=d.querySelector('.why');
      const lr=l.getClientRects()[0];return {lab:lab&&{fs:cs(lab).fontSize,ff:cs(lab).fontFamily,c:cs(lab).color},link:{d:cs(l).display,bw:cs(l).borderTopWidth,bg:cs(l).backgroundColor,tt:cs(l).textTransform,c:cs(l).color,td:cs(l).textDecorationLine,fs:cs(l).fontSize,wfs:cs(w).fontSize,h:parseFloat(getComputedStyle(l,'::before').height),t:l.innerText}}});
    assert(wy.lab,t+'Why label');assert.equal(wy.lab.fs,'11px',t+'Why label 11 px');assert.equal(wy.lab.c,await tok(page,'--pe-text-secondary'));
    assert.match(wy.link.d,/^inline/,t+'Fit & Score link inline');assert.equal(wy.link.bw,'0px',t+'no box');assert.equal(wy.link.bg,'rgba(0, 0, 0, 0)');assert.equal(wy.link.tt,'none',t+'no capitals');
    assert.equal(wy.link.c,await tok(page,'--pe-cyan'),t+'link Cyan');assert.equal(wy.link.td,'underline');assert.equal(wy.link.fs,wy.link.wfs,t+'link at the text size');assert(wy.link.h>=44,t+'link touch >= 44 px: '+wy.link.h);
    await page.locator('#d-body .why-link').tap();await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>document.querySelector('#detail-tabs button.on').dataset.dtab),'fit',t+'link opens Fit & Score');
    await page.locator('#detail-tabs button[data-dtab="overview"]').tap();await page.waitForTimeout(500);
    // REV-080 (p42 item 12): breakdown rows are a 4-column grid (name · weight · bar · points), 28 px, 13 px text, nothing clipped;
    // unknown rows say "? " and UNKNOWN in mono 11 px; the footer is mono 11 px.
    const bd=await page.evaluate(()=>{const b=document.querySelector('#d-body .bd'),cs=e=>getComputedStyle(e);return {rows:[...b.querySelectorAll('.bd-row')].map(r=>({unk:r.classList.contains('unk'),d:cs(r).display,n:cs(r).gridTemplateColumns.split(' ').length,h:Math.round(r.getBoundingClientRect().height),fs:cs(r.querySelector('.nm')).fontSize,
      pfs:cs(r.querySelector('.p')).fontSize,q:getComputedStyle(r.querySelector('.nm'),'::before').content,clip:[...r.children].filter(c=>c.scrollWidth>c.clientWidth+1).map(c=>c.className),right:r.querySelector('.p').getBoundingClientRect().right,rr:r.getBoundingClientRect().right})),foot:cs(document.querySelector('#d-body .bd-foot')).fontSize}});
    assert(bd.rows.length>=5,t+'breakdown rows');bd.rows.forEach((r,i)=>{assert.equal(r.d,'grid',t+'row '+i+' grid');assert.equal(r.n,4,t+'four columns');assert(r.h>=28,t+'row 28 px');assert.equal(r.fs,'13px');assert.deepEqual(r.clip,[],t+'nothing clipped in row '+i);assert(r.right<=r.rr+1,t+'points inside the row');
      if(r.unk){assert.equal(r.q,'"? "',t+'unknown row marked "? "');assert.equal(r.pfs,'11px')}});assert(bd.rows.some(r=>r.unk),t+'fixture has an unknown row');assert.equal(bd.foot,'11px',t+'footer 11 px');
    // REV-073 (p42 item 5): with nothing to verify, block or follow up, the state card is gone on the phone; meta has pay right after the place.
    const de=await page.evaluate(()=>{const s=document.querySelector('#drawer .decision-essentials');return {quiet:s.classList.contains('de-quiet'),shown:!!s.offsetParent,meta:document.getElementById('d-meta').innerText}});
    assert.equal(de.quiet,true,t+'first job has a quiet state card');assert.equal(de.shown,false,t+'quiet state card hidden on the phone');
    assert.match(de.meta,/^[^·]+ · [^·]+ · (~?\$|Pay unknown)/,t+'pay right after the place: '+de.meta);
    assert.deepEqual(await under11(page),[],t+'first job: no drawer text under 11 px on any tab');
    if(w===390)await page.screenshot({path:(process.env.PIPELINE_UI_ARTIFACTS||require('os').tmpdir())+'/phone-drawer-390x844.png'});
    await page.locator('#d-back').tap();await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>document.getElementById('drawer').classList.contains('on')),false,t+'‹ Queue closes the drawer');
    // an APPLIED job keeps a compact card: no "Current state" row, 11 px labels, next step as a 44 px inline link
    await page.evaluate(id=>{location.hash='#'+encodeURIComponent(JSON.stringify({t:'pipeline',j:id}))},'V2X-E48592F5CB73');await page.reload();
    await page.waitForSelector('#drawer.on .decision-essentials');await page.waitForTimeout(1500);
    const ap=await page.evaluate(()=>{const s=document.querySelector('#drawer .decision-essentials'),cs=e=>getComputedStyle(e),b=s.querySelector('.next-job-step'),st=s.querySelector('.ds-state');
      return {shown:!!s.offsetParent,state:!!st.offsetParent,labels:[...s.querySelectorAll('b')].filter(e=>e.offsetParent).map(e=>cs(e).fontSize),btn:{h:b.getBoundingClientRect().height,bg:cs(b).backgroundColor,bw:cs(b).borderTopWidth,fs:cs(b).fontSize,t:b.innerText.trim()},h:s.getBoundingClientRect().height}});
    assert.match(await page.locator('#drawer .d-label:not(.empty)').innerText(),/V2X-E48592F5CB73 · /,t+'APPLIED job open');
    if(w===390){await page.evaluate(()=>document.querySelector('#drawer .d-head').scrollIntoView({block:'start'}));await page.waitForTimeout(300);
      await page.screenshot({path:(process.env.PIPELINE_UI_ARTIFACTS||require('os').tmpdir())+'/phone-drawer-applied-390x844.png'});}
    assert.equal(ap.shown,true,t+'APPLIED job shows the state card');assert.equal(ap.state,false,t+'no Current state row on the phone (bucket is in the header)');
    ap.labels.forEach(f=>assert.equal(f,'11px',t+'card labels 11 px'));assert(ap.btn.h>=44,t+'next step target >= 44 px');assert.equal(ap.btn.bw,'0px',t+'next step is an inline link');assert.equal(ap.btn.fs,'13px');
    assert(ap.h<=120,t+'compact card: '+JSON.stringify(ap));
    assert.deepEqual(await under11(page),[],t+'APPLIED job: no drawer text under 11 px on any tab');
    assert.deepEqual(errors,[]);await ctx.close();}
  // desktop drawer unchanged: decision row static, ring 124 px
  {const {ctx,page,errors}=await open({master:big});await page.locator('#grid tbody tr[data-id]').first().click();await page.waitForTimeout(900);
    const d=await page.evaluate(()=>({ring:document.querySelector('#drawer .ws-ring').getBoundingClientRect().width,acts:getComputedStyle(document.querySelector('#drawer .wh-actions')).position}));
    assert.equal(d.ring,124,'desktop ring 124 px');assert.deepEqual(errors,[]);await ctx.close();}
  await browser.close();server.close();console.log('phone-drawer.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
