/* Discovery identities never enter the canonical row model or ruling endpoints. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PipelineBacklogGrid=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function value(item,col,now){
 var facts=item.discoveredFacts||{};
 if(col==='TITLE')return item.title||'';
 if(col==='COMPANY')return item.company||'';
 if(col==='LOCATION')return item.location||'';
 if(col==='BUCKET')return 'DISCOVERY';
 if(col==='LINK'||col==='SOURCE_URL')return /^https?:\/\//i.test(item.sourceUrl||'')?item.sourceUrl:'';
 if(col==='AGE'){var t=Date.parse(item.firstSeen);return Number.isFinite(t)?Math.max(0,Math.floor(((now||Date.now())-t)/86400000)):'';}
 // Do not turn preliminary overlap into a score or infer pay/FLEX from titles.
 if((col==='COMP_MAX'||col==='COMP_MID'||col==='SALARY_BASE_EST')&&facts.fullPosting&&facts.sourceRef&&(item.evidenceRefs||[]).some(function(r){return r.path===facts.sourceRef&&r.fullPosting})&&facts.pay&&Number.isFinite(facts.pay.low)&&Number.isFinite(facts.pay.high))return col==='COMP_MAX'?facts.pay.high:col==='COMP_MID'?(facts.pay.low+facts.pay.high)/2:'$'+facts.pay.low.toLocaleString('en-US')+'–$'+facts.pay.high.toLocaleString('en-US');
 return '';
}
function view(state,search,page,sort,size){size=size||100;var q=String(search||'').toLowerCase(),items=(state.items||[]).filter(function(i){return [i.company,i.title,i.location,i.status,i.reason,i.key].join(' ').toLowerCase().includes(q)});
 if(sort)items.sort(function(a,b){var x=value(a,sort.col),y=value(b,sort.col);if(x===''||y==='')return x===y?a.key.localeCompare(b.key):x===''?1:-1;var d=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y));return d*(sort.dir==='desc'?-1:1)||a.key.localeCompare(b.key)});
 var pages=Math.max(1,Math.ceil(items.length/size));page=Math.min(Math.max(0,page||0),pages-1);return {items:items.slice(page*size,(page+1)*size),total:items.length,pages:pages,page:page};
}
function gridHtml(items,cols,checked,sticky){return items.map(function(i){return '<tr data-candidate-key="'+esc(i.key)+'" class="discovery-row'+(checked[i.key]?' sel':'')+'" tabindex="0" aria-selected="'+!!checked[i.key]+'">'+cols.map(function(c,n){var v=value(i,c),h=esc(v),title='';if(c==='NEW')h='<input type="checkbox" data-candidate-check="'+esc(i.key)+'" aria-label="Select '+esc(i.company+' — '+i.title)+'"'+(checked[i.key]?' checked':'')+'>';else if(c==='TITLE')h='<span class="write-tag">Discovery</span> '+h;else if(c==='BUCKET'){h='<span class="bpill">Discovery</span>';title=i.status+' · '+i.reason;}else if(c==='LINK'||c==='SOURCE_URL')h=v?'<a class="rowlink" href="'+esc(v)+'" target="_blank" rel="noopener noreferrer" aria-label="Open posting">↗</a>':'—';else if(c==='COMP_MAX'||c==='COMP_MID')h=v===''?'—':'$'+Math.round(v/1000)+'k';else if(c==='AGE')h=v===''?'—':v+'<span class="faint">d</span>';else if(!h)h='<span class="faint">—</span>';return '<td class="'+(n<sticky?'sticky ':'')+(c==='NEW'?'c-new ':'')+(c==='LOCATION'?'c-loc ':'')+(c==='COMPANY'?'c-co ':'')+(c==='OVERALL_RATING'?'pin-r ':'')+'" title="'+esc(title||v)+'">'+h+'</td>'}).join('')+'</tr>'}).join('');}
function selection(items,checked){return items.filter(function(i){return checked[i.key]}).map(function(i){return {key:i.key,title:i.title,company:i.company,location:i.location,sourceUrl:i.sourceUrl}})}
return {value:value,view:view,gridHtml:gridHtml,selection:selection};
});
