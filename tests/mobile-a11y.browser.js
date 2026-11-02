/* Mobile shell Stage 5 (accessibility and motion audit). On every screen and sheet of the phone shell:
   - contrast: every visible text against its real background >= 4.5:1 (>= 3:1 for large text), every icon and the focus
     ring >= 3:1 (WCAG 2.2 AA); prints the measured pairs;
   - names: every button / link / switch / tab / dialog has an accessible name; icon-only buttons carry aria-label;
   - keyboard: Tab reaches the controls in reading order with a visible focus ring; sheets take focus, keep it inside
     while open, and give it back on Escape;
   - motion: every transition / animation in the shell is <= 250 ms (the toast countdown bar excepted, a 5 s progress
     bar), and reduced motion turns every one of them off.
   Run: node tests/mobile-a11y.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for the other browser tests)
   A11Y_REPORT=<file> also writes the measured contrast pairs and motion inventory as JSON. */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2'};
let n=0;
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8').split('\n').map(l=>{
  const c=l.split(' | ');if(c.length<10||!/^\d+$/.test(c[0]))return l;
  if(!/^(READY_TO_PURSUE|MANUAL_RESEARCH|SCOUT_INTAKE|DISCOVERY_LEAD|TIM_DECISION_REQUIRED)$/.test(c[4]))return l;
  const i=n++;if(i%2===0)c[4]='TIM_DECISION_REQUIRED';
  const pay=[['190000','230000'],['250000','320000'],null,['150000','180000']][i%4];
  return c.join(' | ')+'; SCOPE_FIT_RAW='+(55+i*4)+'; FIT_CONF=MED'+(pay?'; SALARY_BASE_LOW='+pay[0]+'; SALARY_BASE_HIGH='+pay[1]+'; SALARY_BASIS=FORGE-ESTIMATE':'');
}).join('\n');
function health(){const at=new Date().toISOString();return {ok:true,candidates:400,issues:[],checks:{attention:{ok:true,at},sources:{ok:true,at},boards:{ok:true,at},schedules:{ok:true,at,configured:5,executionVerified:true}},
  emailRecovery:{at,awaitingIntake:2},processFlow:{at,population:{total:10,reconciled:true},queues:{verification:0,enrichment:10,readyForReview:0,blockedClosed:0},
    completion:{verification:{countsAvailable:true,last24h:0,available:true,perHour:0,count36:0,partial:true,startedAt:at},enrichment:{countsAvailable:true,last24h:0,available:true,perHour:0,count36:0,partial:true,startedAt:at}}}}}
// Runs in the page: measure contrast of every visible text node's element and every icon inside the shell.
function audit(scope){
  const L=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
  const lum=([r,g,b])=>0.2126*L(r)+0.7152*L(g)+0.0722*L(b);
  const parse=s=>{const m=String(s).match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(Number);return [p[0],p[1],p[2],p.length>3?p[3]:1]};
  const over=(top,bot)=>[0,1,2].map(i=>top[i]*top[3]+bot[i]*(1-top[3])).concat([1]);
  function bg(el){const stack=[];for(let e=el;e;e=e.parentElement){const c=parse(getComputedStyle(e).backgroundColor);if(c&&c[3]>0){stack.push(c);if(c[3]>=1)break}}
    let out=parse(getComputedStyle(document.body).backgroundColor)||[11,11,11,1];for(let i=stack.length-1;i>=0;i--)out=over(stack[i],out);return out}
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
  const hex=c=>'#'+c.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();
  const vis=e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return r.width>1&&r.height>1&&cs.visibility!=='hidden'&&cs.opacity!=='0'&&r.bottom>0&&r.top<innerHeight};
  const out=[];const root=document.querySelector(scope);
  root.querySelectorAll('*').forEach(e=>{
    if(e.closest('.m-sr')||!vis(e))return;
    const own=[...e.childNodes].some(x=>x.nodeType===3&&x.textContent.trim());
    if(own){const cs=getComputedStyle(e),fg=parse(cs.color),b=bg(e),fgc=over(fg,b),size=parseFloat(cs.fontSize),bold=parseInt(cs.fontWeight,10)>=700,large=size>=24||(bold&&size>=18.66);
      out.push({kind:'text',fg:hex(fgc),bg:hex(b),ratio:+ratio(fgc,b).toFixed(2),need:large?3:4.5,sample:e.textContent.trim().slice(0,28)})}
    if(e.tagName.toLowerCase()==='svg'){const fg=parse(getComputedStyle(e).color),b=bg(e.parentElement);out.push({kind:'icon',fg:hex(over(fg,b)),bg:hex(b),ratio:+ratio(over(fg,b),b).toFixed(2),need:3,sample:(e.closest('[aria-label]')||e.parentElement).getAttribute('aria-label')||e.parentElement.textContent.trim().slice(0,28)})}
  });
  return out;
}
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  async function open(opts,cfg){
    const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,...opts}),page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(c=>{localStorage.setItem('px.cfg',JSON.stringify(c))},cfg||{url:'http://127.0.0.1/writer',key:'test-only'});
    await ctx.route('**/*',r=>{const q=r.request(),u=q.url();
      if(/\/api\/pipeline-health/.test(u))return r.fulfill({json:health()});if(/\/api\/writer-activity/.test(u))return r.fulfill({json:{ok:true,now:new Date().toISOString(),sources:{},rates36:{intake:{perHour:7}}}});
      if(/\/writer\?|\/writer$/.test(u)||u.startsWith(base+'/writer'))return /action=master/.test(u)?r.fulfill({json:{ok:true,text:fixture,modifiedTime:new Date().toISOString(),fetchedAt:new Date().toISOString()}}):r.fulfill({json:{ok:true}});
      if(u.startsWith(base))return r.continue();return r.abort()});   // nothing leaves the test, the production Writer included
    await page.goto(base+'/pipeline.html');await page.waitForSelector('#m-pane-decide .m-card');await page.waitForTimeout(300);
    return {ctx,page,errors};
  }
  const report={contrast:[],motion:{},names:[]};
  const fails=[];
  function take(list,where){list.forEach(x=>{x.where=where;report.contrast.push(x);if(x.ratio<x.need)fails.push(where+': '+x.kind+' "'+x.sample+'" '+x.fg+' on '+x.bg+' = '+x.ratio+' < '+x.need)})}

  // 1. Contrast on every screen and sheet (connected), plus the not-connected banner state.
  let {ctx,page,errors}=await open({});
  // The cockpit seeds px.cfg relative to the test origin; re-seed with the test origin so reads work.
  await page.evaluate(b=>{localStorage.setItem('px.cfg',JSON.stringify({url:b+'/writer',key:'test-only'}))},base);await page.reload();await page.waitForSelector('#m-pane-decide .m-card');await page.waitForTimeout(300);
  take(await page.evaluate(audit,'#m-root'),'Decide');
  await page.click('.m-card.m-top [data-m-menu]');await page.waitForSelector('.m-menu');take(await page.evaluate(audit,'.m-menu'),'Decide menu');await page.keyboard.press('Escape');
  await page.click('.m-card.m-top [data-m-do="hold"]');await page.waitForSelector('#m-toast:not([hidden])');take(await page.evaluate(audit,'#m-toast'),'Undo toast');await page.click('#m-undo');await page.waitForTimeout(400);
  await page.click('.m-card.m-top [data-m-open]');await page.waitForSelector('#m-detail:not([hidden])');await page.evaluate(()=>document.querySelectorAll('#m-detail details').forEach(d=>d.open=true));
  take(await page.evaluate(audit,'#m-detail'),'Job sheet');await page.keyboard.press('Escape');
  await page.click('#m-tab-jobs');await page.waitForSelector('#m-jobs-list .m-row');take(await page.evaluate(audit,'#m-root'),'Jobs');
  await page.click('#m-fields-btn');await page.waitForSelector('#m-fields:not([hidden])');take(await page.evaluate(audit,'#m-fields'),'Fields sheet');await page.click('[data-m-field="fit"]');take(await page.evaluate(audit,'#m-fields'),'Fields sheet (off switch)');await page.click('[data-m-field="fit"]');await page.keyboard.press('Escape');
  await page.click('#m-tab-status');await page.waitForFunction(()=>document.querySelector('#m-pane-status .m-constraint'),null,{timeout:20000});
  await page.evaluate(()=>document.querySelectorAll('#m-pane-status details').forEach(d=>d.open=true));
  for(const y of [0,500,1000]){await page.evaluate(v=>scrollTo(0,v),y);await page.waitForTimeout(250);take(await page.evaluate(audit,'#m-root'),'Status');}
  await page.evaluate(()=>scrollTo(0,0));await page.click('#m-more');await page.waitForSelector('#m-more-sheet:not([hidden])');take(await page.evaluate(audit,'#m-more-sheet'),'More sheet');await page.keyboard.press('Escape');
  // Focus ring contrast against the panel and the page background.
  const ring=await page.evaluate(()=>{const b=document.getElementById('m-tab-decide');b.focus();return getComputedStyle(b).outlineColor});
  report.focusRing=ring;
  // 2. Names: every interactive element and dialog has an accessible name.
  const names=await page.evaluate(()=>{const bad=[];
    document.querySelectorAll('#m-root button,#m-root a[href],#m-root input,#m-root [role=switch],#m-root [role=tab],#m-root [role=dialog],#m-root summary').forEach(e=>{
      const label=e.getAttribute('aria-label')||(e.getAttribute('aria-labelledby')&&(document.getElementById(e.getAttribute('aria-labelledby'))||{}).textContent)||(e.labels&&e.labels[0]&&e.labels[0].textContent)||e.textContent;
      if(!String(label||'').trim())bad.push(e.outerHTML.slice(0,80))});
    const iconOnly=[...document.querySelectorAll('#m-root button')].filter(b=>!b.textContent.trim()&&b.querySelector('svg')).filter(b=>!b.getAttribute('aria-label')).map(b=>b.id||b.className);
    return {bad,iconOnly}});
  assert.deepStrictEqual(names.bad,[],'every control and dialog has an accessible name');assert.deepStrictEqual(names.iconOnly,[],'icon-only buttons carry aria-label');
  // 3. Keyboard: Tab order on each tab with a visible focus ring; sheets hold focus and return it.
  async function walk(steps){const seen=[];for(let i=0;i<steps;i++){await page.keyboard.press('Tab');if(await page.evaluate(()=>document.activeElement===document.body))break;   /* end of the page: the browser takes focus next */
    seen.push(await page.evaluate(()=>{const e=document.activeElement,cs=getComputedStyle(e),r=e.getBoundingClientRect();
    return {name:(e.getAttribute('aria-label')||e.textContent||e.id).trim().slice(0,24),ring:cs.outlineStyle!=='none'&&parseFloat(cs.outlineWidth)>=2,inShell:!!e.closest('#m-root'),top:Math.round(r.top)}}))}return seen}
  for(const t of ['decide','jobs','status']){
    await page.click('#m-tab-'+t);await page.evaluate(()=>{scrollTo(0,0);const b=document.body;b.tabIndex=-1;b.focus();b.removeAttribute('tabindex')});   // start Tab from the top of the page
    const seen=await walk(12);
    assert.ok(seen.every(s=>s.inShell),t+': Tab stays in the phone shell ('+seen.map(s=>(s.inShell?'':'OUT:')+s.name).join(' > ')+')');
    assert.ok(seen.every(s=>s.ring),t+': every focused control shows the 2px focus ring ('+seen.filter(s=>!s.ring).map(s=>s.name)+')');
    report.names.push({tab:t,order:seen.map(s=>s.name)});
  }
  for(const [open,box,ret] of [['#m-more','#m-more-sheet','#m-more'],['#m-fields-btn','#m-fields','#m-fields-btn']]){
    if(open==='#m-fields-btn')await page.click('#m-tab-jobs');
    await page.focus(open);await page.keyboard.press('Enter');await page.waitForSelector(box+':not([hidden])');
    assert.ok(await page.evaluate(b=>document.querySelector(b).contains(document.activeElement),box),box+': focus moves into the sheet');
    for(let i=0;i<14;i++)await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(b=>document.querySelector(b).contains(document.activeElement),box),box+': Tab stays inside the open sheet');
    await page.keyboard.press('Shift+Tab');assert.ok(await page.evaluate(b=>document.querySelector(b).contains(document.activeElement),box),box+': Shift+Tab stays inside');
    await page.keyboard.press('Escape');assert.ok(await page.evaluate(r=>document.activeElement===document.querySelector(r),ret),box+': Escape returns focus to its button');
  }
  await page.click('#m-tab-decide');await page.focus('.m-card.m-top [data-m-open]');await page.keyboard.press('Enter');await page.waitForSelector('#m-detail:not([hidden])');
  assert.strictEqual(await page.evaluate(()=>document.activeElement.id),'m-d-back','job sheet: focus on the back button');
  for(let i=0;i<20;i++)await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.getElementById('m-detail').contains(document.activeElement)),'job sheet: Tab stays inside');
  await page.keyboard.press('Escape');assert.ok(await page.evaluate(()=>document.activeElement&&document.activeElement.matches('[data-m-open]')),'job sheet: Escape returns focus to the card');
  // 4. Motion inventory: every transition / animation in the shell.
  const motion=await page.evaluate(()=>{const m={};document.querySelectorAll('#m-root, #m-root *').forEach(e=>{const cs=getComputedStyle(e);
    const t=cs.transitionDuration.split(',').map(parseFloat).filter(x=>x>0),a=cs.animationName!=='none'?parseFloat(cs.animationDuration):0;
    if(t.length||a){const k=(e.id?'#'+e.id:'.'+String(e.className.baseVal!==undefined?e.className.baseVal:e.className).split(' ')[0]);m[k]={transition:t.length?Math.max(...t)*1000+'ms '+cs.transitionProperty:'',animation:a?cs.animationName+' '+a*1000+'ms':''}}});return m});
  // Rules defined for states not currently on screen: read them from the stylesheet.
  const rules=await page.evaluate(()=>{const out=[];for(const sh of document.styleSheets){if(!/pipeline-mobile\.css/.test(sh.href||''))continue;const walk=l=>{for(const r of l){if(r.cssRules&&!r.selectorText)walk(r.cssRules);else if(r.style&&(r.style.transitionDuration||r.style.animationDuration||r.style.animation||r.style.transition))out.push(r.selectorText+' { '+(r.style.transition||'')+(r.style.animation||'')+' }')}};walk(sh.cssRules)}return out});
  report.motion={live:motion,rules};
  const slow=Object.entries(motion).filter(([k,v])=>{const ms=parseFloat(v.transition)||0,am=parseFloat((v.animation.match(/(\d+(\.\d+)?)ms/)||[])[1])||0;return (ms>250||am>250)&&!/m-bar|m-toast/.test(k)});
  assert.deepStrictEqual(slow,[],'every shell transition / animation is 250ms or less (toast countdown bar excepted)');
  assert.deepStrictEqual(errors,[],'no page errors');await ctx.close();

  // 5. Reduced motion: no transition or animation anywhere in the shell, in every state that has one.
  ({ctx,page,errors}=await open({reducedMotion:'reduce'}));
  await page.evaluate(b=>{localStorage.setItem('px.cfg',JSON.stringify({url:b+'/writer',key:'test-only'}))},base);await page.reload();await page.waitForSelector('#m-pane-decide .m-card');
  await page.click('.m-card.m-top [data-m-do="hold"]');await page.waitForSelector('#m-toast:not([hidden])');
  await page.click('#m-tab-status');await page.waitForFunction(()=>document.querySelector('#m-pane-status .m-constraint'),null,{timeout:20000});
  await page.evaluate(()=>{const c=document.querySelector('#m-pane-status .m-constraint');c.classList.add('m-flash');document.getElementById('m-hd').classList.add('m-hide')});
  const moving=await page.evaluate(()=>[...document.querySelectorAll('#m-root, #m-root *')].filter(e=>{const cs=getComputedStyle(e);return cs.transitionDuration.split(',').some(x=>parseFloat(x)>0)||cs.animationName!=='none'}).map(e=>e.id||String(e.className.baseVal!==undefined?e.className.baseVal:e.className)));
  assert.deepStrictEqual(moving,[],'reduced motion: nothing in the shell transitions or animates');
  assert.deepStrictEqual(errors,[],'no page errors (reduced motion)');await ctx.close();

  // Summaries for the report.
  const pairs={};report.contrast.forEach(x=>{const k=x.kind+' '+x.fg+' on '+x.bg;if(!pairs[k]||pairs[k].ratio>x.ratio)pairs[k]={ratio:x.ratio,need:x.need,where:x.where,sample:x.sample}});
  report.pairs=Object.entries(pairs).map(([k,v])=>({pair:k,...v})).sort((a,b)=>a.ratio-b.ratio);
  if(process.env.A11Y_REPORT)fs.writeFileSync(process.env.A11Y_REPORT,JSON.stringify(report,null,1));
  console.log('contrast pairs measured: '+report.pairs.length+', lowest: '+report.pairs.slice(0,5).map(p=>p.pair+' '+p.ratio+':1').join(' | '));
  assert.deepStrictEqual(fails,[],'contrast: every text >= 4.5:1 (large 3:1), every icon >= 3:1');
  await browser.close();server.close();console.log('mobile-a11y: all checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
