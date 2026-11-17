const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const repo=process.env.REPO||path.resolve(__dirname,'../../../..'),OUT=process.argv[2];
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2','.png':'image/png'};
const POSE=process.env.POSE||'';
const views=process.env.VIEWS?JSON.parse(process.env.VIEWS):[[30,6],[12,34],[-50,8],[-32,8],[160,10],[100,8]].map(v=>[v[0],v[1],+process.env.ZM||1.4]); // az, el, zoom
(async()=>{fs.mkdirSync(OUT,{recursive:true});
const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x'),f=path.join(repo,decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(0,r));
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>{if(m.type()=='error')console.log('C',m.text())});
for(let i=0;i<views.length;i++){const [az,el,z]=views[i];
await p.setViewportSize({width:750,height:970});
await p.goto(`http://localhost:${server.address().port}/tools/president-avatar.html?pose=${POSE||'stand'}&az=${az}&el=${el}&zoom=${z}&ty=${process.env.TY||0.62}`);
await p.waitForFunction(()=>document.title==='ready',null,{timeout:60000});
await p.screenshot({path:path.join(OUT,`v${i+1}.png`)});}
await b.close();server.close();})();
