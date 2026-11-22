// Full real Office page -> local owner cookie -> actual service/store/adapter ->
// version-matched stdio fixture -> native status/draft link. No provider/network calls.
const {fixture}=require('./office-dot-local.test.js');
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const f=await fixture();let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.PIPELINE_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/agent-coding')&&r.method()==='POST')requests.push(JSON.parse(r.postData()));});
  await page.route('**/*',async r=>{
   const u=r.request().url();if(u.startsWith(f.origin+'/'))return r.continue();
   if(u.includes('OFFICE_STATUS.json'))return r.fulfill({contentType:'application/json',body:fs.readFileSync(path.join(__dirname,'fixtures/office-status-v3.example.json'),'utf8')});
   return r.fulfill({status:503,body:'External network disabled in test'});
  });
  await page.goto(f.launchUrl);await page.waitForFunction(()=>window.__office?.ready,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>__office.webgl),true);
  await page.evaluate(()=>{const z=__office.layout().RD/2;__office.view([-4,2.1,z-3.15],[-4,2.25,z-.05]);});
  await page.waitForTimeout(600);
  const dotHandle=await page.waitForFunction(()=>{for(let y=80;y<650;y+=12)for(let x=100;x<1300;x+=12){const p=__office.pickAt(x,y);if(p?.board==='agentchat'&&p.ac?.to==='Dot')return [x,y];}return null;},null,{timeout:15000});
  const dot=await dotHandle.jsonValue();
  assert.ok(dot,'Dot recipient chip located on the actual 3D wall');await page.mouse.click(...dot);
  const send=async text=>{await page.evaluate(t=>{const e=document.querySelector('#ac-input');e.value=t;e.dispatchEvent(new Event('input'));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));},text);};
  await send('/code first edit');await page.waitForFunction(()=>document.querySelector('#ac-input').value==='');await f.adapter.queue;
  await send('/code second edit');await page.waitForFunction(()=>document.querySelector('#ac-input').value==='');await f.adapter.queue;
  assert.equal(fs.readFileSync(path.join(f.workspace,'proof.txt'),'utf8'),'turn-1\nturn-2\n');
  await send('/code /pr');await page.waitForFunction(()=>document.querySelector('#ac-input').value==='');await f.adapter.queue;
  // The page's normal 15-second status poll updates the wall, without test-only UI hooks.
  const draft=await page.waitForFunction(()=>{for(let y=160;y<820;y+=15)for(let x=150;x<1250;x+=15){const p=__office.pickAt(x,y);if(p?.board==='agentchat'&&p.ac?.act==='draft')return p.ac.url;}return null;},null,{timeout:25000});
  assert.equal(await draft.jsonValue(),'https://github.com/example/project/pull/123');assert.equal(requests.length,3);assert.ok(requests.every(r=>r.provider==='Dot'));
  assert.deepEqual(errors,[]);console.log('PASS full Office page, owner cookie, two native fixture turns, durable adapter, status polling and draft link');
 }finally{if(browser)await browser.close();await f.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
