const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const s=fs.readFileSync(path.join(__dirname,'..','pipeline.html'),'utf8');
test('overall rating uses compact SCORE table header, not internal key',()=>{assert.match(s,/esc\(c==='OVERALL_RATING'\?'SCORE':c\)/);});
test('score cell keeps rating information in tooltip without visible band text',()=>{assert.match(s,/esc\('Score '\+os\.overall\+' — '\+\(os\.band\|\|'Unclassified'\)\)/);assert.doesNotMatch(s,/os\.overall\+'<\/span> <span class="faint">'\+esc\(os\.band\)/);});
test('autosize measures SCORE label and uses narrow cap',()=>{assert.match(s,/c==='OVERALL_RATING'\?'SCORE':c\.replace/);assert.match(s,/var max=c==='OVERALL_RATING'\?76/);});
test('numeric overall sort and manual resize retained',()=>{assert.match(s,/if\(c==='OVERALL_RATING'\)return scoreFor_\(r\)\.overall/);assert.match(s,/function persistColumnWidths\(\)\{\/\* Manual sizing stays authoritative/);});
