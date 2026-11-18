/* Landscape Jobs table: #425's longer pay figure must not push Age off a phone. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const css=fs.readFileSync(path.join(__dirname,'..','pipeline-mobile.css'),'utf8');
const block=css.match(/@media \(max-height:520px\) and \(orientation:landscape\)\{([^{}]|\{[^{}]*\})*\}/);
test('landscape Jobs table keeps Age in view after the #425 Salary widen',()=>{
  assert.ok(block,'landscape phone media query is present');
  const body=block[0];
  assert.match(body,/table-layout:\s*fixed/,'fixed table so columns share the wrap width');
  assert.match(body,/\.m-table td \.m-b\{[^}]*overflow:\s*hidden/,'salary badges clip instead of widening Age off-screen');
  assert.match(body,/\.m-table th,html\.m-shell #m-root \.m-table td\{[^}]*overflow:\s*hidden/,'cells clip to their column');
});
