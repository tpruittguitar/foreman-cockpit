/* Step 5 map rebuild, live app: rev4 BUILD 1 (lat / lon labels >= 8 px apart, lon labels after the lat column, none in the HUD
   band) and BUILD 2 (four corner brackets drawn, every overlay clear of their arms, 3:1 against the map), plus L-1 (no map text under
   11 px, HUD text uppercase, pins carry a glyph). Filtered view at 100% and the selected job zoomed, at 2560x1440 and 1440x900.
   Run: node tests/map-hud.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for tests/mobile.browser.js) */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');

// measured in the page: every rect relative to the map canvas (#job-map)
const measure=page=>page.evaluate(()=>{
  const box=document.getElementById('job-map'),b=box.getBoundingClientRect(),card=document.getElementById('job-map-card');
  const rel=e=>{const r=e.getBoundingClientRect();return {x:r.left-b.left,y:r.top-b.top,w:r.width,h:r.height}};
  const vis=e=>{if(!e||e.hidden)return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
  const band=card.querySelector('.map-band'),bandTop=band&&vis(band)?band.getBoundingClientRect().top-b.top:b.height;
  const labels=[...document.querySelectorAll('#map-grat text')].map(t=>Object.assign(rel(t),{t:t.textContent}));
  const arms=[...document.querySelectorAll('#map-frame path')].map(p=>{const m=p.getAttribute('d').match(/M([\d.]+),([\d.]+)V([\d.]+)H([\d.]+)/).slice(1).map(Number);const x=m[0],y1=m[1],y=m[2],x2=m[3];
    return [{x:Math.min(x,x2)-1,y:y-1,w:Math.abs(x2-x)+2,h:2},{x:x-1,y:Math.min(y,y1)-1,w:2,h:Math.abs(y1-y)+2}]}).flat();
  const frame=document.getElementById('map-frame'),stroke=frame&&frame.querySelector('path')?getComputedStyle(frame.querySelector('path')).stroke:'';
  const overlays=['.map-hud-tl','.map-loc-status','.map-seg','.map-zoom','.map-layers','.map-blegend','.map-actions','#map-lock .ro'].map(sel=>{const e=card.querySelector(sel);return vis(e)?Object.assign(rel(e),{sel}):null}).filter(Boolean);
  // L-1: rendered size of every visible text in the map card (SVG text scaled by the map transform)
  const small=[];card.querySelectorAll('*').forEach(e=>{if(!vis(e))return;const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());if(!own)return;let px=parseFloat(getComputedStyle(e).fontSize);if(e instanceof SVGElement&&e.getScreenCTM())px*=e.getScreenCTM().a;if(px<10.95)small.push((e.className&&e.className.baseVal!=null?e.className.baseVal:e.className)+' "'+e.textContent.trim().slice(0,20)+'" '+px.toFixed(1))});
  const upper=['#map-hud-show','#map-hud-cur','.map-seg button','.map-blegend','.map-actions button','#map-lock .ro'].map(sel=>[...card.querySelectorAll(sel)]).flat().filter(vis).filter(e=>getComputedStyle(e).textTransform!=='uppercase'&&e.textContent!==e.textContent.toUpperCase()).map(e=>e.textContent.slice(0,30));
  const pins=[...card.querySelectorAll('.map-target')].filter(e=>!e.hidden).map(e=>({band:e.dataset.band,g:(e.querySelector('.pin-g')||{}).textContent||''}));
  const bg=getComputedStyle(box).backgroundColor;
  return {W:b.width,H:b.height,bandTop,labels,arms,overlays,stroke,bg,small,upper,pins,pe:card.classList.contains('pe-map'),zoom:box.dataset.zoom};
});
const hit=(a,b,g)=>a.x<b.x+b.w+g&&b.x<a.x+a.w+g&&a.y<b.y+b.h+g&&b.y<a.y+a.h+g;
function lum(c){const m=c.match(/[\d.]+/g).map(Number).slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*m[0]+.7152*m[1]+.0722*m[2]}
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};

function check(m,what){
  assert(m.pe,what+': desktop map look is on');
  // BUILD 1
  assert(m.labels.length>0,what+': graticule labels drawn');
  const lat=m.labels.filter(l=>/N$/.test(l.t)),lon=m.labels.filter(l=>/[WE]$/.test(l.t));
  lon.forEach(l=>assert(l.x>=48-0.5,what+': '+l.t+' starts at x '+l.x.toFixed(1)+' (>= 48)'));
  m.labels.forEach(l=>assert(l.y+l.h<=m.bandTop+0.5,what+': '+l.t+' is above the HUD band'));
  for(let i=0;i<m.labels.length;i++)for(let j=i+1;j<m.labels.length;j++)assert(!hit(m.labels[i],m.labels[j],7.5),what+': '+m.labels[i].t+' and '+m.labels[j].t+' are >= 8 px apart');
  lat.forEach(a=>lon.forEach(o=>assert(!hit(a,o,7.5),what+': '+a.t+' clear of '+o.t)));
  // BUILD 2
  assert.equal(m.arms.length,8,what+': four brackets (8 arms)');
  m.arms.forEach(a=>{assert(a.x>=0&&a.y>=0&&a.x+a.w<=m.W+0.5&&a.y+a.h<=m.bandTop+0.5,what+': bracket arm inside the open canvas')});
  m.overlays.forEach(o=>m.arms.forEach(a=>assert(!hit(o,a,3.5),what+': '+o.sel+' keeps clear of a bracket arm')));
  m.labels.forEach(l=>m.arms.forEach(a=>assert(!hit(l,a,7.5),what+': label '+l.t+' clear of a bracket arm')));
  assert(contrast(m.stroke,m.bg)>=3,what+': bracket stroke '+m.stroke+' >= 3:1 on '+m.bg+' ('+contrast(m.stroke,m.bg).toFixed(2)+')');
  // L-1
  assert.deepEqual(m.small,[],what+': no map text under 11 px');
  assert.deepEqual(m.upper,[],what+': HUD text is uppercase');
  m.pins.forEach(p=>assert(p.g.trim().length>0,what+': pin ('+p.band+') carries a glyph'));
}

(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  for(const vp of [{width:2560,height:1440},{width:1440,height:900}]){
    const ctx=await browser.newContext({viewport:vp}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[]}}));   // offline: state centroids
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');return r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:a==='writer_status'?{ok:true,level:'ok',warnings:[],queue:{processing:[]}}:{ok:true}})});
    await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForSelector('#map-frame');await page.waitForTimeout(500);
    const what=vp.width+'x'+vp.height;
    // filtered view at 100%
    await page.locator('[data-mapseg="visible"]').click();await page.waitForTimeout(900);
    await page.locator('[data-mapaction="reset"]').click({force:true}).catch(()=>{});await page.waitForTimeout(800);
    let m=await measure(page);check(m,what+' filtered 100%');
    assert(m.pins.length>1,what+': filtered view draws several pins');
    assert.equal(await page.locator('[data-mapseg="visible"]').getAttribute('aria-pressed'),'true');
    // selected job, auto-zoomed, with the lock readout
    await page.locator('[data-mapseg="selected"]').click();await page.locator('#grid tbody tr[data-id]').first().click();await page.waitForTimeout(1100);
    m=await measure(page);check(m,what+' selected '+m.zoom);
    assert(await page.locator("#map-lock .ro").isVisible(),what+': lock reticle shown on the selected job');
    assert.match(await page.locator('#map-lock .ro').innerText(),/LOCK · .+\n\d+\.\d{4}°N \d{3}\.\d{4}°W.*\nRNG \d+ MI · BRG \d{3}° FROM HOME/,'lock readout is computed lat / lon, range and bearing');
    // zoom in twice more and re-check
    await page.locator('[data-mapzoom="in"]').click();await page.locator('[data-mapzoom="in"]').click();await page.waitForTimeout(600);
    m=await measure(page);check(m,what+' selected '+m.zoom);
    // the layers panel (map point filters) opens over the map: same 11 px floor, the active filter readable
    await page.locator('#map-layers').click();await page.waitForTimeout(300);
    const lay=await measure(page);assert.deepEqual(lay.small,[],what+': layers panel text >= 11 px');
    const on=await page.evaluate(()=>{const b=document.querySelector('#mapfilters button.on');if(!b)return null;const s=getComputedStyle(b);return [s.color,s.backgroundColor]});
    assert(on&&contrast(on[0],on[1])>=4.5,what+': active map filter text readable '+JSON.stringify(on));
    await page.locator('#map-layers').click();await page.waitForTimeout(200);
    // cursor readout follows the pointer inside CONUS
    const bb=await page.locator('#job-map').boundingBox();await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await page.waitForTimeout(100);
    assert.match(await page.locator('#map-hud-cur').innerText(),/^CURSOR \d+\.\d\d°N \d{3}\.\d\d°W · ZOOM \d+%$/,'cursor readout');
    assert.deepEqual(errors,[],what+': no page errors');
    await ctx.close();
  }
  await browser.close();server.close();console.log('map HUD browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
