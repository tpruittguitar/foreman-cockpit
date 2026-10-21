/* Four-section navigation (2026-10-11, Tim approved): Pipeline / Intake / System / Settings.
   The rail and phone bar show only the four sections; each section's pages appear as one row of tabs at the top of the
   content. Route IDs, presets and actions are unchanged, so every existing link, hash and saved view still resolves.
   Group IDs match TAB_GROUP in pipeline.html (pipeline, discovery, operations, preferences). */
(function(){
 'use strict';
 var rail=document.querySelector('#rail .rail-in'),sheet=document.querySelector('#sheet .sheet-in'),bottom=document.getElementById('bottombar');
 if(!rail||!sheet||!bottom)return;
 var icons={};
 document.querySelectorAll('#rail [data-group-btn]').forEach(function(b){
  var key=b.dataset.groupBtn,svg=b.querySelector('svg');
  if(key&&svg)icons[key]=svg.outerHTML;
 });
 var gear='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15.5" cy="12" r="2"/><circle cx="7" cy="17" r="2"/></svg>';
 var hex='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.6l8.1 4.7v9.4L12 21.4l-8.1-4.7V7.3z"/><circle cx="12" cy="12" r="3.2"/></svg>';
 var inbox='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/></svg>';
 icons.settings=icons.preferences||icons.system||gear;icons.system=icons.operations||hex;icons.intake=icons.discovery||inbox;
 // [label, route, preset, action]
 var groups=[
  {id:'pipeline',label:'Pipeline',route:'pipeline',icon:'pipeline',items:[['Act now','act-now'],['Jobs','pipeline'],['Review queue','pipeline','NEEDS_TIM'],['Decline candidates','pipeline','DECLINE_CANDIDATES'],['My rulings','pipeline','RULED'],['Map','map'],['Trends','reports'],['Compare','pipeline',null,'compare']]},
  {id:'discovery',label:'Intake',route:'quality',icon:'intake',items:[['Scout results','quality'],['Scout intake','pipeline','SCOUT_INTAKE'],['Discovery leads','pipeline','LEADS'],['Manual intake','intake'],['Target companies','companies']]},
  {id:'operations',label:'System',route:'automations',icon:'system',items:[['Needs you','needs-tim'],['Dashboard','automations'],['Schedules','automations',null,'schedules'],['Health','operations',null,'system'],['Incidents','incident-history'],['Writer connection','settings']]},
  {id:'preferences',label:'Settings',route:'scoring',icon:'settings',items:[['Scoring & FLEX','scoring'],['Pay & location','scoring',null,'pay-location'],['Rules','rules'],['Display & columns','columns'],['Documents','documents'],['Resume & ATS','documents',null,'profile']]}
 ];
 function attrs(item){return ' data-go="'+item[1]+'"'+(item[2]?' data-preset="'+item[2]+'"':'')+(item[3]?' data-action="'+item[3]+'"':'');}
 function iconFor(g){return icons[g.icon]||icons.pipeline||'';}
 var brand=rail.querySelector('.rail-brand'),foot=rail.querySelector('.rail-foot');
 rail.replaceChildren(brand);
 groups.forEach(function(g){
  var div=document.createElement('div');div.className='rail-group';div.dataset.group=g.id;
  div.innerHTML='<button data-tab="'+g.route+'" data-group-btn="'+g.id+'" aria-label="'+g.label+'">'+iconFor(g)+'<span class="rl"><span class="nav-full">'+g.label+'</span><span class="nav-short">'+g.label+'</span></span></button>';
  rail.appendChild(div);
 });
 rail.appendChild(foot);
 var head=sheet.querySelector('.sheet-h');sheet.replaceChildren(head);
 if(head&&head.querySelector('b'))head.querySelector('b').textContent='Sections';
 groups.forEach(function(g){
  var d=document.createElement('details');d.className='sheet-g';
  d.innerHTML='<summary><h4>'+g.label+'</h4></summary>'+g.items.map(function(item){return '<button'+attrs(item)+'>'+item[0]+'</button>'}).join('');
  sheet.appendChild(d);
 });
 bottom.innerHTML=groups.map(function(g){return '<button data-go="'+g.route+'" data-group-btn="'+g.id+'">'+iconFor(g)+'<span>'+g.label+'</span></button>'}).join('');

 // One tab row for the current section. Built now, before pipeline.html binds [data-go], so the existing route handler
 // drives every tab; this module only decides which row is visible and which tab is current.
 var strip=document.createElement('nav');strip.id='section-tabs';strip.setAttribute('aria-label','Section pages');
 strip.innerHTML=groups.map(function(g){return '<div class="st-row" data-st-group="'+g.id+'" role="tablist" hidden>'+g.items.map(function(item,i){return '<button role="tab" data-st-key="'+g.id+':'+i+'"'+attrs(item)+'>'+item[0]+'</button>'}).join('')+'</div>'}).join('')+'<button hidden data-st-reset data-go="pipeline" data-preset="OPEN" tabindex="-1" aria-hidden="true"></button>';
 var anchor=document.getElementById('filters');(anchor&&anchor.parentNode?anchor.parentNode.insertBefore(strip,anchor):document.body.insertBefore(strip,document.body.firstChild));
 if(!document.getElementById('section-tabs-css')){var css=document.createElement('style');css.id='section-tabs-css';css.textContent='#section-tabs{display:flex;flex:none;border-bottom:1px solid var(--line,#2a2a2a);background:var(--panel,#0d0d0d);overflow-x:auto;scrollbar-width:none}#section-tabs::-webkit-scrollbar{display:none}#section-tabs .st-row{display:flex;gap:2px;padding:0 10px}#section-tabs .st-row[hidden]{display:none}#section-tabs button{flex:none;min-height:40px;padding:0 14px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dim,#b8b8b8);font:12px var(--mono,monospace);letter-spacing:1.1px;text-transform:uppercase;white-space:nowrap;cursor:pointer}#section-tabs button:hover{color:var(--text,#f5f5f5)}#section-tabs button[aria-selected="true"]{color:var(--text,#f5f5f5);border-bottom-color:var(--px-accent-green,#39ff88)}#section-tabs button:focus-visible{outline:2px solid var(--px-focus-ring,#f5f5f5);outline-offset:-2px}@media(max-width:760px){#section-tabs button{min-height:44px;padding:0 12px}}';document.head.appendChild(css);}

 var lastKey='',lastGroup='pipeline';
 var INTAKE_PRESETS={SCOUT_INTAKE:1,LEADS:1};
 // REV-002 (Tim 2026-10-11 "can't find things waiting on my ruling"): decision presets get their own Pipeline tabs.
 var DECISION_PRESETS={NEEDS_TIM:1,DECLINE_CANDIDATES:1,RULED:1};
 // App state lives inside pipeline.html's closure; read what pushHash() writes to the URL (replaceState, so no
 // hashchange event) plus the page itself.
 var TAB_GROUP={'act-now':'pipeline',pipeline:'pipeline',map:'pipeline',reports:'pipeline',quality:'discovery',intake:'discovery',companies:'discovery',automations:'operations','incident-history':'operations','needs-tim':'operations',settings:'operations',rules:'preferences',scoring:'preferences',columns:'preferences',documents:'preferences'};
 function state(){
  var o={};try{o=JSON.parse(decodeURIComponent(location.hash.slice(1))||'{}')||{};}catch(e){o={};}
  var v=document.querySelector('.view.on'),tab=(v&&v.id.replace(/^view-/,''))||o.t||'pipeline';
  return {tab:tab,preset:o.p||'',map:!!o.m||document.body.classList.contains('map-full')};
 }
 function routeOf(item){return item[1]==='operations'?'automations':item[1];}
 function groupFor(st){
  if(st.tab==='pipeline'){if(INTAKE_PRESETS[st.preset]&&lastGroup==='discovery')return 'discovery';return 'pipeline';}
  return TAB_GROUP[st.tab]||lastGroup;
 }
 function matches(item,st){
  var r=routeOf(item);
  if(r==='map')return st.tab==='pipeline'&&st.map;
  if(r!==st.tab)return false;
  if(r==='pipeline'){if(st.map)return false;if(item[3]==='compare')return false;if(item[2])return st.preset===item[2];return !DECISION_PRESETS[st.preset]&&(!INTAKE_PRESETS[st.preset]||lastGroup!=='discovery');}
  return true;
 }
 function update(){
  var st=state(),g=groupFor(st);
  strip.querySelectorAll('.st-row').forEach(function(row){row.hidden=row.dataset.stGroup!==g;});
  var grp=groups.filter(function(x){return x.id===g;})[0],cur='';
  if(grp){
   if(lastKey&&lastKey.indexOf(g+':')===0&&matches(grp.items[+lastKey.split(':')[1]],st))cur=lastKey;
   else grp.items.some(function(item,i){if(item[3]&&item[3]!=='compare'&&item[3]!=='system')return false;if(matches(item,st)){cur=g+':'+i;return true;}return false;});
  }
  strip.querySelectorAll('button[data-st-key]').forEach(function(b){var on=b.dataset.stKey===cur;if(b.getAttribute('aria-selected')!==String(on)){b.setAttribute('aria-selected',String(on));if(on){var r=b.getBoundingClientRect(),sr=strip.getBoundingClientRect();if(r.left<sr.left||r.right>sr.right)strip.scrollLeft+=r.left-sr.left-(sr.width-r.width)/2;}}});
  document.querySelectorAll('[data-group-btn]').forEach(function(b){b.classList.toggle('cur',b.getAttribute('data-group-btn')===g);});
  document.querySelectorAll('#rail .rail-group').forEach(function(x){x.classList.toggle('cur',x.getAttribute('data-group')===g);});
 }
 document.addEventListener('click',function(e){
  var t=e.target.closest&&e.target.closest('[data-st-key],[data-group-btn],#sheet [data-go]');if(!t)return;
  if(t.dataset.stKey){lastKey=t.dataset.stKey;lastGroup=lastKey.split(':')[0];}
  else if(t.dataset.groupBtn){lastGroup=t.dataset.groupBtn;lastKey='';
   // Leaving Intake for Pipeline: drop the Intake-only filter so the job list is not silently narrowed.
   if(lastGroup==='pipeline'&&INTAKE_PRESETS[state().preset]){setTimeout(function(){var all=strip.querySelector('[data-st-reset]');if(all)all.click();setTimeout(update,0);},0);}}
  else{groups.forEach(function(g){g.items.forEach(function(item,i){if(item[1]===t.getAttribute('data-go')&&(item[2]||'')===(t.getAttribute('data-preset')||'')&&(item[3]||'')===(t.getAttribute('data-action')||'')){lastGroup=g.id;lastKey=g.id+':'+i;}});});}
  setTimeout(update,0);
 });
 window.addEventListener('hashchange',function(){setTimeout(update,0);});
 function boot(){update();setTimeout(update,300);setTimeout(update,1500);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
 window.PipelineSectionNav={update:update,groups:groups};
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
  shell.innerHTML='<div class="control-center-head"><div><h2>Settings</h2><p>One place to see and reach the governing surfaces. This is a cockpit layer only: edits still use the existing Rules, Scoring, Columns, Documents, and Writer screens. Nothing here publishes or mutates authority by itself.</p></div><span class="chip on">SHORTCUTS</span></div><div class="control-center-grid">'+
   card('status-ok','Live scoring','Loaded / guarded','Weights, salary, geo and FLEX updates publish numbered revisions of the shared scoring model for every viewer and agent. VNext is not made live here.',[['Scoring','scoring'],['Pay / geo','scoring','pay-location']])+
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
