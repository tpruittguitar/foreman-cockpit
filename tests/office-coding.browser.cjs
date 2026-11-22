// Scoped panel harness using the actual chat controls, client and canvas renderer.
// All HTTP is loopback; provider responses are mocks. No real agent invocation.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const src=fs.readFileSync(path.join(root,'office/office.js'),'utf8');
 const controls=src.slice(src.indexOf('const AGENT_URL ='),src.indexOf('function openBot(name)'));
 const harness=`import {codingText,createCodingClient} from '/office/coding-client.mjs'; import {drawAgentChat} from '/office/draw.js';
 const L=window.OfficeLogic,DEMO=false;
 ${controls}
 window.panel={select:p=>{AC.to=p;}, unlock:()=>{AC.token='mock-chat';AC.exp=Date.now()+60000;acSyncInput();},send:agentSend,refresh:codingRefresh,lock:agentLock,messages:()=>[...codingJobs.values()].map(codingMessage),state:()=>({note:AC.note,jobs:[...codingJobs.values()],draft:AC.draft}),draw:()=>drawAgentChat(document.querySelector('canvas').getContext('2d'),1024,683,{to:AC.to,msgs:[...codingJobs.values()].filter(j=>j.provider===AC.to).map(codingMessage)})};`;
 const calls=[];let connected=false,complete=false;
 const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/agent-coding'){
   let text='';for await(const c of req)text+=c;const b=text?JSON.parse(text):Object.fromEntries(u.searchParams);calls.push({method:req.method,...b});
   res.setHeader('Content-Type','application/json');
   if(!connected){res.statusCode=401;return res.end(JSON.stringify({status:'not_connected'}));}
   if(!text&&!u.search)return res.end(JSON.stringify({providers:['Dot','Claude'].map(provider=>({provider,connected:true,conversationId:provider.padEnd(16,'0')}))}));
   return res.end(JSON.stringify({...b,status:text?'queued':complete?'completed':'running',approach:{route:'draft_pr',summary:'Inspect the requested change, then prepare a draft for review.'},...(complete?{draftUrl:'https://github.com/example/project/pull/12'}:{})}));
  }
  if(u.pathname==='/harness.js'){res.setHeader('Content-Type','application/javascript');return res.end(harness);}
  if(u.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<canvas width="1024" height="683"></canvas><script src="/office/office-logic.js"></script><script type="module" src="/harness.js"></script>');}
  const file=path.join(root,u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'application/javascript':'text/plain');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.PIPELINE_CHROMIUM || '/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:'+server.address().port;
  await page.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
  await page.goto(base);await page.waitForFunction(()=>window.panel);
  await page.evaluate(()=>{panel.unlock();panel.select('Dot');});
  await page.fill('#ac-input','/code scratch example');await page.press('#ac-input','Enter');await page.waitForFunction(()=>panel.state().note.includes('Not connected'));
  await page.press('#ac-input','Enter');await page.waitForFunction(()=>panel.state().note.includes('Not connected'));
  assert.equal(calls.filter(c=>c.method==='POST').length,0);
  connected=true;await page.press('#ac-input','Enter');await page.waitForFunction(()=>panel.state().jobs.length===1);
  await page.evaluate(()=>panel.refresh());assert.equal((await page.evaluate(()=>panel.state())).jobs[0].status,'running');assert.match((await page.evaluate(()=>panel.messages()))[0].text,/Approach: Inspect the requested change/);
  complete=true;await page.evaluate(()=>panel.refresh());const hits=await page.evaluate(()=>panel.draw());assert.equal(hits.find(h=>h.act==='draft').url,'https://github.com/example/project/pull/12');
  await page.evaluate(()=>panel.select('Claude'));assert.equal((await page.evaluate(()=>panel.draw())).some(h=>h.act==='draft'),false);
  await page.evaluate(()=>panel.select('ALL'));await page.fill('#ac-input','/code do not broadcast');await page.press('#ac-input','Enter');assert.equal(calls.filter(c=>c.method==='POST').length,1);
  await page.evaluate(()=>panel.lock());assert.equal((await page.evaluate(()=>panel.state())).jobs.length,0);
  assert.deepEqual(errors,[]);console.log('PASS scoped browser smoke: repeated disconnected sends, native input, mocked progress/draft hit, provider isolation, All and lock');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
