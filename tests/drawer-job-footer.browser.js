/* Desktop job drawer: the body fills leftover height, the four decision buttons stay in the
   viewport, and STATE / REASON / DUPLICATE OF have associated labels (axe label + select-name).
   Run: node tests/drawer-job-footer.browser.js */
require('./helpers/block-production-writer.cjs');
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');

(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  async function open(width,height){
    const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
    const page=await ctx.newPage();
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[]}}));
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:a==='state'?{ok:true,state:{seen:{},reviewed:{}}}:{ok:true}})});
    await page.goto(base+'/pipeline.html?src=writer&open=jobs');
    await page.waitForSelector('#grid tbody tr[data-id]');
    await page.locator('#grid tbody tr[data-id]').first().click();
    await page.waitForSelector('#drawer.on #edit-state');
    await page.waitForSelector('#drawer .wh-decide button');
    return {ctx,page};
  }
  for(const [width,height] of [[1280,800],[1440,900]]){
    const {ctx,page}=await open(width,height);
    const m=await page.evaluate(()=>{
      const body=document.getElementById('d-body');
      const drawer=document.getElementById('drawer');
      const bs=[...document.querySelectorAll('#drawer .wh-decide button')];
      const cs=getComputedStyle(body);
      const inView=bs.map(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=-1&&r.left>=-1&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1});
      const fields=['edit-state','edit-reason','edit-dup'].map(id=>{
        const el=document.getElementById(id);
        const labeled=!!(el&&((el.labels&&el.labels.length)||(el.getAttribute('aria-label')||'').trim()));
        return {id,labeled};
      });
      return {
        bodyH:Math.round(body.getBoundingClientRect().height),
        bodyCH:body.clientHeight,
        overflowY:cs.overflowY,
        flexGrow:cs.flexGrow,
        buttons:bs.length,
        inView,
        fields,
        labelViolations:(function(){
          const fields=[...drawer.querySelectorAll('#edit-state, #edit-reason, #edit-dup')];
          return fields.filter(el=>{
            if(el.labels&&el.labels.length)return false;
            if((el.getAttribute('aria-label')||'').trim())return false;
            const ref=el.getAttribute('aria-labelledby');
            if(ref&&ref.split(/\s+/).some(x=>document.getElementById(x)))return false;
            return true;
          }).map(el=>el.id);
        })()
      };
    });
    assert(m.bodyH>200,width+'x'+height+' drawer body taller than 200 px, got '+m.bodyH);
    assert(m.bodyCH>200,width+'x'+height+' drawer body clientHeight taller than 200 px, got '+m.bodyCH);
    assert.equal(m.buttons,4,width+'x'+height+' has four decision buttons');
    assert.deepEqual(m.inView,[true,true,true,true],width+'x'+height+' all four buttons in the viewport: '+JSON.stringify(m));
    assert.deepEqual(m.labelViolations,[],width+'x'+height+' no critical label violations on the drawer fields: '+JSON.stringify(m.fields));
    assert(m.fields.every(f=>f.labeled),width+'x'+height+' STATE / REASON / DUPLICATE OF are labeled');
    assert(/auto|scroll/.test(m.overflowY),width+'x'+height+' body scrolls: '+m.overflowY);
    await ctx.close();
  }
  await browser.close();server.close();
  console.log('drawer-job-footer.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
