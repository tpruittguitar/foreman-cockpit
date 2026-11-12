'use strict';
const {test} = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs');
const {validate} = require('../scripts/writer-deploy-preflight.cjs');
const source = "function writerPassphrase_(){return PropertiesService.getScriptProperties().getProperty('WRITER_PASSPHRASE');}";
const key = 'TEST-ONLY-FAKE-CREDENTIAL';
const fixture = () => ({source, liveSource:"var PASSPHRASE = '"+key+"'; // fake fixture", key, propertyVerified:'1'});
test('deploy credential preflight permits same-value transition only after independent property attestation',()=>{
 a.equal(validate(fixture()),'transition');
 a.throws(()=>validate({...fixture(),propertyVerified:undefined}),/independently/);
 a.throws(()=>validate({...fixture(),key:'DIFFERENT-TEST-VALUE'}),/does not match/);
});
test('deploy credential preflight rejects missing/placeholder credentials and literal repository auth',()=>{
 for(const key of [undefined,'','CHANGE-ME'])a.throws(()=>validate({...fixture(),key}),/privately/);
 a.throws(()=>validate({...fixture(),source:"var PASSPHRASE = 'TEST-ONLY';"}),/literal/);
 a.throws(()=>validate({...fixture(),source:'function noAuth(){}'}),/does not use/);
});
test('subsequent private-property deployment recognizes live private source and rejects unknown format',()=>{
 a.equal(validate({...fixture(),liveSource:source}),'private-property');
 a.throws(()=>validate({...fixture(),liveSource:'unknown source'}),/Unrecognized/);
 a.throws(()=>validate({...fixture(),liveSource:"var PASSPHRASE = 'escaped\\n';",key:'escaped\n'}),/unambiguous/);
});
test('credential mismatch errors never echo either credential',()=>{
 const f={...fixture(),key:'OTHER-TEST-SECRET'};
 try {validate(f);a.fail('expected rejection');}catch(e){a.ok(!e.message.includes(f.key));a.ok(!e.message.includes(key));}
});
test('deploy copies source unchanged and enforces preflight and live check before set-content',()=>{
 const s=fs.readFileSync('apps-script/deploy.sh','utf8');
 a.ok(!s.includes('LIVE_PASS_LINE'));a.ok(!s.includes('awk -v line='));
 a.match(s,/cp "\$f" "\$WORK\/out\/\$n.js"/);
 const write=s.indexOf('$API set-content');
 a.ok(s.indexOf('writer-deploy-preflight.cjs')<write);
 a.ok(s.indexOf('state-merge-check.cjs')<write);
 a.ok(!s.includes('"$LIVE_KEY"'));
 a.ok(!s.includes('${SKIP_STATE_CHECK:-}'));
 const check=fs.readFileSync('scripts/state-merge-check.cjs','utf8');
 a.match(check,/key = process.env.WRITER_PASSPHRASE/);
});
