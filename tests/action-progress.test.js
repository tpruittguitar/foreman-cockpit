const {test}=require('node:test');
const assert=require('node:assert/strict');
const {proves}=require('../pipeline-action-progress');
test('a saved row must match identity, decision and the exact original request',()=>{
  const r={primaryId:'one',kind:'DECLINE',requestId:'original'};
  const row={PRIMARY_ID:'one',BUCKET:'DECLINED_BY_TIM',payload:{STATE_SOURCE:'TIM:original'}};
  assert.equal(proves(row,r),true);
  assert.equal(proves({...row,PRIMARY_ID:'other'},r),false);
  assert.equal(proves({...row,BUCKET:'READY_TO_PURSUE'},r),false);
  assert.equal(proves({...row,payload:{STATE_SOURCE:'TIM:newer'}},r),false);
  assert.equal(proves({...row,payload:{}},r),false);
});
