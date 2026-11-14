'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../apps-script/Code.gs'),'utf8');
function runtime(value,broken=false){
 const calls=[];
 const box={PropertiesService:{getScriptProperties:()=>({getProperty:key=>{calls.push(key);if(broken)throw Error('unavailable');return value;}})}};
 vm.createContext(box);vm.runInContext(source,box);return {box,calls};
}
test('Writer reads exactly the private property and preserves its value without trimming',()=>{
 const {box,calls}=runtime(' test-only unchanged value ');
 assert.equal(box.PASSPHRASE,' test-only unchanged value ');
 assert.deepEqual(calls,['WRITER_PASSPHRASE']);
 assert.equal(box.auth_(' test-only unchanged value '),true);
 assert.equal(box.auth_('test-only unchanged value'),false);
 assert.equal(box.auth_('wrong'),false);
});
test('missing, empty, malformed or unavailable property fails closed',()=>{
 for(const value of [null,undefined,'',false,123]){
  const {box}=runtime(value);assert.equal(Boolean(box.auth_(value)),false);
 }
 assert.equal(Boolean(runtime('test-only',true).box.auth_('test-only')),false);
 const box={};vm.createContext(box);vm.runInContext(source,box);
 assert.equal(Boolean(box.auth_('')),false);
});
test('Writer source has no hardcoded passphrase',()=>{
 assert.doesNotMatch(source,/var PASSPHRASE\s*=\s*['"]/);
});
