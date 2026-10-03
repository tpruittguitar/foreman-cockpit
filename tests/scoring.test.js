const assert = require('assert');
const S = require('../pipeline-scoring');

const cfg = S.defaults();
assert.equal(Object.values(cfg.weights).reduce((a,b)=>a+b,0),100);
assert.equal(S.scoreRow({LOCATION:'Cleveland, TN',TITLE:'Director of Manufacturing',payload:{}},cfg).parts.geo.score,100);
assert.equal(S.scoreRow({LOCATION:'New York, NY',TITLE:'Director of Manufacturing',payload:{}},cfg).parts.geo.score,0);
assert.equal(S.scoreRow({LOCATION:'Tampa, FL',TITLE:'Director of Manufacturing',payload:{}},cfg).parts.geo.score,70);
assert.equal(S.scoreRow({LOCATION:'Detroit, MI',TITLE:'Director of Manufacturing',payload:{}},cfg).parts.geo.score,5);
assert.equal(S.geoScoreAt(35.1595,-84.8766,cfg).score,100);
assert.equal(S.geoScoreAt(40.7128,-74.006,cfg).score,0);
assert(S.geoScoreAt(39.5,-90,cfg).score > 0 && S.geoScoreAt(39.5,-90,cfg).score < 100);

const row = {LOCATION:'Cleveland, TN',TITLE:'Director of Manufacturing Quality',COMPANY:'Industrial Systems',compMid:240000,payload:{FIT_SCORE:'90',DEGREE_REQ:'not stated'}};
const scored = S.scoreRow(row,cfg);
assert(scored.overall >= 70 && scored.overall <= 100);
assert.equal(scored.parts.geo.score,100);
assert.equal(scored.parts.compensation.known,true);
assert(scored.parts.ats.score != null);
assert(['PASS','RISK','FAIL','UNKNOWN'].includes(scored.screenGate));
assert(scored.confidence < 100, 'missing component evidence should reduce confidence');

const custom = S.normalize({weights:{experience:100,compensation:0,geo:0,ats:0,title:0,culture:0,ownership:0},resumeKeywords:'torque, fastening'});
const customScore = S.scoreRow({LOCATION:'Cleveland, TN',TITLE:'Torque Engineer',payload:{FIT_SCORE:'88'}},custom);
assert.equal(customScore.overall,88);
console.log('PASS: configurable opportunity scoring, geographic anchors, compensation, ATS proxy, and confidence');
