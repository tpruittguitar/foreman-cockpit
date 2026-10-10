const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path');
const P=require('../pipeline-incidents');
const html=fs.readFileSync(path.join(__dirname,'..','pipeline.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','pipeline-ui-workspace.css'),'utf8');
test('System pane excludes resolved incidents; history is separately navigable',()=>{
 const m=html.match(/function incidentsHtml_\(hv,hh\)([\s\S]*?)function renderIncidentHistory_/);
 assert.ok(m);assert.match(m[1],/hv\.active/);assert.doesNotMatch(m[1],/hv\.recovered\.map|hv\.historical\.map/);
 assert.match(html,/id="view-incident-history"/);assert.match(html,/data-go="incident-history"/);
 assert.match(html,/renderIncidentHistory_\(\)/);
});
test('Document pane keeps preview and score below, adds resume and cover editors',()=>{
 assert.match(html,/documentEditorHtml_\('resume','Resume working text'\)/);
 assert.match(html,/documentEditorHtml_\('cover','Cover-letter working text'\)/);
 assert.match(html,/doc-preview-pane/);
 assert.match(html,/doc-score-panel/);
 assert.match(css,/doc-editors\{flex:1/);
 assert.match(css,/grid-template-rows:1fr 1fr/);
});
test('Verified recovery remains in incident history after 40 days',()=>{
 const s=P.empty(),t=Date.parse('2026-08-01T01:00:00Z');
 s.incidents['RECOVERED-1']={id:'RECOVERED-1',kind:'event',status:'RECOVERED',resolvedAt:new Date(t).toISOString(),latestAt:new Date(t).toISOString(),severity:'warning',title:'Old verified recovery'};
 P.observe(s,{runs:[]},t+40*86400000);
 assert.equal(P.view(s,t+40*86400000).historical.some(x=>x.id==='RECOVERED-1'),true);
});
