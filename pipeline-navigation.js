/* One navigation catalogue for desktop and phone; existing route IDs stay stable. */
(function(){
 'use strict';
 var rail=document.querySelector('#rail .rail-in'),sheet=document.querySelector('#sheet .sheet-in'),bottom=document.getElementById('bottombar');
 var icons={};document.querySelectorAll('#rail [data-group-btn]').forEach(function(b){icons[b.dataset.groupBtn]=b.querySelector('svg').outerHTML});
 icons.kit='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/></svg>';
 var groups=[
  {id:'pipeline',label:'Pipeline',short:'Pipeline',route:'pipeline',icon:'pipeline',items:[['Decision queue','pipeline','NEEDS_TIM'],['Ready to pursue','pipeline','APPLY_NOW'],['Research queue','pipeline','RESEARCH_QUEUE'],['Missing evidence','pipeline','MISSING_DATA'],['Applied jobs','pipeline','APPLIED'],['Upcoming interviews','pipeline','INTERVIEWS'],['All live jobs','pipeline','ALL'],['Full-screen map','map'],['Compare roles','pipeline',null,'compare']]},
  {id:'discovery',label:'Discovery',short:'Discover',route:'quality',icon:'scout',items:[['Scout results','quality'],['New intake','pipeline','SCOUT_INTAKE'],['Discovery leads','pipeline','LEADS'],['Manual intake','intake'],['Target companies','companies']]},
  {id:'kit',label:'Application Kit',short:'Kit',route:'documents',icon:'kit',items:[['Document library','documents'],['Resume profile / ATS tools','documents',null,'profile']]},
  {id:'analytics',label:'Analytics',short:'Analytics',route:'reports',icon:'analytics',items:[['Pipeline trends and outcomes','reports']]},
  {id:'preferences',label:'Preferences',short:'Prefs',route:'scoring',icon:'system',items:[['FLEX policy and scoring','scoring'],['Pay and location preferences','scoring',null,'pay-location'],['Advanced governing rules','rules'],['Display and columns','columns']]},
  {id:'operations',label:'Operations',short:'Operations',route:'automations',icon:'operations',items:[['Coverage, backlog and recovery','automations'],['Schedules','automations',null,'schedules'],['System health','operations',null,'system'],['Writer connection','settings']]}
 ];
 function attrs(item){return ' data-go="'+item[1]+'"'+(item[2]?' data-preset="'+item[2]+'"':'')+(item[3]?' data-action="'+item[3]+'"':'');}
 var brand=rail.querySelector('.rail-brand'),foot=rail.querySelector('.rail-foot');rail.replaceChildren(brand);
 groups.forEach(function(g){var div=document.createElement('div');div.className='rail-group';div.dataset.group=g.id;div.innerHTML='<button data-tab="'+g.route+'" data-group-btn="'+g.id+'" aria-label="'+g.label+'">'+icons[g.icon]+'<span class="rl"><span class="nav-full">'+g.label+'</span><span class="nav-short">'+g.short+'</span></span></button><div class="rail-sub">'+g.items.map(function(item){return '<button'+attrs(item)+'>'+item[0]+'</button>'}).join('')+'</div>';rail.appendChild(div)});rail.appendChild(foot);
 var head=sheet.querySelector('.sheet-h');sheet.replaceChildren(head);head.querySelector('b').textContent='Sections';
 groups.forEach(function(g){var div=document.createElement('details');div.className='sheet-g';div.innerHTML='<summary><h4>'+g.label+'</h4></summary>'+g.items.map(function(item){return '<button'+attrs(item)+'>'+item[0]+'</button>'}).join('');sheet.appendChild(div)});
 bottom.innerHTML=groups.slice(0,4).map(function(g){return '<button data-go="'+g.route+'" data-group-btn="'+g.id+'">'+icons[g.icon]+'<span>'+g.short+'</span></button>'}).join('')+'<button data-go="more" aria-label="More sections">'+icons.system+'<span>More</span></button>';
})();
