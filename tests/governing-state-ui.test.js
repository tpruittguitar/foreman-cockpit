const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','pipeline.html'),'utf8');
test('canonical BUCKET controls visibility and only explicit history views may show terminal',()=>{
 assert.match(source,/var TERMINAL_BUCKETS_=\{CLOSED_DEAD:1,DECLINED_BY_TIM:1,REJECTED_BY_EMPLOYER:1/);
 assert.match(source,/function terminalJob_\(r\)/);
 assert.match(source,/function allowedInView_\(r,key\)/);
 assert.match(source,/ALL:\{label:'All live'/);
 assert.match(source,/if\(!allowedInView_\(r,S\.preset\)\|\|!PRESETS\[S\.preset\]\.fn\(r\)\)return false/);
 assert.match(source,/TERMINAL:\{label:'Terminal \/ archive'.*fn:terminalJob_/);
});
test('map, selection, analytics and decision shortcuts respect terminal gate',()=>{
 assert.match(source,/function selectMapRow_\(id\)\{var r=rowById\(id\);if\(!r\|\|!allowedInView_/);
 assert.match(source,/function mapRows_\(mode\).*?allowedInView_/);
 assert.match(source,/function chartRows_\(\).*?terminalJob_/);
 assert.match(source,/function decideStrip_\(keys\)\{var rows=distinctRows_\(\)\.filter\(function\(r\)\{return !terminalJob_/);
 assert.match(source,/function renderDetail\(r\)\{if\(!allowedInView_/);
});
test('readback and blocker copy distinguish unverified evidence and actual reason',()=>{
 assert.match(source,/READBACK_UNCONFIRMED:.*Master verification pending/);
 assert.match(source,/Master does not confirm decision/);
 assert.match(source,/function blockerExplanation_\(r\)/);
 assert.match(source,/reason not recorded/);
 assert.match(source,/Flagged as blocked: /);
});
