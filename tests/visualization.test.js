const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../pipeline-charts');
const R = require('../pipeline-rules');
const M = require('../pipeline-map');

const unknown = C.bars('Measured rates', [{label:'Admission', value:null}, {label:'Validity',value:0}], {max:100,unit:'%'});
assert(unknown.includes('Admission: Unknown'));
assert(unknown.includes('Validity: 0%'));
assert(!unknown.includes('Admission: 0%'));
const ring = C.donut('Complete population', [{label:'Ready',value:3},{label:'Applied',value:7}]);
assert(ring.includes('>10</text>'));
assert(ring.includes('Ready: 3 (30%)'));
assert(ring.includes('Applied: 7 (70%)'));
assert(!C.bars('<script>',[{label:'<img onerror="alert(1)">',value:1}]).includes('<img'));
assert(C.bars('No cohort',[]).includes('No recorded data'));
assert(!C.columns('Empty',[]).includes('NaN'));

const source = fs.readFileSync(path.join(__dirname,'fixtures/TIM_PIPELINE_RULES_CANONICAL.sample.txt'),'utf8');
const outline = R.outline(source);
assert.equal(outline.length,3);
assert.equal(outline[1].title,'NEVER_CONSIDER');
assert(source.slice(outline[1].offset).startsWith('SECTION=NEVER_CONSIDER'));
assert(outline[1].lines.join('\n').includes('NC-004'));
assert.equal(R.outline('Owner=Tim\r\n\r\nSECTION=PAY\r\nFLOOR=$200k')[1].title,'PAY');

assert.equal(M.states.length,51);
assert(M.states.find(s=>s.name==='Florida').path.length>200);
assert(M.states.every(s=>s.path.startsWith('M') && !/NaN|Infinity/.test(s.path)));
const alaska = M.project(64.2,-152,'AK'), hawaii = M.project(20.8,-156.3,'HI');
assert(alaska.x>=45 && alaska.x<=240 && alaska.y>=395 && alaska.y<=493);
assert(hawaii.x>=265 && hawaii.x<=355 && hawaii.y>=423 && hawaii.y<=493);
assert(M.project(61,-150,'AK').x!==M.project(61,-160,'AK').x);
console.log('PASS: chart accounting, unknown rates, safe labels, Rules offsets, real state map and inset projection');
