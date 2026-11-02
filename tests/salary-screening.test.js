const test=require('node:test'),assert=require('node:assert/strict'),E=require('../pipeline-evidence');
test('posted maximum preserves a job whose midpoint is below the floor',()=>{
 const p={SALARY_BASE_POSTED:'$150,000–$220,000'};
 assert.equal(E.salaryMatches(p,210000,null),true);
 assert.equal(E.salaryMatches(p,221000,null),false);
 assert.deepEqual(E.decisionBand(p),{low:199000,high:220000});
});
test('estimates and posted salaries use the same range-overlap filter, midpoint alone never becomes a ceiling',()=>{
 assert.equal(E.salaryMatches({SALARY_BASE_EST:'$160K–$240K'},210000,null),true);
 assert.equal(E.salaryMatches({SALARY_MIDPOINT:'$220K'},210000,null),false);
 assert.equal(E.salaryMatches({SALARY_BASE_EST:'$240K–$280K'},null,210000),false);
});

test('actual Explorer sort keeps unknown maxima last in both directions',()=>{
 const fs=require('fs'),vm=require('vm'),html=fs.readFileSync(require('path').join(__dirname,'../pipeline.html'),'utf8');
 const source=html.slice(html.indexOf('function filteredRows(){'),html.indexOf('/* ---------- rendering ---------- */'));
 const c={S:{rows:[{id:'a',compMax:220000},{id:'b',compMax:null},{id:'c',compMax:280000}],sort:{col:'COMP_MAX',dir:'desc'}},passes:()=>true,defaultSort:()=>0,cmp:(a,b)=>a-b};vm.createContext(c);vm.runInContext(source,c);
 assert.equal(c.filteredRows().map(x=>x.id).join(','),'c,a,b');c.S.sort.dir='asc';assert.equal(c.filteredRows().map(x=>x.id).join(','),'a,c,b');
});
test('actual Explorer Ctrl click seeds the focused job into bulk selection',()=>{
 const fs=require('fs'),vm=require('vm'),html=fs.readFileSync(require('path').join(__dirname,'../pipeline.html'),'utf8');
 const source=html.split('\n').find(l=>l.startsWith('function bindRow_('));
 const c={S:{focus:'a',checked:{},selAnchor:'a'},PipelineListSelect:require('../pipeline-list-select'),filteredRows:()=>[{id:'a'},{id:'b'}],paintChecks_:()=>{},renderPresets:()=>{},mapSelectionChanged_:()=>{}};vm.createContext(c);vm.runInContext(source,c);const tr={getAttribute:()=> 'b'};c.bindRow_(tr);tr.onclick({ctrlKey:true,target:null});assert.equal(Object.keys(c.S.checked).sort().join(','),'a,b');
});
