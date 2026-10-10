/* Phase 2 navigation catalogue for desktop and phone; existing route IDs stay stable.
   Visible model: Pipeline, Map, AI Operations, Control Center, Analytics. */
(function(){
 'use strict';
 var rail=document.querySelector('#rail .rail-in'),sheet=document.querySelector('#sheet .sheet-in'),bottom=document.getElementById('bottombar');
 if(!rail||!sheet||!bottom)return;
 var icons={};
 document.querySelectorAll('#rail [data-group-btn]').forEach(function(b){
  var key=b.dataset.groupBtn,svg=b.querySelector('svg');
  if(key&&svg)icons[key]=svg.outerHTML;
 });
 icons.control=icons.system||'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15.5" cy="12" r="2"/><circle cx="7" cy="17" r="2"/></svg>';
 icons.aiops=icons.operations||'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.6l8.1 4.7v9.4L12 21.4l-8.1-4.7V7.3z"/><circle cx="12" cy="12" r="3.2"/></svg>';
 var groups=[
  {id:'pipeline',label:'Pipeline',short:'Pipeline',route:'pipeline',icon:'pipeline',items:[['Decision queue','pipeline','NEEDS_TIM'],['Ready to pursue','pipeline','APPLY_NOW'],['Research queue','pipeline','RESEARCH_QUEUE'],['Missing evidence','pipeline','MISSING_DATA'],['Applied jobs','pipeline','APPLIED'],['Upcoming interviews','pipeline','INTERVIEWS'],['All live jobs','pipeline','ALL'],['Compare roles','pipeline',null,'compare']]},
  {id:'map',label:'Map',short:'Map',route:'map',icon:'map',items:[['Full-screen map','map'],['Pipeline with map','pipeline']]},
  {id:'operations',label:'AI Operations',short:'AI Ops',route:'automations',icon:'aiops',items:[['Coverage, backlog and recovery','automations'],['Schedules','automations',null,'schedules'],['System health','operations',null,'system'],['Incident history','incident-history'],['Scout results','quality'],['New intake','pipeline','SCOUT_INTAKE'],['Discovery leads','pipeline','LEADS'],['Manual intake','intake'],['Target companies','companies']]},
  {id:'preferences',label:'Control Center',short:'Control',route:'scoring',icon:'control',items:[['FLEX policy and scoring','scoring'],['Pay and location preferences','scoring',null,'pay-location'],['Advanced governing rules','rules'],['Display and columns','columns'],['Document library','documents'],['Resume profile / ATS tools','documents',null,'profile'],['Writer connection','settings']]},
  {id:'analytics',label:'Analytics',short:'Analytics',route:'reports',icon:'analytics',items:[['Pipeline trends and outcomes','reports']]}
 ];
 function attrs(item){return ' data-go="'+item[1]+'"'+(item[2]?' data-preset="'+item[2]+'"':'')+(item[3]?' data-action="'+item[3]+'"':'');}
 function iconFor(g){return icons[g.icon]||icons.pipeline||'';}
 var brand=rail.querySelector('.rail-brand'),foot=rail.querySelector('.rail-foot');
 rail.replaceChildren(brand);
 groups.forEach(function(g){
  var div=document.createElement('div');
  div.className='rail-group';
  div.dataset.group=g.id;
  div.innerHTML='<button data-tab="'+g.route+'" data-group-btn="'+g.id+'" aria-label="'+g.label+'">'+iconFor(g)+'<span class="rl"><span class="nav-full">'+g.label+'</span><span class="nav-short">'+g.short+'</span></span></button><div class="rail-sub">'+g.items.map(function(item){return '<button'+attrs(item)+'>'+item[0]+'</button>'}).join('')+'</div>';
  rail.appendChild(div);
 });
 rail.appendChild(foot);
 var head=sheet.querySelector('.sheet-h');
 sheet.replaceChildren(head);
 if(head&&head.querySelector('b'))head.querySelector('b').textContent='Sections';
 groups.forEach(function(g){
  var div=document.createElement('details');
  div.className='sheet-g';
  div.innerHTML='<summary><h4>'+g.label+'</h4></summary>'+g.items.map(function(item){return '<button'+attrs(item)+'>'+item[0]+'</button>'}).join('');
  sheet.appendChild(div);
 });
 bottom.innerHTML=groups.map(function(g){return '<button data-go="'+g.route+'" data-group-btn="'+g.id+'">'+iconFor(g)+'<span>'+g.short+'</span></button>'}).join('');
})();

/* Phase 6 Control Center baseline.
   Presentation/control-plane only: surfaces governance and jump points without publishing rules, scoring, Writer, Drive, or master changes. */
(function(){
 'use strict';
 var injected=false;
 function css(){
  if(document.getElementById('control-center-css'))return;
  var style=document.createElement('style');
  style.id='control-center-css';
  style.textContent='\n.control-center-shell{margin:8px;border:1px solid var(--line2);background:linear-gradient(180deg,#080808,#030303);padding:12px;border-radius:6px}\n.control-center-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:10px}\n.control-center-head h2{margin:0;font-size:16px;letter-spacing:1.8px;text-transform:uppercase;color:#fff}\n.control-center-head p{margin:4px 0 0;color:var(--dim);max-width:880px}\n.control-center-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}\n.control-card{border:1px solid var(--line);background:#050505;padding:10px;min-height:112px;border-radius:4px}\n.control-card h3{margin:0 0 6px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--dim)}\n.control-card b{display:block;color:#fff;font-size:16px;margin-bottom:4px}\n.control-card p{margin:0 0 8px;color:var(--faint);font-size:11.5px;line-height:1.35}\n.control-card button{min-height:30px;margin:2px 4px 2px 0;padding:3px 8px;font:10.5px var(--mono);letter-spacing:.7px}\n.control-card.status-ok{border-left:3px solid var(--ok)}.control-card.status-warn{border-left:3px solid var(--caution)}\n.control-note{margin-top:10px;color:var(--dim);font:11px/1.45 var(--mono);border-top:1px solid var(--line);padding-top:8px}\n@media(max-width:760px),(pointer:coarse) and (max-width:980px){.control-center-shell{margin:6px;padding:9px}.control-center-head{display:block}.control-center-grid{grid-template-columns:1fr}.control-card{min-height:0}}\n';
  document.head.appendChild(style);
 }
 function clickRoute(route,action){
  var sel=action?'[data-go="'+route+'"][data-action="'+action+'"]':'[data-go="'+route+'"];'
  var btn=document.querySelector(action?'[data-go="'+route+'"][data-action="'+action+'"]':'[data-go="'+route+'"]');
  if(btn)btn.click();
 }
 function card(cls,title,status,body,buttons){
  return '<section class="control-card '+cls+'"><h3>'+title+'</h3><b>'+status+'</b><p>'+body+'</p>'+buttons.map(function(b){return '<button data-cc-go="'+b[1]+'"'+(b[2]?' data-cc-action="'+b[2]+'"':'')+'>'+b[0]+'</button>'}).join('')+'</section>';
 }
 function scoringState(){
  try{var raw=localStorage.getItem('scoring');if(raw)return 'Local draft present'}catch(e){}
  return window.PipelineScoring?'Viewer model loaded':'Unknown';
 }
 function render(){
  var view=document.getElementById('view-scoring');
  if(!view||!view.classList.contains('on'))return;
  if(view.querySelector('.control-center-shell'))return;
  css();
  var shell=document.createElement('section');
  shell.className='control-center-shell';
  shell.innerHTML='<div class="control-center-head"><div><h2>Control Center</h2><p>One place to see and reach the governing surfaces. This is a cockpit layer only: edits still use the existing Rules, Scoring, Columns, Documents, and Writer screens. Nothing here publishes or mutates authority by itself.</p></div><span class="chip on">PRESENTATION ONLY</span></div><div class="control-center-grid">'+
   card('status-ok','Live scoring','Loaded / guarded','Scoring edits remain local or governed by the existing scoring save/publish controls. VNext is not made live here.',[['Scoring','scoring'],['Pay / geo','scoring','pay-location']])+
   card('status-ok','Rules authority','Reachable','Canonical rule editing remains in the Advanced Rules view. This shell does not rewrite Drive authority.',[['Rules','rules']])+
   card('status-warn','Writer connection','Separate gate','Writer status and connection checks remain in the existing Settings/Writer surface.',[['Writer','settings']])+
   card('status-ok','Display controls','Reachable','Columns and table display controls remain separate until full table persistence is completed.',[['Columns','columns']])+
   card('status-ok','Documents','Reachable','Resume profile, ATS keywords, and job documents remain in the document library.',[['Documents','documents'],['ATS tools','documents','profile']])+
   card('status-warn','Governance','Manual review','Provider schedules, lane prompts, and Drive authorities are visible through AI Operations; this page does not alter them.',[['AI Operations','automations'],['Schedules','automations','schedules']])+
  '</div><div class="control-note">Status: '+scoringState()+'. All cards are navigation shortcuts and status summaries only. No Writer, master, scoring, rules, automation, or Drive authority mutation is performed by the Control Center shell.</div>';
  view.insertBefore(shell,view.firstChild);
  shell.querySelectorAll('[data-cc-go]').forEach(function(b){b.onclick=function(){clickRoute(b.getAttribute('data-cc-go'),b.getAttribute('data-cc-action'))}});
 }
 function boot(){
  var mo=new MutationObserver(function(){requestAnimationFrame(render)});
  mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  render();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
