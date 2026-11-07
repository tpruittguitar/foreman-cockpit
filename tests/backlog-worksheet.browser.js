/* Synthetic navigation regression. All external traffic and production Writer calls are blocked. */
require('./helpers/block-production-writer.cjs');
const pw=require(process.env.PIPELINE_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),fixture=fs.readFileSync(root+'/tests/fixtures/master.sample.txt','utf8'),rules=fs.readFileSync(root+'/tests/fixtures/TIM_PIPELINE_RULES_CANONICAL.sample.txt','utf8');
const IPHONE={viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'};
(async()=>{
 const server=http.createServer((req,res)=>{try{const file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error('invalid path');res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end('missing')}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
 try{
  const type=process.env.PIPELINE_BROWSER||'chromium';
  browser=process.env.PIPELINE_BROWSER_CDP?await pw.chromium.connectOverCDP(process.env.PIPELINE_BROWSER_CDP):await pw[type].launch({headless:true,...(type==='chromium'?{executablePath:process.env.PIPELINE_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']}:{})});
  async function context(options){
   const ctx=await browser.newContext(options),calls={local:0,writes:0},errors=[];
   ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
   await ctx.route('**/*',async r=>{
    const u=new URL(r.request().url());if(r.request().method()!=='GET')calls.writes++;
    if(u.origin==='http://127.0.0.1:51415'){calls.local++;return r.fulfill({contentType:'text/html',body:'<title>Synthetic worksheet</title><h1>Synthetic worksheet</h1>'});}
    if(u.origin!==base)return r.abort();
    if(u.pathname==='/writer'){const a=u.searchParams.get('action');return r.fulfill({json:a==='master'?{ok:true,id:'test-master',text:fixture,fetchedAt:new Date().toISOString()}:a==='canonical_rules'?{ok:true,text:rules}:a==='state'?{ok:true,state:{}}:{ok:true}});}
    return r.continue();
   });
   await ctx.addInitScript(origin=>{if(location.origin!==origin)return;localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}));},base);
   return {ctx,calls,errors};
  }
  // Desktop app entry, explicit new tab, repeated entry, Back/Forward and narrow desktop.
  let {ctx,calls,errors}=await context({viewport:{width:1440,height:900},userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'}),page=await ctx.newPage();
  await page.goto(base+'/pipeline.html?open=jobs');await page.waitForSelector('#grid tbody tr[data-id]');
  await page.locator('.backlog-worksheet-link').click();await page.waitForURL('**/backlog-worksheet.html',{waitUntil:'commit'});
  assert(await page.locator('#local-worksheet').isVisible());assert(await page.locator('#mobile-unavailable').isHidden());assert.equal(calls.local,0);
  const popupPromise=ctx.waitForEvent('page');await page.locator('#local-worksheet').click();const popup=await popupPromise;await popup.waitForLoadState();assert.equal(await popup.title(),'Synthetic worksheet');assert.equal(calls.local,1);await popup.close();
  await page.goBack({waitUntil:'commit'});await page.waitForSelector('.backlog-worksheet-link');await page.goForward({waitUntil:'commit'});await page.waitForURL('**/backlog-worksheet.html',{waitUntil:'commit'});
  await page.setViewportSize({width:390,height:844});assert(await page.locator('#local-worksheet').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1440,height:900});await page.locator('.back').click();await page.waitForSelector('.backlog-worksheet-link');await page.locator('.backlog-worksheet-link').click();assert.equal(calls.local,1);assert.equal(calls.writes,0);assert.deepEqual(errors,[]);
  if(process.env.WORKSHEET_LINK_SHOTS){fs.mkdirSync(process.env.WORKSHEET_LINK_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.WORKSHEET_LINK_SHOTS,'launcher-desktop.png'),fullPage:true});}
  await ctx.close();
  // iPhone: More is a real navigation link, Close/Escape still work, and no phone loopback launch is offered.
  ({ctx,calls,errors}=await context(IPHONE));page=await ctx.newPage();await page.goto(base+'/pipeline.html?open=jobs');await page.waitForSelector('#m-more');
  await page.locator('#m-more').click();await page.locator('#m-more-x').click();assert(await page.locator('#m-more-sheet').isHidden());
  await page.locator('#m-more').click();await page.keyboard.press('Escape');assert(await page.locator('#m-more-sheet').isHidden());
  await page.locator('#m-more').click();await page.locator('.m-worksheet-link').click();await page.waitForURL('**/backlog-worksheet.html',{waitUntil:'commit'});
  assert(await page.locator('#mobile-unavailable').isVisible());assert(await page.locator('#local-worksheet').isHidden());assert.match(await page.locator('main').innerText(),/More → Discovery backlog/);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(process.env.WORKSHEET_LINK_SHOTS)await page.screenshot({path:path.join(process.env.WORKSHEET_LINK_SHOTS,'launcher-iphone.png'),fullPage:true});
  await page.goBack({waitUntil:'commit'});await page.waitForSelector('#m-more');if(await page.locator('#m-more-sheet').isVisible())await page.locator('#m-more-x').click();await page.locator('#m-more').click();assert(await page.locator('[data-m-desk=backlog]').isVisible());
  await page.locator('.m-worksheet-link').click();await page.waitForURL('**/backlog-worksheet.html',{waitUntil:'commit'});assert.equal(calls.local,0);assert.equal(calls.writes,0);assert.deepEqual(errors,[]);await ctx.close();
  // iPad's desktop-site UA must not turn on the PC loopback link.
  ({ctx,calls}=await context({viewport:{width:1024,height:1366},hasTouch:true,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'}));
  await ctx.addInitScript(()=>{Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});});page=await ctx.newPage();await page.goto(base+'/backlog-worksheet.html');assert(await page.locator('#mobile-unavailable').isVisible());assert(await page.locator('#local-worksheet').isHidden());assert.equal(calls.local,0);await ctx.close();
  console.log('PASS: '+type+' desktop + iPhone/iPad emulation; app entries, explicit PC popup, mobile restriction, repeated navigation, Close/Escape, Back/Forward, no unsolicited loopback requests, zero writes.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
