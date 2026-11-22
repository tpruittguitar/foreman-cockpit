// Actual 3D UI -> real service -> private SQLite -> native adapter with mock RPC.
// All network stays on this ephemeral loopback fixture. No owner data or agent calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE||'playwright');
const setup=process.env.OFFICE_RELAY_BROWSER==='1'?require('./fixtures/office-relay-service.cjs').browserFixture:require('./fixtures/office-image-service.cjs').setup;
(async()=>{
 const root=path.resolve(__dirname,'..');let fixture,base;const chatPosts=[];
 const server=http.createServer(async(req,res)=>{
  try{const url=new URL(req.url,base);
  if(url.pathname==='/api/agent-coding'){
   const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
   const result=await fixture.service(new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body}: {})}));
   res.writeHead(result.status,Object.fromEntries(result.headers));return res.end(await result.text());
  }
  if(url.pathname==='/api/agent-chat'){let raw='';for await(const c of req)raw+=c;if(raw)chatPosts.push(JSON.parse(raw));res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,lines:[],queued:0}));}
  if(url.pathname.startsWith('/api/')){res.statusCode=404;return res.end('{}');}
  const file=path.join(root,url.pathname==='/'?'office.html':url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'application/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));
  }catch{res.statusCode=500;res.end('fixture failed');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;fixture=await setup({origin:base});
 const browser=await chromium.launch({executablePath:process.env.PIPELINE_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const dummy=await browser.newPage({viewport:{width:480,height:240}});
  await dummy.setContent('<body style="font:24px sans-serif;background:white"><h2>Dummy UI screenshot</h2><button style="padding:16px;border:5px solid red;border-radius:50%">Triangle 731</button><p>Red markup: inspect this button</p></body>');
  const png=await dummy.screenshot({path:'/tmp/office-dummy-marked.png'});await dummy.close();
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
  await page.addInitScript(()=>{localStorage.setItem('office.agentChatToken',JSON.stringify({token:'fixture-only',exp:Date.now()+600000}));window.fixtureText=[];const orig=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t){fixtureText.push(String(t));return orig.apply(this,arguments)};});
  await page.goto(base+'/office.html?view=3d');await page.waitForFunction(()=>window.__office?.ready,null,{timeout:60000});
  await page.evaluate(()=>{const z=__office.layout().RD/2;__office.view([-4,2.1,z-3.15],[-4,2.25,z-.05]);});
  const click=async(act,to)=>{const handle=await page.waitForFunction(({act,to})=>{for(let y=80;y<820;y+=8)for(let x=120;x<1300;x+=8){const p=__office.pickAt(x,y);if(p?.board==='agentchat'&&p.ac?.act===act&&(!to||p.ac.to===to))return [x,y];}return null;},{act,to});await page.mouse.click(...await handle.jsonValue());};
  await click('to','Dot');await page.waitForTimeout(900);await click('input');
  await page.setInputFiles('#ac-file',{name:'marked.png',mimeType:'image/png',buffer:png});
  await page.fill('#ac-input','/code Explain the highlighted button in this dummy screenshot.');await click('send');
  await page.waitForFunction(()=>document.querySelector('#ac-input').value==='');await fixture.workerRun;await fixture.adapter.queue;
  assert.equal(fixture.rpc.inputs.length,1);const input=fixture.rpc.inputs[0];assert.equal(input[0].text,'Explain the highlighted button in this dummy screenshot.');assert.equal(input[1].type,'image');assert.deepEqual(Buffer.from(input[1].url.split(',')[1],'base64'),png);assert.equal(chatPosts.length,0);
  await page.waitForFunction(()=>fixtureText.some(t=>t.includes('Inspected the synthetic screenshot.')),null,{timeout:20000});
  // Expired owner scope must preserve both prompt and image, without chat fallback.
  fixture.expire();await page.setInputFiles('#ac-file',{name:'marked.png',mimeType:'image/png',buffer:png});await page.fill('#ac-input','/code Keep this unsubmitted draft.');await click('send');
  await page.waitForFunction(()=>fixtureText.some(t=>t.includes('Owner sign-in required')||t.includes('Sign in to coding')));
  assert.equal(await page.inputValue('#ac-input'),'/code Keep this unsubmitted draft.');assert.ok(await page.evaluate(()=>fixtureText.some(t=>t.includes('marked.png'))));assert.equal(fixture.rpc.inputs.length,1);assert.equal(chatPosts.length,0);
  assert.ok(await page.evaluate(()=>{for(let y=80;y<820;y+=8)for(let x=120;x<1300;x+=8)if(__office.pickAt(x,y)?.ac?.act==='rm')return true;return false;}),'pending image remains removable after expired authorization');
  if(process.env.OFFICE_RELAY_BROWSER==='1') {
   const popupEvent=page.context().waitForEvent('page');await click('coding-sign-in');const popup=await popupEvent;await popup.waitForLoadState();assert.match(await popup.textContent('body'),/Fixture Access login/);assert.equal(await popup.evaluate(()=>window.opener),null);
   assert.equal(fixture.rpc.inputs.length,1);assert.equal(await page.inputValue('#ac-input'),'/code Keep this unsubmitted draft.');
   fixture.restore();await popup.reload();assert.match(await popup.textContent('body'),/Coding sign-in verified/);assert.equal(fixture.rpc.inputs.length,1,'login GET never dispatches');await popup.close();
   assert.equal(await page.inputValue('#ac-input'),'/code Keep this unsubmitted draft.');await click('send');await page.waitForFunction(()=>document.querySelector('#ac-input').value==='');await fixture.workerRun;assert.equal(fixture.rpc.inputs.length,2,'only explicit Send after sign-in dispatches');assert.equal(fixture.rpc.inputs[1][1].url,input[1].url,'same screenshot survives the sign-in tab');
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',imageSha256:crypto.createHash('sha256').update(png).digest('hex'),nativeInputTypes:input.map(i=>i.type),turns:fixture.rpc.inputs.length,ordinaryChatPosts:chatPosts.length,expiredDraftPreserved:true}));
 }finally{await browser.close();await fixture.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
