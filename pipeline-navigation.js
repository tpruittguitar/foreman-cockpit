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
