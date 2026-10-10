const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','pipeline.html'),'utf8');
test('initial and fresh master read sort overall SCORE descending',()=>{
 assert.match(source,/preset:'ALL',sort:\{col:'OVERALL_RATING',dir:'desc'\}/);
 assert.match(source,/function resetOpeningTableLayout_\(\)\{\s*S.sort=\{col:'OVERALL_RATING',dir:'desc'\}/);
 assert.match(source,/buildColumnModel\(\);resetOpeningTableLayout_\(\);renderPresets\(\)/);
});
test('rendered text and fonts determine initial column widths after load only',()=>{
 assert.match(source,/function autoFitRenderedColumns_\(\)/);
 assert.match(source,/ctx\.measureText\(displayed\)\.width/);
 assert.match(source,/autoFitRenderedColumns_\(\);applyColumnWidths\(\)/);
 assert.equal((source.match(/resetOpeningTableLayout_\(\);/g)||[]).length,1);
});
test('overall rating is numeric and missing scores always sort last',()=>{
 assert.match(source,/if\(c==='OVERALL_RATING'\)return scoreFor_\(r\)\.overall/);
 assert.match(source,/if\(ma!==mb\)return ma\?1:-1/);
 assert.match(source,/difference=vx&&vy\?nx-ny:0/);
});
test('manual resize stays in effect until next master refresh',()=>{
 assert.match(source,/function persistColumnWidths\(\)\{\/\* Manual sizing stays authoritative/);
 assert.match(source,/columnWidths\(\)\[c\]=Math\.max/);
});
