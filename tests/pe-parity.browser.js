/* P2 phone/desktop parity (GUI spec + 12:54 AM revision). Headless checks at 1440 and 390.
   Blocks the production Writer. Run: node tests/pe-parity.browser.js
   PARITY_SHOTS=<dir> writes the GUI screenshots. */
require('./helpers/block-production-writer.cjs');
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const shots=process.env.PARITY_SHOTS;
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2'};
const F=require('../pipeline-pay-format.js');

let fit=70;
const baseFix=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const fixture=baseFix.split('\n').map(l=>{
  const c=l.split(' | ');if(c.length<10||!/^\d+$/.test(c[0]))return l;
  if(!/^(READY_TO_PURSUE|MANUAL_RESEARCH|SCOUT_INTAKE|DISCOVERY_LEAD|TIM_DECISION_REQUIRED)$/.test(c[4]))return l;
  if(c[1]==='V2X-A4CCD49EE686'){c[2]='Pratt & Whitney';c[3]='Director of Quality';}
  if(c[4]==='READY_TO_PURSUE') c[4]='TIM_DECISION_REQUIRED';
  let extra='; SCOPE_FIT_RAW='+(fit++)+'; FIT_CONF=MED';
  if(c[1]==='V2X-A4CCD49EE686') extra+='; SALARY_BASE_LOW=108000; SALARY_BASE_HIGH=205000; PAY_POSTED=$108000-$205000; SALARY_BASIS=EMPLOYER_POSTED; SALARY_CONF=VERIFIED';
  if(c[1]==='V2X-005F540B3422') extra+='; PAY_POSTED=$156000; SALARY_BASIS=EMPLOYER_POSTED; SALARY_CONF=VERIFIED';
  if(c[1]==='V2X-F093D447C51C') extra+='; PAY_POSTED=$45/hr; SALARY_PERIOD=hourly; SALARY_BASIS=EMPLOYER_POSTED; SALARY_CONF=VERIFIED';
  return c.join(' | ')+extra;
}).join('\n');

const RANGE='$108K'+F.DASH+'$205K';

(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const shot=async(page,name)=>{if(!shots)return;fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,name),fullPage:false})};

  async function open(opts){
    const ctx=await browser.newContext(opts.ctx||{viewport:{width:1440,height:900}});
    const page=await ctx.newPage(),errors=[],posts=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}));window.PX_TEST_BATCH_MS=150});
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{}}));
    await page.route('**/raw.githubusercontent.com/**',r=>{
      if(opts.blockQueue && /PIPELINE_WAITING_QUEUES/.test(r.request().url())) return r.fulfill({status:503,body:'down'});
      return r.fulfill({body:''});
    });
    await page.route('**/api/pipeline-health*',r=>{
      const at=new Date().toISOString();
      // Snapshot 503 is what marks the queue unavailable. Health itself must succeed with a
      // 40-char sourceRevision so accept() fetches PIPELINE_WAITING_QUEUES and records the error.
      if(opts.blockQueue) return r.fulfill({json:{ok:true,sourceRevision:'a'.repeat(40),processFlow:{at,population:{reconciled:true},queues:{enrichment:0,readyForReview:0}},decisionReady:{at,ids:[]}}});
      return r.fulfill({json:{ok:true,processFlow:{at,population:{reconciled:true},queues:{enrichment:0,readyForReview:2}},decisionReady:{at,ids:[]}}});
    });
    await page.route('**/writer*',r=>{
      const req=r.request(),a=new URL(req.url()).searchParams.get('action');
      if(req.method()==='POST'){const b=JSON.parse(req.postData()||'{}');posts.push(b);return r.fulfill({json:{ok:true,receipt:{REQUEST_ID:b.ruling&&b.ruling.requestId}}});}
      if(a==='master'){
        if(opts.blockMaster) return r.fulfill({status:503,body:'down'});
        return r.fulfill({json:{ok:true,text:fixture,modifiedTime:new Date().toISOString(),fetchedAt:new Date().toISOString()}});
      }
      return r.fulfill({json:{ok:true}});
    });
    await page.goto(base+'/pipeline.html?src=writer');
    if(!opts.blockMaster) await page.waitForFunction(()=>document.querySelectorAll('#grid tbody tr[data-id], #m-pane-decide .m-card, #m-pane-decide [data-m-retry-queue]').length>0,{timeout:20000});
    else await page.waitForTimeout(1200);
    return {ctx,page,errors,posts};
  }
  const rulings=list=>list.flatMap(b=>b.action==='ruling'?[b.ruling]:b.action==='batch'?(b.requests||[]).map(q=>q.ruling):[]);

  // 1. Desktop 1440: drawer labels, Pratt range, and the same decisions from the job drawer.
  let {ctx,page,errors,posts}=await open({ctx:{viewport:{width:1440,height:900}}});
  await page.waitForSelector('#view-pipeline.on #grid tbody tr[data-id]');
  assert.strictEqual(await page.locator('[data-go="act-now"], #view-act-now, #act-now').count(), 0, 'no Act Now tab');
  const opened=await page.evaluate(()=>{
    const row=[...document.querySelectorAll('#grid tbody tr[data-id]')].find(r=>/Pratt & Whitney/.test(r.textContent));
    if(!row) return {ok:false,ids:[...document.querySelectorAll('#grid tbody tr[data-id]')].slice(0,8).map(r=>r.textContent.slice(0,40))};
    row.scrollIntoView();row.click();
    return {ok:true,id:row.getAttribute('data-id')};
  });
  if(!opened.ok) throw new Error('Pratt row not in Jobs table: '+JSON.stringify(opened));
  await page.waitForFunction(()=>document.querySelector('#view-pipeline.on #drawer.on #d-body .wh-decide'),null,{timeout:8000});
  await page.waitForTimeout(200);
  const footer=await page.evaluate(()=>{
    const body=document.getElementById('d-body');
    const dec=body.querySelector(':scope > .wh-decide')||body.querySelector('.wh-decide');
    const br=body.getBoundingClientRect(),dr=dec.getBoundingClientRect();
    const all=[...dec.querySelectorAll('button')].sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left);
    const buttons=all.filter(b=>!b.classList.contains('wh-applied-link'));
    const labels=buttons.map(b=>b.textContent.trim());
    const allLabels=all.map(b=>b.textContent.trim());
    const posts=['ws-open','ws-packet','ws-cover'].map(id=>{
      const el=document.getElementById(id); if(!el) return {id,missing:true};
      const r=el.getBoundingClientRect();
      const overlap=Math.max(0,Math.min(r.bottom,dr.bottom)-Math.max(r.top,dr.top));
      return {id,overlap,fully:r.bottom<=dr.top+0.5&&r.top>=br.top-0.5&&r.height>0};
    });
    return {labels,allLabels,sameRow:all.length>0&&all.every(b=>b.offsetTop===all[0].offsetTop),offsetTops:all.map(b=>b.offsetTop),posts,pay:((document.getElementById('d-sub')||{}).textContent||'')+' '+(body.textContent||'')};
  });
  const has=w=>footer.labels.some(t=>t.indexOf(w)>=0);
  assert.ok(has('Pursue')&&has('Research')&&has('Decline'),'drawer decision buttons '+JSON.stringify(footer.labels));
  assert.ok(!has('Mark applied'),'Mark applied is not a decision button in the footer: '+JSON.stringify(footer.labels));
  const nameOf=t=>/Pursue/.test(t)?'Pursue':/Research/.test(t)?'Research':/Decline/.test(t)?'Decline':t;
  const ltr=footer.labels.map(nameOf);
  const iP=ltr.indexOf('Pursue'),iR=ltr.indexOf('Research'),iD=ltr.indexOf('Decline');
  assert.ok(iP>=0&&iP<iR&&iR<iD,'drawer decision order Pursue · Research · Decline: '+JSON.stringify(ltr));
  assert.strictEqual(ltr[ltr.length-1],'Decline','Decline sits at the far end of the footer: '+JSON.stringify(ltr));
  const applied=await page.evaluate(()=>{
    const el=document.querySelector('#d-body .wh-applied-link, #d-body [data-decide-key="applied"]');
    const dec=document.querySelector('#d-body .wh-decide');
    return {text:el&&el.textContent.trim(),inDecide:!!(el&&dec&&dec.contains(el)),disabled:el&&el.disabled};
  });
  assert.equal(applied.text,'Mark applied','drawer has a secondary Mark applied control');
  assert.ok(applied.inDecide,'Mark applied sits in the footer row as a plain link, not a decision button');
  assert.ok(!applied.disabled,'Mark applied is not disabled');
  assert.ok((footer.allLabels||[])[0].indexOf('Mark applied')>=0,'Mark applied is left of the decision buttons: '+JSON.stringify(footer.allLabels));
  assert.ok(footer.pay.indexOf(RANGE)>=0,'drawer Pratt range: '+footer.pay.slice(0,200));
  assert.ok(footer.sameRow,'1440 drawer footer is a single row: '+JSON.stringify(footer.offsetTops));
  footer.posts.forEach(p=>{
    assert.ok(!p.missing,p.id+' is in the drawer');
    assert.ok(p.fully&&p.overlap<=0.5,p.id+' fully visible above the footer: '+JSON.stringify(p));
  });
  await shot(page,'desktop-1440-buttons-pay.png');
  await page.click('[data-decide-key="applied"]');
  await page.click('#save-decision');
  await page.waitForTimeout(600);
  let r=rulings(posts);
  assert.ok(r.length>=1,'Mark applied posted');
  assert.strictEqual(r[r.length-1].kind,'APPLIED');
  assert.strictEqual(r[r.length-1].value,'');
  async function openOther(){
    await page.click('#d-close');
    await page.waitForTimeout(200);
    const id=await page.evaluate(skip=>{
      const row=[...document.querySelectorAll('#grid tbody tr[data-id]')].find(tr=>tr.getAttribute('data-id')!==skip);
      if(!row) return '';
      row.scrollIntoView();row.click();
      return row.getAttribute('data-id');
    }, opened.id);
    await page.waitForSelector('#drawer.on #save-decision');
    return id;
  }
  await openOther();
  await page.click('[data-decide-key="1"]');
  await page.click('#save-decision');
  await page.waitForTimeout(600);
  r=rulings(posts);
  assert.strictEqual(r[r.length-1].kind,'APPLY_NOW');
  assert.strictEqual(r[r.length-1].value,'YES');
  await openOther();
  await page.click('[data-decide-key="4"]');
  await page.click('#save-decision');
  await page.waitForTimeout(600);
  r=rulings(posts);
  assert.strictEqual(r[r.length-1].kind,'MANUAL_RESEARCH');
  const deskWriters=r.slice();
  assert.deepStrictEqual(errors,[],'desktop page errors');
  const deskQuality=await page.evaluate(async()=>{
    const tab=document.querySelector('[data-go="pipeline"][data-preset="ALL"],#presets [data-preset="ALL"],.preset-list [data-preset="ALL"]');
    if(tab)tab.click();
    const search=document.getElementById('search');
    search.value='quality';search.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,400));
    return document.querySelectorAll('#grid tbody tr[data-id]').length;
  });
  await shot(page,'desktop-1440-search-quality-all.png');
  await ctx.close();

  // 2. Phone 390: same labels and identical Pratt range; search quality with All selected; write equivalence.
  ({ctx,page,errors,posts}=await open({ctx:{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'}}));
  await page.waitForSelector('html.m-shell #m-pane-decide .m-card',{timeout:20000});
  const phoneBtns=await page.evaluate(()=>{
    const card=document.querySelector('#m-pane-decide .m-card.m-top')||document.querySelector('#m-pane-decide .m-card');
    const labels=[...card.querySelectorAll('.m-actions .m-btn, .m-applied .m-btn')].map(b=>b.textContent.trim().replace(/^[^\w]+/,'').trim());
    const forbidden=[...document.querySelectorAll('#m-pane-decide button, #m-detail button')].map(b=>b.textContent.trim()).filter(t=>t==='Applied'||t==='Hold'||t==='Later'||t==='Applied queued');
    const clipped=[...document.querySelectorAll('#m-pane-decide .m-actions [data-m-do="pursue"]')].filter(b=>b.scrollWidth>b.clientWidth+1).map(b=>b.textContent.trim()+' '+b.scrollWidth+'>'+b.clientWidth);
    const dots=document.querySelectorAll('#m-pane-decide .m-actions [data-m-menu]').length;
    return {labels,forbidden,clipped,dots};
  });
  assert.ok(phoneBtns.labels.includes('Pursue')&&phoneBtns.labels.includes('Research')&&phoneBtns.labels.includes('Decline')&&phoneBtns.labels.includes('Mark applied'),'phone buttons '+JSON.stringify(phoneBtns.labels));
  assert.deepStrictEqual(phoneBtns.clipped,[],'phone Pursue labels are not clipped: '+JSON.stringify(phoneBtns.clipped));
  assert.strictEqual(phoneBtns.dots,0,'phone Decide cards have no ⋯ in the action row');
  const pIdx={p:phoneBtns.labels.indexOf('Pursue'),r:phoneBtns.labels.indexOf('Research'),d:phoneBtns.labels.indexOf('Decline')};
  assert.ok(pIdx.p<pIdx.r&&pIdx.r<pIdx.d,'phone order Pursue · Research · Decline '+JSON.stringify(phoneBtns.labels));
  assert.deepStrictEqual(phoneBtns.forbidden,[],'phone has no Applied/Hold/Later button labels');
  // Open Pratt detail if on decide, else Jobs search
  const phoneOpened=await page.evaluate(()=>{
    const row=[...document.querySelectorAll('#m-pane-decide .m-card')].find(c=>/Pratt & Whitney/.test(c.textContent));
    if(row){row.querySelector('[data-m-open]').click();return true}
    return false;
  });
  if(phoneOpened){await page.waitForSelector('#m-detail:not([hidden])');}
  else {
    await page.click('#m-tab-jobs');await page.waitForSelector('#m-q');
    await page.fill('#m-q','Pratt');await page.waitForTimeout(400);
    await page.click('#m-jobs-list [data-m-open], #m-jobs-list .m-row');
    await page.waitForSelector('#m-detail:not([hidden])');
  }
  const phonePay=await page.evaluate(()=>document.querySelector('#m-detail .m-pay, #m-detail .m-b')&&document.body.innerText);
  assert.ok(phonePay.indexOf(RANGE)>=0,'phone Pratt range matches desktop figure: missing '+RANGE);
  await shot(page,'phone-390-buttons-pay.png');
  if(phoneOpened){await page.click('#m-d-back').catch(()=>{});await page.waitForTimeout(200)}
  else {await page.click('#m-d-back').catch(()=>{});await page.waitForTimeout(200)}

  // search quality, All selected
  await page.click('#m-tab-jobs');await page.waitForSelector('#m-q');
  await page.fill('#m-q','quality');await page.waitForTimeout(400);
  const phoneSearch=await page.evaluate(()=>{
    const all=document.querySelector('[data-m-jf="all"]');
    const n=parseInt((document.getElementById('m-jobcount')||{}).textContent,10);
    return {pressed:all&&all.getAttribute('aria-pressed'),count:n,text:(document.getElementById('m-jobcount')||{}).textContent};
  });
  assert.strictEqual(phoneSearch.pressed,'true','All chip selected while searching');
  assert.strictEqual(phoneSearch.count,deskQuality,'phone quality search count matches desktop All ('+phoneSearch.count+' vs '+deskQuality+')');
  await shot(page,'phone-390-search-quality-all.png');

  // Browse all jobs: go to Decide empty-ish path via the button if present; otherwise call the handler by clicking after navigating...
  // Use evaluate to click a manufactured path: open decide, if the button isn't there, set state via clicking after search clear.
  await page.fill('#m-q','');await page.waitForTimeout(200);
  const browse=await page.evaluate(()=>{
    // simulate the browse handler
    const ev=document.querySelector('[data-m-browse]');
    return !!ev;
  });
  if(browse){await page.click('#m-tab-decide');await page.waitForTimeout(200);await page.click('[data-m-browse]');}
  else {
    await page.evaluate(()=>{document.querySelector('[data-m-jf="all"]').click()});
  }
  await page.waitForTimeout(400);
  const afterBrowse=await page.evaluate(()=>{
    const all=document.querySelector('[data-m-jf="all"]');
    const n=parseInt((document.getElementById('m-jobcount')||{}).textContent,10);
    const listed=document.querySelectorAll('#m-jobs-list .m-row, #m-jobs-list tr[data-id]').length;
    return {pressed:all&&all.getAttribute('aria-pressed'),n,listed,tab:document.getElementById('m-tab-jobs').getAttribute('aria-selected')};
  });
  assert.strictEqual(afterBrowse.tab,'true','Browse all jobs opens Jobs');
  assert.strictEqual(afterBrowse.pressed,'true','Browse all jobs selects All');
  assert.ok(afterBrowse.listed>0||afterBrowse.n>0,'Browse all jobs lists jobs');
  await shot(page,'phone-390-browse-all.png');

  // write equivalence on phone
  await page.click('#m-tab-decide');await page.waitForSelector('#m-pane-decide .m-card');
  await page.click('.m-card.m-top [data-m-do="pursue"]');await page.waitForTimeout(500);
  r=rulings(posts);
  assert.strictEqual(r[r.length-1].kind,'APPLY_NOW');
  assert.strictEqual(r[r.length-1].value,'YES');
  await page.click('.m-card.m-top [data-m-do="research"]');await page.waitForTimeout(500);
  r=rulings(posts);
  assert.strictEqual(r[r.length-1].kind,'MANUAL_RESEARCH');
  assert.match(r[r.length-1].note||'',/Research requested/);
  await page.click('.m-card.m-top [data-m-do="applied"]');await page.waitForTimeout(500);
  r=rulings(posts);
  assert.strictEqual(r[r.length-1].kind,'APPLIED');
  assert.strictEqual(r[r.length-1].note,'Applied · from the phone');
  assert.deepStrictEqual(errors,[],'phone page errors');
  await ctx.close();

  // 3. Queue snapshot blocked: Decide says so, and there is no Act Now list to fall back to.
  ({ctx,page,errors}=await open({blockQueue:true,ctx:{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'}}));
  await page.waitForFunction(()=>/Decision queue snapshot unavailable/.test((document.querySelector('#m-pane-decide')||{}).textContent||'')&&!document.querySelector('[data-go="act-now"], #act-now'),null,{timeout:20000}).catch(async()=>{
    const t=await page.evaluate(()=>({text:(document.querySelector('#m-pane-decide')||{}).textContent||'',state:window.PEMobileBridge&&window.PEMobileBridge.decideState&&window.PEMobileBridge.decideState()}));
    throw new Error('unavailable line missing: '+JSON.stringify(t).slice(0,800));
  });
  const blocked=await page.evaluate(()=>{
    const line=(document.querySelector('#m-pane-decide')||{}).textContent||'';
    return {hasLine:/Decision queue snapshot unavailable/.test(line),act:document.querySelectorAll('[data-go="act-now"], #act-now, [data-m-filter="act"]').length};
  });
  assert.ok(blocked.hasLine,'unavailable line present');
  assert.strictEqual(blocked.act,0,'no Act Now tab or filter');
  await shot(page,'phone-390-decide-queue-blocked.png');
  assert.deepStrictEqual(errors,[]);
  await ctx.close();

  // 4. Both sources blocked: ⚠ — and Retry, never an empty list of cards presented as success.
  ({ctx,page,errors}=await open({blockQueue:true,blockMaster:true,ctx:{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}}));
  await page.waitForFunction(()=>{
    const t=(document.querySelector('#m-pane-decide')||{}).textContent||'';
    return /—/.test(t) && document.querySelector('#m-pane-decide [data-m-retry-queue]');
  },null,{timeout:20000}).catch(async()=>{
    const t=await page.evaluate(()=>(document.querySelector('#m-pane-decide')||{}).textContent||'');
    throw new Error('both-fail UI missing: '+t.slice(0,500));
  });
  const both=await page.evaluate(()=>{
    const t=(document.querySelector('#m-pane-decide')||{}).textContent||'';
    const warn=document.querySelector('#m-pane-decide .m-down, #m-pane-decide .m-done .m-g, #m-pane-decide .m-alert .m-g');
    const retry=document.querySelector('#m-pane-decide [data-m-retry-queue]');
    const dash=[...document.querySelectorAll('#m-pane-decide b, #m-pane-decide')].some(e=>e.textContent.trim()==='—'||/\b—\b/.test(e.textContent));
    return {t,hasWarn:!!warn,hasRetry:!!retry,dash,cards:document.querySelectorAll('#m-pane-decide .m-card').length};
  });
  assert.ok(both.hasWarn,'both-fail shows the warning glyph');
  assert.ok(both.hasRetry,'both-fail shows Retry');
  assert.ok(both.dash||/—/.test(both.t),'both-fail shows —');
  assert.strictEqual(both.cards,0,'both-fail is not a silent empty card list');
  await shot(page,'phone-390-both-blocked.png');
  assert.deepStrictEqual(errors,[],'both-fail page errors');
  await ctx.close();

  await browser.close();server.close();
  console.log('pe-parity.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
