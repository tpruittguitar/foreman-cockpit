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
test('Greif, Angels of Care and Millennium re-declines settle on a later TIM source in the same bucket',()=>{
  const cases=[
    ['V2I-10649C9B8DD6','PX-BULK-1794553059753-4-9B8DD6','TIM:PX-20261113065855120-9B8DD6-J2DK','2026-11-13T06:58:55.120Z','Greif'],
    ['V2I-F9BCFBC945E3','PX-BULK-1794553059753-5-C945E3','TIM:PX-20261113065843227-C945E3-YG9G','2026-11-13T06:58:43.227Z','Angels of Care'],
    ['V2I-58C021A82C72','PX-BULK-1794553059753-6-A82C72','TIM:PX-20261113065832362-A82C72-2KN2','2026-11-13T06:58:32.362Z','Millennium']
  ];
  for(const [primaryId,requestId,source,at,job] of cases){
    const ruling={primaryId,kind:'DECLINE',requestId};
    const row={PRIMARY_ID:primaryId,BUCKET:'DECLINED_BY_TIM',payload:{STATE_SOURCE:source,STATE_UPDATED_AT:at}};
    assert.equal(proves(row,ruling),true,job);
  }
  const moved={PRIMARY_ID:'V2I-10649C9B8DD6',BUCKET:'MANUAL_RESEARCH',payload:{STATE_SOURCE:'TIM:PX-20261113065855120-9B8DD6-J2DK',STATE_UPDATED_AT:'2026-11-13T06:58:55.120Z'}};
  assert.equal(proves(moved,{primaryId:moved.PRIMARY_ID,kind:'DECLINE',requestId:'PX-BULK-1794553059753-4-9B8DD6'}),false);
});
