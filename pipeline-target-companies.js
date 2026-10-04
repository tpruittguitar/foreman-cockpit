(function(root){
'use strict';
var PRIORITIES=['P1','P2','P3','WATCH','PAUSED'];
var CADENCE={P1:'Every Scout run',P2:'At least daily',P3:'Rotating weekly coverage',WATCH:'Opportunistic',PAUSED:'No targeted search'};
function clean(v){return String(v==null?'':v).trim()}
function clone(v){return JSON.parse(JSON.stringify(v==null?{}:v))}
function normalizeCompany(x,i){
  x=x||{};var p=clean(x.priority).toUpperCase();if(PRIORITIES.indexOf(p)<0)p='WATCH';
  var company=clean(x.company);return {
    id:clean(x.id)||('TC-LOCAL-'+String(i+1)),
    company:company,
    aliases:Array.isArray(x.aliases)?x.aliases.map(clean).filter(Boolean):clean(x.aliases).split(',').map(clean).filter(Boolean),
    priority:p,
    status:p==='PAUSED'?'PAUSED':'ACTIVE',
    priority_source:clean(x.priority_source)||'SEED_RECOMMENDATION',
    careers_url:clean(x.careers_url),
    rationale:clean(x.rationale),
    source_rank:Number(x.source_rank)||0,
    target_functions:Array.isArray(x.target_functions)?x.target_functions.map(clean).filter(Boolean):[],
    added_source:clean(x.added_source),
    last_searched_at:clean(x.last_searched_at),
    last_useful_hit_at:clean(x.last_useful_hit_at),
    jobs_found:Number(x.jobs_found)||0,
    qualified_hits:Number(x.qualified_hits)||0,
    notes:clean(x.notes)
  }
}
function normalizeRegistry(r){
  r=clone(r||{});var seen={};var companies=[];
  (Array.isArray(r.companies)?r.companies:[]).forEach(function(x,i){var c=normalizeCompany(x,i),k=c.company.toLowerCase();if(!c.company||seen[k])return;seen[k]=1;companies.push(c)});
  r.schema_version=Number(r.schema_version)||1;r.manual_priority_controls=true;r.companies=companies;return r
}
function priorityRank(p){var i=PRIORITIES.indexOf(String(p||'').toUpperCase());return i<0?99:i}
function sortCompanies(list){return list.slice().sort(function(a,b){return priorityRank(a.priority)-priorityRank(b.priority)||a.company.localeCompare(b.company)})}
function cadence(p){return CADENCE[p]||CADENCE.WATCH}
function createTargetCompanies(deps){
  var $=deps.$,esc=deps.esc,gsGet=deps.gsGet,gsPost=deps.gsPost,S=deps.S;
  var draft=null,editingId='',dirty=false;
  function setStatus(msg,bad){var el=$('companies-status');if(el){el.textContent=msg||'';el.style.color=bad?'var(--nm)':''}}
  function load(){
    var v=$('view-companies');if(!v)return;
    if(!S.targetCompanies){v.innerHTML='<div class="panel">Loading target companies…</div>';gsGet('target_companies').then(function(j){if(!j||!j.ok)throw new Error((j&&j.error)||'Target companies could not be loaded');S.targetCompanies=normalizeRegistry(j.registry||{});draft=clone(S.targetCompanies);render()}).catch(function(e){v.innerHTML='<div class="panel"><h3>Target Companies</h3><div class="tip">'+esc(e.message)+'</div></div>'});return}
    if(!draft)draft=clone(normalizeRegistry(S.targetCompanies));render()
  }
  function options(cur){return PRIORITIES.map(function(p){return '<option value="'+p+'"'+(p===cur?' selected':'')+'>'+p+' · '+cadence(p)+'</option>'}).join('')}
  function summary(list){var c={P1:0,P2:0,P3:0,WATCH:0,PAUSED:0};list.forEach(function(x){if(c[x.priority]!==undefined)c[x.priority]++});return PRIORITIES.map(function(p){return '<span class="kpi"><b>'+c[p]+'</b><span>'+p+'</span></span>'}).join('')}
  function clearForm(){editingId='';['tc-company','tc-aliases','tc-careers','tc-rationale','tc-notes'].forEach(function(id){if($(id))$(id).value=''});if($('tc-priority'))$('tc-priority').value='P2';if($('tc-form-title'))$('tc-form-title').textContent='Add company'}
  function populateForm(c){editingId=c.id;$('tc-form-title').textContent='Edit company';$('tc-company').value=c.company;$('tc-priority').value=c.priority;$('tc-aliases').value=(c.aliases||[]).join(', ');$('tc-careers').value=c.careers_url||'';$('tc-rationale').value=c.rationale||'';$('tc-notes').value=c.notes||'';window.scrollTo({top:0,behavior:'smooth'})}
  function upsertForm(){
    var name=clean($('tc-company').value);if(!name){setStatus('Company name is required.',true);return}
    var existing=editingId&&draft.companies.find(function(c){return c.id===editingId});
    var dupe=draft.companies.find(function(c){return c.company.toLowerCase()===name.toLowerCase()&&(!existing||c.id!==existing.id)});if(dupe){setStatus('That company already exists.',true);return}
    var p=$('tc-priority').value,c=existing||{id:'TC-'+Date.now(),source_rank:0,target_functions:['Manufacturing','Quality','Production','Operations','Industrialization'],added_source:'Tim manual add',jobs_found:0,qualified_hits:0,last_searched_at:'',last_useful_hit_at:''};
    c.company=name;c.priority=p;c.status=p==='PAUSED'?'PAUSED':'ACTIVE';c.priority_source='TIM_MANUAL';c.aliases=$('tc-aliases').value.split(',').map(clean).filter(Boolean);c.careers_url=clean($('tc-careers').value);c.rationale=clean($('tc-rationale').value);c.notes=clean($('tc-notes').value);
    if(!existing)draft.companies.push(c);dirty=true;clearForm();render();setStatus('Unsaved changes. Click Save registry.')
  }
  function save(){
    draft=normalizeRegistry(draft);draft.updated_at=new Date().toISOString();draft.owner=draft.owner||'Tim Pruitt';draft.purpose=draft.purpose||'Canonical target-company registry for Pipeline Explorer and Scout/Grok targeted discovery. Not a job population.';
    setStatus('Saving and verifying…');
    gsPost({action:'save_target_companies',registry:draft}).then(function(j){if(!j||!j.ok)throw new Error((j&&j.error)||'Save failed');return gsGet('target_companies')}).then(function(j){if(!j||!j.ok)throw new Error((j&&j.error)||'Readback failed');var back=normalizeRegistry(j.registry||{});if(JSON.stringify(back.companies)!==JSON.stringify(normalizeRegistry(draft).companies))throw new Error('Readback differs from submitted registry');S.targetCompanies=back;draft=clone(back);dirty=false;render();setStatus('Saved and verified. Scout will use these priorities on its next run.')}).catch(function(e){setStatus(e.message,true)})
  }
  function render(){
    var v=$('view-companies');if(!v)return;draft=normalizeRegistry(draft||S.targetCompanies||{});var rows=sortCompanies(draft.companies);
    var h='<div class="panel active"><h3>Target Companies</h3><div class="tip">Manual priority is authoritative for discovery intensity only. It never overrides pay, FLEX, scope, fit, Never-Consider, or application-state rules.</div><div style="margin:8px 0">'+summary(rows)+'</div><div class="row"><button id="companies-save" class="neon">Save registry</button><button id="companies-reload">Discard / reload</button><span id="companies-status" class="tip">'+(dirty?'Unsaved changes':'Drive-backed canonical registry')+'</span></div></div>';
    h+='<div class="panel"><h3 id="tc-form-title">Add company</h3><div class="edit-grid"><label>Company</label><input id="tc-company"><label>Priority</label><select id="tc-priority">'+options('P2')+'</select><label>Aliases</label><input id="tc-aliases" placeholder="comma separated"><label>Careers URL</label><input id="tc-careers" placeholder="https://…"><label>Why target</label><input id="tc-rationale"><label>Notes</label><textarea id="tc-notes"></textarea></div><div class="row"><button id="tc-upsert" class="neon">Add / update</button><button id="tc-cancel">Clear</button></div></div>';
    h+='<div class="panel rep"><h3>Registry · '+rows.length+' companies</h3><table><thead><tr><th>Company</th><th>Priority</th><th>Scout cadence</th><th>Careers</th><th>Source rank</th><th>Yield</th><th>Last useful hit</th><th></th></tr></thead><tbody>'+rows.map(function(c){var y=c.jobs_found?Math.round(100*c.qualified_hits/c.jobs_found)+'%':'—';return '<tr data-tc="'+esc(c.id)+'"><td><b>'+esc(c.company)+'</b><div class="tip">'+esc(c.rationale||'')+'</div></td><td><select data-priority="'+esc(c.id)+'">'+options(c.priority)+'</select><div class="tip">'+esc(c.priority_source||'')+'</div></td><td>'+esc(cadence(c.priority))+'</td><td>'+(c.careers_url?'<a href="'+esc(c.careers_url)+'" target="_blank" rel="noopener">careers ↗</a>':'—')+'</td><td>'+esc(c.source_rank||'—')+'</td><td>'+esc(y)+'</td><td>'+esc(c.last_useful_hit_at||'—')+'</td><td><button data-edit="'+esc(c.id)+'">Edit</button></td></tr>'}).join('')+'</tbody></table></div>';
    v.innerHTML=h;
    $('companies-save').onclick=save;$('companies-reload').onclick=function(){S.targetCompanies=null;draft=null;dirty=false;load()};$('tc-upsert').onclick=upsertForm;$('tc-cancel').onclick=clearForm;
    v.querySelectorAll('[data-priority]').forEach(function(sel){sel.onchange=function(){var c=draft.companies.find(function(x){return x.id===sel.getAttribute('data-priority')});if(!c)return;c.priority=sel.value;c.status=c.priority==='PAUSED'?'PAUSED':'ACTIVE';c.priority_source='TIM_MANUAL';dirty=true;render();setStatus('Unsaved priority change. Click Save registry.')}});
    v.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){var c=draft.companies.find(function(x){return x.id===b.getAttribute('data-edit')});if(c)populateForm(c)}});
  }
  return {open:load,render:render,normalizeRegistry:normalizeRegistry,sortCompanies:sortCompanies};
}
var api={create:createTargetCompanies,normalizeRegistry:normalizeRegistry,sortCompanies:sortCompanies,cadence:cadence,PRIORITIES:PRIORITIES};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PipelineTargetCompanies=api;
})(typeof window!=='undefined'?window:globalThis);
