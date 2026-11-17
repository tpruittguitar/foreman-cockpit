// usage: node rb.cjs jobs.json   jobs = [{out, p:{...}, views:[[az,el,zoom,ty]x6], pose}]
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const jobs=JSON.parse(fs.readFileSync(process.argv[2]));
(async()=>{const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const ctxs=[];const N=+process.env.PAR||4;const pages=[];for(let i=0;i<N;i++){const p=await b.newPage();await p.setViewportSize({width:750,height:970});pages.push(p);}
const tasks=[];for(const j of jobs){fs.mkdirSync(j.out,{recursive:true});j.views.forEach((v,i)=>tasks.push({j,v,i}));}
let k=0;await Promise.all(pages.map(async p=>{while(k<tasks.length){const t=tasks[k++];const [az,el,z,ty]=t.v;
 const url=`http://localhost:8796/tools/president-avatar.html?pose=${t.j.pose||'stand'}&az=${az}&el=${el}&zoom=${z}&ty=${ty}&p=${encodeURIComponent(JSON.stringify(t.j.p||{}))}`;
 await p.goto(url);await p.waitForFunction(()=>document.title==='ready',null,{timeout:60000});
 await p.screenshot({path:path.join(t.j.out,`v${t.i+1}.png`)});}}));
await b.close();})();
