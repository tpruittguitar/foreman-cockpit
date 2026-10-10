const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','pipeline.html'),'utf8');
test('initial and fresh-load default sort highest displayed FIT first',()=>{
 assert.match(source,/preset:'ALL',sort:\{col:'EXPERIENCE_FIT',dir:'desc'\}/);
 assert.match(source,/function resetOpeningTableLayout_\(\)\{\s*S\.sort=\{col:'EXPERIENCE_FIT',dir:'desc'\}/);
 assert.match(source,/buildColumnModel\(\);resetOpeningTableLayout_\(\);renderPresets\(\)/);
});
test('column width auto-fits only on loading a master, not during render or filter changes',()=>{
 assert.match(source,/function resetOpeningTableLayout_\(\)/);
 assert.match(source,/Math\.min\(set\.phone\?235:290,w\)/);
 assert.match(source,/function render\(\)/);
 assert.equal((source.match(/resetOpeningTableLayout_\(\);/g)||[]).length,1);
});
test('manual resize remains effective within session and old local storage no longer overrides load',()=>{
 assert.match(source,/function persistColumnWidths\(\)\{\/\* Manual sizing stays authoritative/);
 assert.match(source,/columnWidths\(\)\[c\]=Math\.max/);
});
