/* Needs you page (Tim 2026-10-18 15:41 ET) and the opening-page rule ("when a job is applied, rejected or dead it
   shouldn't be shown on opening page at the start"). */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const NT=require('../pipeline-needs-tim.js');
const html=fs.readFileSync(path.join(__dirname,'..','pipeline.html'),'utf8');
const NOW=Date.parse('2026-10-18T20:00:00Z');

/* Pull the real visibility functions out of pipeline.html and run them. */
function visibility(){
  const pick=re=>{const m=html.match(re);assert.ok(m,'source missing: '+re);return m[0]};
  const src=[pick(/var TERMINAL_BUCKETS_=\{[^}]*\};/),pick(/function closedPosting_\(r\)\{[^\n]*\}/),pick(/function terminalJob_\(r\)\{[^\n]*\}/),pick(/function historyPreset_\(key\)\{[^\n]*\}/),pick(/function allowedInView_\(r,key\)\{[^\n]*\}/)].join('\n');
  const ctx={};vm.createContext(ctx);vm.runInContext(src+';this.t=terminalJob_;this.a=allowedInView_;',ctx);return ctx;
}
const row=(bucket,p)=>({BUCKET:bucket,payload:p||{}});

test('dead postings, rejected and declined jobs are terminal; applied stays in Applied even when its posting closes',()=>{
  const v=visibility();
  assert.strictEqual(v.t(row('TIM_DECISION_REQUIRED',{LIVENESS:'CLOSED_EMPLOYER_404'})),true);
  assert.strictEqual(v.t(row('READY_TO_PURSUE',{LIVENESS:'CLOSED_EMPLOYER_ATS'})),true);
  assert.strictEqual(v.t(row('READY_TO_PURSUE',{LIVENESS:'LIVE_EMPLOYER_ATS'})),false);
  assert.strictEqual(v.t(row('REJECTED_BY_EMPLOYER')),true);
  assert.strictEqual(v.t(row('CLOSED_DEAD')),true);
  assert.strictEqual(v.t(row('APPLIED',{LIVENESS:'CLOSED_EMPLOYER_404'})),false,'applied jobs are not hidden from Applied');
  assert.strictEqual(v.a(row('SCOUT_INTAKE',{LIVENESS:'CLOSED_EMPLOYER_404'}),'OPEN'),false);
  assert.strictEqual(v.a(row('SCOUT_INTAKE',{LIVENESS:'CLOSED_EMPLOYER_404'}),'DEAD_POSTINGS'),true,'still inspectable in its own view');
});

test('Open roles hides applied; start never restores All live or a history view',()=>{
  assert.match(html,/OPEN:\{label:'Open roles',[^\n]*fn:function\(r\)\{return !terminalJob_\(r\)&&r\.BUCKET!=='APPLIED'\}\}/);
  const m=html.match(/S\.tab='pipeline';readHash\(\);([^\n]*?)switchTab\(/);assert.ok(m);
  ['ALL','APPLIED','DECLINED','TERMINAL','TERMINAL_HISTORY','DEAD_POSTINGS'].forEach(p=>{const S={tab:'pipeline',preset:p},LS={set(){}};vm.runInNewContext(m[1],{S,LS});assert.strictEqual(S.preset,'OPEN',p)});
  ['NEEDS_TIM','DECLINE_CANDIDATES','RULED','SCOUT_INTAKE'].forEach(p=>{const S={tab:'pipeline',preset:p},LS={set(){}};vm.runInNewContext(m[1],{S,LS});assert.strictEqual(S.preset,p,'working views survive a reload')});
  assert.match(fs.readFileSync(path.join(__dirname,'..','pipeline-navigation.js'),'utf8'),/data-st-reset data-go="pipeline" data-preset="OPEN"/,'leaving Intake returns to Open roles');
  // Simplify PR 1: a cold start with no link opens Act now; a link to the job table, or ?open=jobs, still opens the table.
  const run=(hash,search)=>{const S={tab:'pipeline',preset:'OPEN'},LS={set(){}};vm.runInNewContext(m[1],{S,LS,location:{hash,search}});return S.tab};
  assert.strictEqual(run('',''),'act-now');assert.strictEqual(run('#%7B%22t%22%3A%22pipeline%22%7D',''),'pipeline');assert.strictEqual(run('','?src=writer&open=jobs'),'pipeline');
});

test('live items: Writer faults, unfinished work, obligations, usage and job counts land in the right sections',()=>{
  const items=NT.liveItems({now:NOW,
    writer:{checkedAt:NOW,freeze:{frozen:true,reason:'test'},triggerInstalled:false,unverified:{count:2,oldestWrittenAt:new Date(NOW-3600000).toISOString()},queue:{hold:['a.json','b.json']},warnings:[{code:'QUEUE_BACKLOG',level:'warn',message:'9 waiting'},{code:'FAILED',level:'critical'},{code:'X',level:'notice'}]},
    workQueue:[{operation:'FORGE-EMAIL-B01',status:'VERIFY_OUTCOME',attempts:2,latestAt:new Date(NOW-7200000).toISOString(),latestError:'timeout'}],
    obligations:[{id:'O1',state:'FAILED_UNVERIFIED',source:'email'},{id:'O2',state:'X',acknowledgedAt:'2026-10-18'}],
    usage:[{provider:'GROK',meter:'weekly',verdict:'OUT',usedPct:100},{provider:'CLAUDE',meter:'weekly',verdict:'LASTS'}],
    jobs:{decide:3,ready:1,declineCandidates:4,unconfirmed:2,deadActive:5}});
  const by=id=>items.find(i=>i.id===id);
  assert.strictEqual(by('live:writer-frozen').level,'BLOCKING');
  assert.strictEqual(by('live:trigger-missing').level,'BLOCKING');
  assert.strictEqual(by('live:unverified').section,'FAILED');
  assert.match(by('live:queue-held').title,/2 lane files/);
  assert.strictEqual(by('live:writer-warning:QUEUE_BACKLOG').level,'WATCH');
  assert.ok(!by('live:writer-warning:FAILED'),'run failures come through incidents, not duplicated');
  assert.ok(!by('live:writer-warning:X'),'notices are not listed');
  assert.strictEqual(by('live:unfinished:FORGE-EMAIL-B01').section,'FAILED');
  assert.ok(by('live:obligation:O1')&&!by('live:obligation:O2'),'acknowledged obligations drop off');
  assert.ok(by('live:usage:GROK:weekly')&&!by('live:usage:CLAUDE:weekly'));
  assert.deepStrictEqual(['live:jobs-decide','live:jobs-ready','live:jobs-decline'].map(id=>by(id).section),['JOBS','JOBS','JOBS']);
  assert.strictEqual(by('live:jobs-decide').go.preset,'TIM_DECISION');
  assert.strictEqual(by('live:jobs-unconfirmed').section,'FAILED');
  assert.strictEqual(by('live:jobs-dead-active').go.preset,'DEAD_POSTINGS');
});

test('an unreachable Writer is one blocking item and suppresses the Writer detail it cannot know',()=>{
  const items=NT.liveItems({now:NOW,writer:{fetchError:'HTTP 500',checkedAt:NOW}});
  assert.deepStrictEqual(items.map(i=>i.id),['live:writer-unreachable']);
});

test('merge sorts blocking first, badge counts only blocking + action, and html shows every section and item',()=>{
  const repo={builtAt:new Date(NOW-600000).toISOString(),items:[{id:'ask:A',askId:'A',section:'DECIDE',level:'ACTION',title:'Auterion: P2 or Watch?',options:['Keep P2','Change to WATCH'],recommended:'WATCH',at:'2026-10-18T19:55:00Z',sourceUrl:'https://github.com/x'},{id:'pr:x#1',section:'UPKEEP',level:'WATCH',title:'PR',at:'2026-10-01T00:00:00Z'}],lanes:[{lane:'EMAIL',provider:'CHATGPT',lastAt:'2026-10-18T19:02:00Z',lastStatus:'PARTIAL_WITH_WORK',usualGapHours:3,runs7d:60,overdue:false}],dismissed:[{id:'z'}]};
  const m=NT.merge(repo,NT.liveItems({now:NOW,writer:{fetchError:'down',checkedAt:NOW}}),NOW);
  assert.strictEqual(m.items[0].level,'BLOCKING');
  assert.strictEqual(NT.badge(m),2);
  const out=NT.html(m,{now:NOW,writerAt:NOW});
  NT.SECTIONS.forEach(s=>assert.ok(out.html.indexOf(s.title.replace(/&/g,'&amp;'))>=0,s.id));
  assert.strictEqual(out.items.length,3);
  assert.match(out.html,/⊘<\/span> BLOCKING/); assert.match(out.html,/data-nt-opt="1"/); assert.match(out.html,/Lane heartbeat/); assert.match(out.html,/1 item hidden as already done/);
  assert.match(out.html,/No jobs are waiting on you/,'empty sections say so');
  assert.match(NT.answerText(m.items[1],'Change to WATCH'),/^Tim ruling on A \("Auterion: P2 or Watch\?"\): Change to WATCH\./);
});

test('html escapes text from repo files',()=>{
  const m=NT.merge({items:[{id:'x',section:'DECIDE',level:'ACTION',title:'<img src=x onerror=alert(1)>',detail:'"quoted" & <b>'}]},[],NOW);
  const out=NT.html(m,{now:NOW}).html;
  assert.ok(out.indexOf('<img src=x')<0); assert.match(out,/&lt;img src=x/);
});

test('page is wired: script, view, route, System tab, bell, badge refresh after Writer status',()=>{
  assert.match(html,/<script src="pipeline-needs-tim\.js"><\/script>/);
  assert.match(html,/<div class="view" id="view-needs-tim"><\/div>/);
  assert.match(html,/'needs-tim':'operations'/); assert.match(html,/if\(t==='needs-tim'\)renderNeedsTim_\(\);/);
  assert.match(html,/bell\.onclick=function\(e\)\{e\.stopPropagation\(\);switchTab\('needs-tim'\)\}/);
  assert.match(html,/scheduleWriterRefresh_\(\);ntLoad_\(false\);/);
  const nav=fs.readFileSync(path.join(__dirname,'..','pipeline-navigation.js'),'utf8');
  assert.match(nav,/items:\[\['Needs you','needs-tim'\],\['Dashboard','automations'\]/); assert.match(nav,/'needs-tim':'operations'/);
});
