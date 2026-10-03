const assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');

const weights = {experience:25, flex:23, compensation:20, geo:23, ats:0, title:5, culture:2, ownership:2};
assert.equal(W.SCORING_MODEL_ID, 'TIM_WEIGHTED_JOB_RATING');
assert.equal(W.validateScoringModel_({modelId:'TIM_WEIGHTED_JOB_RATING', weights}).ok, true);
assert.equal(W.validateScoringModel_({weights:Object.assign({}, weights, {geo:22})}).ok, false);
assert.equal(W.validateScoringModel_({weights:Object.assign({}, weights, {flex:101})}).ok, false);
assert.equal(W.validateScoringModel_({weights:Object.assign({}, weights, {ats:1})}).ok, false);
console.log('PASS scoring model validation and exact 100-point weights');
