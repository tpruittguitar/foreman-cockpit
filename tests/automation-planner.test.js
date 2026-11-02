const test=require('node:test'),a=require('node:assert/strict'),P=require('../automation-planner');
const at=s=>Date.parse(s);
test('workflow schedules come from current content, not a fixed timing table',()=>{
 const base='name: Worker\non:\n  workflow_dispatch:\n  schedule:\n    - cron: "13 2-23/4 * * *"\nconcurrency:\n  group: writer\njobs:\n  run:\n    timeout-minutes: 25';
 const w=P.workflow(base,'w.yml','r');a.equal(w.manual,true);a.equal(w.durationMinutes,25);a.equal(w.group,'writer');a.equal(P.occurrences(w,at('2026-11-02T00:00Z'),at('2026-11-03T00:00Z')).length,6);
 a.notDeepEqual(P.workflow(base.replace('13 2-23/4','42 *'),'w.yml','r').crons,w.crons);
});
test('RRULE times follow Eastern daylight saving rather than a fixed UTC offset',()=>{
 const rule='RRULE:FREQ=DAILY;BYHOUR=9;BYMINUTE=12;BYSECOND=0';
 a.equal(P.ruleMatch(rule,new Date('2026-10-31T13:12Z'),'America/New_York'),true);
 a.equal(P.ruleMatch(rule,new Date('2026-11-02T14:12Z'),'America/New_York'),true);
 a.equal(P.ruleMatch(rule,new Date('2026-11-02T13:12Z'),'America/New_York'),false);
});
test('running intervals, buffers and paused jobs change available windows',()=>{
 const t={name:'writer',status:'ACTIVE',crons:['0 * * * *'],durationMinutes:20};
 const now=at('2026-11-02T10:05Z'),g=P.windows([t],now,25,1);
 a.equal(g[0].start,at('2026-11-02T10:22Z'));a.equal(g[0].end,at('2026-11-02T10:58Z'));
 a.equal(P.windows([{...t,status:'PAUSED'}],now,25,1)[0].start,now);
 a.equal(P.windows([{...t,durationMinutes:60}],now,25,1).length,0);
});
test('stale, future and unsupported evidence cannot become clear-window advice',()=>{
 const now=at('2026-11-02T10:00Z');a.equal(P.fresh('2026-10-30T10:00Z',now),false);a.equal(P.fresh('2026-11-02T11:00Z',now),false);
 a.throws(()=>P.ruleMatch('RRULE:FREQ=MONTHLY',new Date(now),'UTC'));
 a.throws(()=>P.cronMatch('bad cron',new Date(now)));
});

test('planning duration adapts to recent main-run evidence, excluding failures and other branches',()=>{
 const task={file:'work.yml',durationMinutes:360};
 const run=n=>({path:'.github/workflows/work.yml',head_branch:'main',conclusion:'success',run_started_at:'2026-11-02T10:00Z',updated_at:new Date(Date.parse('2026-11-02T10:00Z')+n*60000).toISOString()});
 a.equal(P.withObservedDuration(task,[run(1),run(2)]).durationMinutes,360);
 a.equal(P.withObservedDuration(task,[run(1),run(2),run(5),{...run(100),head_branch:'feature'}]).durationMinutes,6);
});
