(function(root){
'use strict';
var PRIORITIES=['P1','P2','P3','WATCH','PAUSED'];
var CADENCE={P1:'Every Scout run',P2:'At least daily',P3:'Rotating weekly coverage',WATCH:'Opportunistic',PAUSED:'No targeted search'};
var SECTION='TARGET_COMPANIES';
function clean(v){return String(v==null?'':v).trim()}
/* Locations may contain commas ("Hayward, CA"), so a typed list is separated by semicolons or new lines. */
function splitLocations(v){return (Array.isArray(v)?v:String(v==null?'':v).split(/[;\n]+/)).map(clean).filter(Boolean)}
function clone(v){return JSON.parse(JSON.stringify(v==null?{}:v))}
function normalizeCompany(x,i){
  x=x||{};var p=clean(x.priority).toUpperCase();if(PRIORITIES.indexOf(p)<0)p='WATCH';
  return {
    id:clean(x.id)||('TC-'+String(i+1).padStart(3,'0')),
    company:clean(x.company),
    aliases:Array.isArray(x.aliases)?x.aliases.map(clean).filter(Boolean):clean(x.aliases).split(',').map(clean).filter(Boolean),
    priority:p,status:p==='PAUSED'?'PAUSED':'ACTIVE',
    priority_source:clean(x.priority_source)||'SEED_RECOMMENDATION',
    careers_url:clean(x.careers_url),rationale:clean(x.rationale),
    builds:clean(x.builds),builds_source:clean(x.builds_source),builds_asof:clean(x.builds_asof),
    locations:splitLocations(x.locations),locations_source:clean(x.locations_source),locations_asof:clean(x.locations_asof),
    source_rank:Number(x.source_rank)||0,
    target_functions:Array.isArray(x.target_functions)?x.target_functions.map(clean).filter(Boolean):[],
    added_source:clean(x.added_source),last_searched_at:clean(x.last_searched_at),last_useful_hit_at:clean(x.last_useful_hit_at),
    jobs_found:Number(x.jobs_found)||0,qualified_hits:Number(x.qualified_hits)||0,notes:clean(x.notes)
  }
}
function normalizeRegistry(r){
  r=clone(r||{});var seen={},companies=[];
  (Array.isArray(r.companies)?r.companies:[]).forEach(function(x,i){var c=normalizeCompany(x,i),k=c.company.toLowerCase();if(!c.company||seen[k])return;seen[k]=1;companies.push(c)});
  return {schema_version:Number(r.schema_version)||1,manual_priority_controls:true,companies:companies}
}
function parseRules(text){
  text=String(text||'');var m=text.match(/(?:^|\n)SECTION=TARGET_COMPANIES\s*\n([\s\S]*?)(?=\nSECTION=|\nEND TIM_PIPELINE_RULES_CANONICAL|$)/);
  var rows=[];if(m){m[1].split(/\r?\n/).forEach(function(line){var x=line.match(/^TARGET_COMPANY=(\{.*\})\s*$/);if(!x)return;try{rows.push(JSON.parse(x[1]))}catch(e){}})}
  return normalizeRegistry({companies:rows})
}
function sectionText(registry){
  var r=normalizeRegistry(registry),lines=[
    'SECTION=TARGET_COMPANIES',
    'TARGET_COMPANY_REGISTRY_VERSION='+r.schema_version,
    'TARGET_COMPANY_MANUAL_PRIORITY_CONTROLS=YES',
    'TARGET_COMPANY_PRIORITY_POLICY=P1 every Scout run; P2 at least daily; P3 rotating weekly coverage; WATCH opportunistic; PAUSED no targeted search.',
    '- Target-company priority changes discovery intensity only. It never overrides compensation, geography, FLEX, scope/fit, Never-Consider, protected application state, dedupe, or canonical intake rules.',
    '- Broad fresh discovery remains mandatory every run; target-company sweeps are additive, not a replacement.'
  ];
  r.companies.forEach(function(c){lines.push('TARGET_COMPANY='+JSON.stringify(c))});return lines.join('\n')+'\n';
}
function setRules(text,registry){
  text=String(text||'');var sec=sectionText(registry),re=/(^|\n)SECTION=TARGET_COMPANIES\s*\n[\s\S]*?(?=\nSECTION=|\nEND TIM_PIPELINE_RULES_CANONICAL|$)/;
  if(re.test(text))return text.replace(re,function(m,p){return p+sec.replace(/\n$/,'')});
  var end='END TIM_PIPELINE_RULES_CANONICAL';if(text.indexOf(end)>=0)return text.replace(end,sec+end);
  return text.replace(/\s*$/,'\n\n')+sec;
}
function priorityRank(p){var i=PRIORITIES.indexOf(String(p||'').toUpperCase());return i<0?99:i}
function yieldPct(c){return c.jobs_found?c.qualified_hits/c.jobs_found:-1}
var SORTS={
  company:function(c){return c.company.toLowerCase()},
  notes:function(c){return String(c.builds||'').toLowerCase()},
  locations:function(c){return String((c.locations||[])[0]||'').toLowerCase()},
  priority:function(c){return priorityRank(c.priority)},
  cadence:function(c){return priorityRank(c.priority)},
  careers:function(c){return c.careers_url?0:1},
  source_rank:function(c){return Number(c.source_rank)||Infinity},
  yield:function(c){return -yieldPct(c)},
  last_hit:function(c){return c.last_useful_hit_at?-Date.parse(c.last_useful_hit_at)||0:Infinity}
};
/* Deterministic: chosen column, then priority, then company name. Empty text values always sort last. */
function sortCompanies(list,key,dir){
  var f=SORTS[key]||SORTS.priority,d=dir==='desc'?-1:1;
  return list.slice().sort(function(a,b){var x=f(a),y=f(b),r=0;
    if(x!==y){if(x===''||x===Infinity)r=1;else if(y===''||y===Infinity)r=-1;else r=(typeof x==='string'?x.localeCompare(y):(x<y?-1:1))*d}
    return r||priorityRank(a.priority)-priorityRank(b.priority)||a.company.localeCompare(b.company)})
}
function cadence(p){return CADENCE[p]||CADENCE.WATCH}
function today(){return new Date().toISOString().slice(0,10)}
/* Apply an edit-form submission to a company. Priority provenance changes only when Tim sets or changes the priority; "what they build" provenance only when that text changes. */
function applyEdit(c,f,isNew){
  c=c||{};var p=PRIORITIES.indexOf(f.priority)>=0?f.priority:'WATCH',builds=clean(f.builds);
  if(isNew||c.priority!==p)c.priority_source='TIM_MANUAL';
  var locs=splitLocations(f.locations);
  if(isNew||JSON.stringify(locs)!==JSON.stringify(splitLocations(c.locations))){c.locations_source=locs.length?'TIM_MANUAL':'';c.locations_asof=locs.length?today():''}
  c.locations=locs;
  if(isNew||builds!==clean(c.builds)){c.builds_source=builds?'TIM_MANUAL':'';c.builds_asof=builds?today():''}
  c.company=clean(f.company);c.priority=p;c.status=p==='PAUSED'?'PAUSED':'ACTIVE';c.builds=builds;
  c.aliases=String(f.aliases||'').split(',').map(clean).filter(Boolean);c.careers_url=clean(f.careers_url);c.rationale=clean(f.rationale);c.notes=clean(f.notes);
  return c
}
function provTag(source,asof,esc){var t=/^TIM/.test(source||'')?'Tim':source?'auto-search · verify':'';return t?' <span class="tip">['+esc(t)+(asof?' '+esc(asof):'')+']</span>':''}
function locationsHtml(c,esc){var l=c.locations||[];return l.length?l.map(function(x){return '<div>'+esc(x)+'</div>'}).join('')+provTag(c.locations_source,c.locations_asof,esc):'<span class="tip">—</span>'}
function notesHtml(c,esc){
  var src=/^TIM/.test(c.builds_source||'')?'Tim':c.builds_source?'auto-search · verify':'';
  return (c.builds?'<div>'+esc(c.builds)+(src?' <span class="tip">['+esc(src)+(c.builds_asof?' '+esc(c.builds_asof):'')+']</span>':'')+'</div>':'<div class="tip">What they build: not recorded</div>')+
    (c.rationale?'<div class="tip">Why here: '+esc(c.rationale)+'</div>':'')+(c.notes?'<div class="tip">Notes: '+esc(c.notes)+'</div>':'')+((c.aliases||[]).length?'<div class="tip">Aliases: '+esc(c.aliases.join(', '))+'</div>':'')
}
function createTargetCompanies(deps){
  var $=deps.$,esc=deps.esc,gsGet=deps.gsGet,gsPost=deps.gsPost,S=deps.S;
  var draft=null,editingId='',dirty=false,baseRules='',sortKey='priority',sortDir='asc';
  function setStatus(msg,bad){var el=$('companies-status');if(el){el.textContent=msg||'';el.style.color=bad?'var(--nm)':''}}
  function load(){
    var v=$('view-companies');if(!v)return;
    v.innerHTML='<div class="panel">Loading target companies…</div>';
    gsGet('canonical_rules').then(function(j){if(!j||!j.ok)throw new Error((j&&j.error)||'Canonical rules could not be loaded');baseRules=j.text||'';S.canonicalRules=j;draft=parseRules(baseRules);dirty=false;render()}).catch(function(e){v.innerHTML='<div class="panel"><h3>Target Companies</h3><div class="tip">'+esc(e.message)+'</div></div>'});
  }
  function options(cur){return PRIORITIES.map(function(p){return '<option value="'+p+'"'+(p===cur?' selected':'')+'>'+p+' · '+cadence(p)+'</option>'}).join('')}
  function summary(list){var c={P1:0,P2:0,P3:0,WATCH:0,PAUSED:0};list.forEach(function(x){if(c[x.priority]!==undefined)c[x.priority]++});return PRIORITIES.map(function(p){return '<span class="kpi"><b>'+c[p]+'</b><span>'+p+'</span></span>'}).join('')}
  function clearForm(){editingId='';['tc-company','tc-aliases','tc-careers','tc-locations','tc-builds','tc-rationale','tc-notes'].forEach(function(id){if($(id))$(id).value=''});if($('tc-priority'))$('tc-priority').value='P2';if($('tc-form-title'))$('tc-form-title').textContent='Add company'}
  function populateForm(c){editingId=c.id;$('tc-form-title').textContent='Edit company';$('tc-company').value=c.company;$('tc-priority').value=c.priority;$('tc-aliases').value=(c.aliases||[]).join(', ');$('tc-careers').value=c.careers_url||'';$('tc-locations').value=(c.locations||[]).join('; ');$('tc-builds').value=c.builds||'';$('tc-rationale').value=c.rationale||'';$('tc-notes').value=c.notes||'';if($('tc-form-title').scrollIntoView)$('tc-form-title').scrollIntoView({block:'start'})}
  function upsertForm(){
    var name=clean($('tc-company').value);if(!name){setStatus('Company name is required.',true);return}
    var existing=editingId&&draft.companies.find(function(c){return c.id===editingId});
    var dupe=draft.companies.find(function(c){return c.company.toLowerCase()===name.toLowerCase()&&(!existing||c.id!==existing.id)});if(dupe){setStatus('That company already exists.',true);return}
    var p=$('tc-priority').value,c=existing||{id:'TC-'+Date.now(),source_rank:0,target_functions:['Manufacturing','Quality','Production','Operations','Industrialization'],added_source:'Tim manual add',jobs_found:0,qualified_hits:0,last_searched_at:'',last_useful_hit_at:''};
    applyEdit(c,{company:name,priority:p,aliases:$('tc-aliases').value,careers_url:$('tc-careers').value,locations:$('tc-locations').value,builds:$('tc-builds').value,rationale:$('tc-rationale').value,notes:$('tc-notes').value},!existing);
    if(!existing)draft.companies.push(c);dirty=true;clearForm();render();setStatus('Unsaved changes. Click Save registry.')
  }
  function save(){
    setStatus('Saving through canonical rules and verifying…');
    gsGet('canonical_rules').then(function(j){if(!j||!j.ok)throw new Error((j&&j.error)||'Fresh rules read failed');var submitted=setRules(j.text||'',draft);return gsPost({action:'save_rules',rules:{text:submitted,actor:'TIM',note:'Pipeline Explorer target-company registry update'}}).then(function(w){if(!w||!w.ok)throw new Error((w&&w.error)||'Save failed');return {submitted:submitted}})}).then(function(ctx){return gsGet('canonical_rules').then(function(j){if(!j||!j.ok)throw new Error((j&&j.error)||'Readback failed');var back=parseRules(j.text||'');if(JSON.stringify(back.companies)!==JSON.stringify(normalizeRegistry(draft).companies))throw new Error('Target-company readback differs from submitted registry');baseRules=j.text||'';S.canonicalRules=j;draft=back;dirty=false;render();setStatus('Saved and verified. Scout will use these priorities on its next run.')})}).catch(function(e){setStatus(e.message,true)})
  }
  function render(){
    var v=$('view-companies');if(!v)return;draft=normalizeRegistry(draft||{});var rows=sortCompanies(draft.companies,sortKey,sortDir);
    var h='<div class="panel active"><h3>Target Companies</h3><div class="tip">Manual priority is authoritative for discovery intensity only. It never overrides pay, FLEX, scope, fit, Never-Consider, or application-state rules.</div><div style="margin:8px 0">'+summary(rows)+'</div><div class="row"><button id="companies-save" class="neon">Save registry</button><button id="companies-reload">Discard / reload</button><span id="companies-status" class="tip">'+(dirty?'Unsaved changes':'Stored in canonical Rules · SECTION=TARGET_COMPANIES')+'</span></div></div>';
    h+='<div class="panel"><h3 id="tc-form-title">Add company</h3><div class="edit-grid"><label>Company</label><input id="tc-company"><label>Priority</label><select id="tc-priority">'+options('P2')+'</select><label>Aliases</label><input id="tc-aliases" placeholder="comma separated"><label>Careers URL</label><input id="tc-careers" placeholder="https://…"><label>Locations</label><input id="tc-locations" placeholder="Hayward, CA (factory); Austin, TX — separate with ;"><label>What they build</label><textarea id="tc-builds" placeholder="Products and what they manufacture in-house"></textarea><label>Why they are on the list</label><input id="tc-rationale"><label>Notes</label><textarea id="tc-notes"></textarea></div><div class="row"><button id="tc-upsert" class="neon">Add / update</button><button id="tc-cancel">Clear</button></div></div>';
    h+='<div class="panel rep"><h3>Registry · '+rows.length+' companies</h3><table><thead><tr>'+[['company','Company'],['notes','Notes · what they build / why here'],['locations','Locations'],['priority','Priority'],['cadence','Scout cadence'],['careers','Careers'],['source_rank','Source rank'],['yield','Yield'],['last_hit','Last useful hit']].map(function(x){var on=x[0]===sortKey;return '<th data-sort="'+x[0]+'" tabindex="0" style="cursor:pointer" aria-sort="'+(on?(sortDir==='asc'?'ascending':'descending'):'none')+'" title="Sort by '+esc(x[1])+'">'+esc(x[1])+(on?(sortDir==='asc'?' ▲':' ▼'):'')+'</th>'}).join('')+'<th></th></tr></thead><tbody>'+rows.map(function(c){var y=c.jobs_found?Math.round(100*c.qualified_hits/c.jobs_found)+'%':'—';return '<tr><td><b>'+esc(c.company)+'</b></td><td class="tc-notes">'+notesHtml(c,esc)+'</td><td class="tc-locations">'+locationsHtml(c,esc)+'</td><td><select data-priority="'+esc(c.id)+'">'+options(c.priority)+'</select><div class="tip">'+esc(c.priority_source||'')+'</div></td><td>'+esc(cadence(c.priority))+'</td><td>'+(c.careers_url?'<a href="'+esc(c.careers_url)+'" target="_blank" rel="noopener">careers ↗</a>':'—')+'</td><td>'+esc(c.source_rank||'—')+'</td><td>'+esc(y)+'</td><td>'+esc(c.last_useful_hit_at||'—')+'</td><td><button data-edit="'+esc(c.id)+'">Edit</button></td></tr>'}).join('')+'</tbody></table></div>';
    v.innerHTML=h;$('companies-save').onclick=save;$('companies-reload').onclick=load;$('tc-upsert').onclick=upsertForm;$('tc-cancel').onclick=clearForm;
    v.querySelectorAll('[data-priority]').forEach(function(sel){sel.onchange=function(){var c=draft.companies.find(function(x){return x.id===sel.getAttribute('data-priority')});if(!c)return;c.priority=sel.value;c.status=c.priority==='PAUSED'?'PAUSED':'ACTIVE';c.priority_source='TIM_MANUAL';dirty=true;render();setStatus('Unsaved priority change. Click Save registry.')}});
    v.querySelectorAll('th[data-sort]').forEach(function(th){function go(){var k=th.getAttribute('data-sort');sortDir=k===sortKey&&sortDir==='asc'?'desc':'asc';sortKey=k;render()}th.onclick=go;th.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});
    v.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){var c=draft.companies.find(function(x){return x.id===b.getAttribute('data-edit')});if(c)populateForm(c)}});
  }
  return {open:load,render:render};
}
var api={create:createTargetCompanies,applyEdit:applyEdit,notesHtml:notesHtml,locationsHtml:locationsHtml,splitLocations:splitLocations,normalizeRegistry:normalizeRegistry,parseRules:parseRules,setRules:setRules,sectionText:sectionText,sortCompanies:sortCompanies,cadence:cadence,PRIORITIES:PRIORITIES};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PipelineTargetCompanies=api;
})(typeof window!=='undefined'?window:globalThis);
