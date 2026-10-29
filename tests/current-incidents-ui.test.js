const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const P=require('../pipeline-incidents');
test('the incidents screen renders only unresolved entries and retains the synchronized audit ledger',()=>{
 const store=P.empty();for(const [id,status]of [['open','ACTIVE'],['seen','ACKNOWLEDGED_UNRESOLVED'],['recently-fixed','RECOVERED'],['old-fixed','CLOSED']])store.incidents[id]={id,status,kind:'event',title:id,operation:id,latestAt:'2026-10-29T01:00:00Z'};
 const original=JSON.stringify(store),nodes={};const node=id=>nodes[id]||(nodes[id]={innerHTML:'',value:'',querySelector:()=>null,querySelectorAll:()=>[]});
 const html=fs.readFileSync(path.join(__dirname,'../pipeline.html'),'utf8'),start=html.indexOf('function renderIncidentHistory_(){'),end=html.indexOf('function ackIncident_(',start);
 const ctx={S:{incidents:store},PipelineIncidents:P,$:node,hasWriter:()=>false,esc:x=>String(x),incidentHtml_:i=>'<article>'+i.title+'</article>',outstandingWorkHtml_:q=>q.map(x=>x.operation).join(','),Date};
 vm.runInNewContext(html.slice(start,end)+'\nrenderIncidentHistory_();',ctx);
 assert.match(node('view-incident-history').innerHTML,/Current incidents/);assert.doesNotMatch(node('view-incident-history').innerHTML,/recovered \(24h\)|older resolved|Failure history|All states/);
 assert.match(node('inc-history-items').innerHTML,/open/);assert.match(node('inc-history-items').innerHTML,/seen/);assert.doesNotMatch(node('inc-history-items').innerHTML,/fixed/);assert.equal(JSON.stringify(store),original);
 assert.ok(P.forSync(store).incidents['recently-fixed'],'queue recovery history stays available in shared storage');
});
