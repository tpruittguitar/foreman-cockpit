const test=require('node:test'),assert=require('node:assert/strict'),C=require('../pipeline-control-room');
const r=n=>({perHour:n,available:true});
test('constraint uses unrounded output with work waiting, not rounded ties',()=>{assert.deepEqual(C.constraint([r(20),r(7),r(2.2),r(2.4)],[null,10,20,30]).indices,[2]);});
test('unknown is never zero; no red claim until active processes are measurable',()=>{assert.deepEqual(C.constraint([r(20),r(7),null,r(2)],[null,10,20,30]).indices,[]);});
test('empty process cannot be the constraint and real zero with work can',()=>{assert.deepEqual(C.constraint([r(20),r(0),r(2)],[null,0,30]).indices,[2]);assert.deepEqual(C.constraint([r(20),r(7),r(0),r(2)],[null,10,20,30]).indices,[2]);});
test('equal measured rates with backlog highlight both',()=>{assert.deepEqual(C.constraint([r(20),r(2),r(2)],[null,20,30]).indices,[1,2]);});
