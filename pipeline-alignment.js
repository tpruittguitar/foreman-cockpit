/* Shared automation intent and fail-closed preflight. Native adoption is separate evidence. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelineAlignment=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var VERSION='PIPELINE_AUTOMATION_ALIGNMENT_V1';
  var IDS={master:'1My9QYVPBblw8c7vFMFxGOAqgTSuH9gS8',rules:'1uuIopBY2Et-leu_tOdxnWAJJLniKwk08rdLCypuM2BE',common:'1EEWkG_jSYH0DzufrGDsD_IQb-FIhGIUlrtKlsNz2P9Y'};
  var TASKS=[
    {key:'forge-email',provider:'ChatGPT',owner:'FORGE',lane:'email',nativeId:'6a602fad02548191abe90ae34f165ef5',intent:'Review the declared Gmail window completely in bounded batches; admit every plausible new job and preserve every unfinished candidate.',actions:['intake','upsert_application']},
    {key:'forge-temporary-coverage',provider:'ChatGPT',owner:'FORGE',lane:'temporary-coverage',nativeId:'6a77ccaae8b08191b8ff748ef0426db7',intent:'Perform only the explicitly assigned temporary Scout, enrichment and recovery coverage; do not duplicate another lane or create a cross-AI relay.',actions:['intake','ruling']},
    {key:'forge-morning-freeze',provider:'ChatGPT',owner:'FORGE',lane:'freeze',nativeId:'6a96c7d75310819181b303fed3b9bb05',intent:'Produce the independently verified same-day morning handoff at the existing 07:00 America/New_York freeze; report incomplete processing instead of using a prior-day fallback.',actions:[]},
    {key:'claude-analysis',provider:'Claude',owner:'CLAUDE',lane:'analysis',nativeId:null,intent:'Analyze and rank existing canonical rows, enrich evidence on those same identities, and require the valid same-day freeze before the daily brief.',actions:['ruling']},
    {key:'grok-scout',provider:'Grok',owner:'GROK',lane:'scout',nativeId:null,intent:'Continue fresh public-source discovery and assigned company sweeps; admit plausible jobs through Writer without requiring complete pay, FLEX or first-party ATS data.',actions:['intake']},
    {key:'grok-resolver',provider:'Grok',owner:'GROK',lane:'resolver',nativeId:null,intent:'Resolve assigned canonical identity and evidence obligations, preserving protected application history and exact requisition binding.',actions:['ruling','upsert_application']}
  ];
  function stable(x){if(Array.isArray(x))return '['+x.map(stable).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(function(k){return JSON.stringify(k)+':'+stable(x[k])}).join(',')+'}';return JSON.stringify(x);}
  TASKS.forEach(function(t){t.active=t.provider==='ChatGPT';t.availability=t.active?'ACTIVE':'DEFERRED';});
  function copy(x){return JSON.parse(JSON.stringify(x));}
  function task(key){var t=TASKS.find(function(t){return t.key===key});if(!t)throw new Error('UNKNOWN_AUTOMATION_TASK');return copy(t);}
  function scopeCheck(t,s){
    if(!s||!Array.isArray(s.sources)||!s.sources.length||s.sources.some(function(x){return typeof x!=='string'||!x.trim()})||!s.windowPolicy||!s.assignmentEvidence)return false;
    if(t.lane==='email'&&(!Number.isInteger(s.maxMessagesPerBatch)||s.maxMessagesPerBatch<1||s.maxMessagesPerBatch>5))return false;
    if(t.lane==='temporary-coverage'&&(!s.expiresAt||!Number.isFinite(Date.parse(s.expiresAt))))return false;
    return true;
  }
  function prompt(t,scope){
    if(!scopeCheck(t,scope))throw new Error('APPROVED_SCOPE_REQUIRED');
    return [VERSION,'TASK_KEY='+t.key,'PROVIDER='+t.provider,'OWNER='+t.owner,'LANE='+t.lane,
      'INTENT='+t.intent,'APPROVED_SCOPE='+stable(scope),
      'AUTHORITY: explicit Tim instructions and platform requirements > ACTIVE canonical Rules and Writer > common Drive standard > provider adapter > this task prompt.',
      'Before every run and before each write, freshly read common Drive '+IDS.common+', ACTIVE canonical Rules '+IDS.rules+', the relevant AI_REASON, and native task prompt/schedule. Record exact content fingerprints, source IDs, attempt ID, capabilities and retrieval outcomes. Unreadable authority is BLOCKED_AUTHORITY.',
      'Sole live population: plain-text Drive '+IDS.master+'. Never read/write the frozen rollback Doc for live work. Writer alone changes canonical rows. No second population, direct master edits, or cross-AI recovery relay.',
      'Compare the entire native prompt with this approved contract. Material source, lookback, ownership, policy, verification or schedule drift means PAUSED_CONFLICT before any new write. Report both exact instructions, document fingerprints and task ID. Do not silently harmonize, change schedules, activate paused tasks or route around a policy refusal.',
      'Preserve the existing native task ID, enabled state and complete schedule. Only assigned sources and lanes are authorized. Missing native scope or ownership is BLOCKED_SCOPE; do not guess coverage. Temporary coverage expires on the recorded date.',
      'Preserve the initiating URL, message/source ID and exact candidate identity before screening. Read full bodies/digests and pagination, enumerate every link, reconcile all canonical states/archive/outstanding requests. Admit plausible jobs with unknown pay/FLEX/ATS; uncertainty is not an exclusion. Only active Never-Consider evidence may exclude. Use fresh canonical FLEX and compensation values; never copy remembered modifiers.',
      'Email: use at most five messages per independently completable checkpoint (or fewer when the approved scope/tool budget requires). Submit valid candidates batch by batch; do not wait for an entire window. Preserve unexamined messages and undisposed links; watermark cannot advance past unfinished work.',
      'Writes use the authorized Writer transport with stable idempotency IDs. Acknowledgement, HTTP success, a finished run, zero receipt pending or a stored schedule proposal is not completion. Require COMPLETE receipt plus independent exact-row master readback; reconcile POSTCOMMIT_UNKNOWN before retry. Preserve APPLIED/REJECTED_BY_EMPLOYER and later Tim decisions. ENRICH adds evidence without changing the bucket.',
      'Use bounded typed transient retries. Policy/input/permission refusals stop; unknown postcommit effects reconcile rather than replay. Missing authorized transport is WRITER_TRANSPORT_BLOCKED. Missing durable checkpoint/readback is UNSYNCED.',
      'Persist preflight, source/page/body/link denominators, candidate dispositions, request/receipt/readback IDs, unfinished obligations, owner and next action through Writer supporting Operations records. Separate NOT_ATTEMPTED, BLOCKED, UNKNOWN, queued, submitted and independently verified outcomes. No findings may be reported only for actually examined scope.',
      'A run can finish while its task remains PARTIAL. VERIFIED_COMPLETE requires full declared source coverage, every discovered candidate independently disposed, no carry-forward and any required same-day artifact freshly read back. Native adoption and successful run acceptance are separate evidence.'
    ].join('\n');
  }
  function preflight(input){
    var t=task(input.taskKey),now=Date.parse(input.at),issues=[],a=input.authorities||{},native=input.native,scope=input.scope;
    if(t.active===false)return {taskKey:t.key,provider:t.provider,owner:t.owner,attemptId:input.attemptId||'',at:input.at,state:'DEFERRED',allowed:false,issues:[],nativeAdoption:'DEFERRED',reason:'Provider is out of use by owner instruction'};
    function issue(code,expected,actual,source){issues.push({code:code,expected:expected,actual:actual==null?'UNKNOWN':actual,source:source||''});}
    if(!input.attemptId)issue('UNSYNCED','Unique durable attempt ID',input.attemptId,'runtime');
    ['common','rules','writer','reason'].forEach(function(k){var d=a[k],age=d&&now-Date.parse(d.fetchedAt);
      if(!d||d.ok!==true||!d.fingerprint||!Number.isFinite(age)||age<0||age>900000)issue('BLOCKED_AUTHORITY','Fresh readable '+k+' authority with content fingerprint',d&&d.error,k);
    });
    if(a.common&&a.common.active!==true)issue('PAUSED_CONFLICT','ACTIVE common operational standard',a.common.active,'common');
    if(a.common&&a.common.id!==IDS.common)issue('PAUSED_CONFLICT',IDS.common,a.common.id,'common');
    if(a.rules&&(a.rules.id!==IDS.rules||a.rules.active!==true))issue('PAUSED_CONFLICT','ACTIVE canonical Rules '+IDS.rules,a.rules.id+' / active='+a.rules.active,'rules');
    if(a.writer&&a.writer.masterId!==IDS.master)issue('PAUSED_CONFLICT',IDS.master,a.writer.masterId,'writer');
    if(!scopeCheck(t,scope))issue('BLOCKED_SCOPE','Approved explicit sources, window policy and assignment evidence',scope,'scope');
    if(scope&&scope.expiresAt&&Date.parse(scope.expiresAt)<=now)issue('PAUSED_CONFLICT','Unexpired assigned coverage',scope.expiresAt,'scope');
    if(!native||native.provider!==t.provider||!native.taskId||!native.prompt||!native.evidenceRef||!Number.isFinite(Date.parse(native.readbackAt))||now-Date.parse(native.readbackAt)>300000||Date.parse(native.readbackAt)>now)issue('NATIVE_ADOPTION_UNVERIFIED','Fresh native prompt and schedule readback',native&&native.error,'native');
    else{
      var binding=t.nativeId||input.nativeTaskId;
      if(!binding)issue('BLOCKED_SCOPE','Independently enrolled native task ID',binding,'native');
      else if(native.taskId!==binding)issue('PAUSED_CONFLICT',binding,native.taskId,'native');
      if(scopeCheck(t,scope)){var desired=prompt(t,scope);if(native.prompt!==desired)issue('PAUSED_CONFLICT',desired,native.prompt,'native-prompt');}
      if(native.enabled!==true)issue('PAUSED_CONFLICT','Task remains enabled only if already authorized',native.enabled,'native');
      if(!native.schedule||!input.approvedSchedule)issue('BLOCKED_SCOPE','Original native schedule independently captured',native.schedule,'native-schedule');
      else if(stable(native.schedule)!==stable(input.approvedSchedule))issue('PAUSED_CONFLICT',input.approvedSchedule,native.schedule,'native-schedule');
    }
    if(a.reason&&a.reason.owner!==t.owner)issue('PAUSED_CONFLICT',t.owner,a.reason.owner,'AI_REASON');
    var c=input.capabilities||{};
    if(c.coverageReadback!==true)issue('BLOCKED_CAPABILITY','Independent persisted source coverage and candidate ledger readback',c.coverageReadback,'runtime');
    if(c.checkpoint!==true)issue('UNSYNCED','Durable checkpoint and readback capability',c.checkpoint,'runtime');
    if(t.actions.length&&c.writerTransport!==true)issue('WRITER_TRANSPORT_BLOCKED','Authorized Writer transport and result/master readback',c.writerTransport,'runtime');
    if(t.lane==='freeze'&&c.artifactReadback!==true)issue('BLOCKED_CAPABILITY','Same-day artifact creation and independent readback',c.artifactReadback,'runtime');
    var priority=['BLOCKED_AUTHORITY','PAUSED_CONFLICT','BLOCKED_SCOPE','NATIVE_ADOPTION_UNVERIFIED','WRITER_TRANSPORT_BLOCKED','UNSYNCED','BLOCKED_CAPABILITY'];
    return {taskKey:t.key,provider:t.provider,owner:t.owner,attemptId:input.attemptId||'',at:input.at,state:issues.length?priority.find(function(s){return issues.some(function(i){return i.code===s})}):'PREFLIGHT_PASS',allowed:!issues.length,issues:issues,authorityFingerprints:Object.keys(a).reduce(function(o,k){o[k]=a[k]&&a[k].fingerprint;return o},{}),nativeEvidence:native&&native.evidenceRef||'',nativeAdoption:'REPORTED_ONLY'};
  }
  function assertRequest(result,body){
    if(!result||!result.allowed)throw new Error('AUTOMATION_PREFLIGHT_REQUIRED');
    var t=task(result.taskKey);if(!t.active)throw new Error('AUTOMATION_PROVIDER_DEFERRED');if(t.actions.indexOf(body.action)<0)throw new Error('AUTOMATION_LANE_ACTION_CONFLICT');
    if(body.action==='ruling'&&(!body.ruling||['ENRICH','IDENTITY','DUPLICATE','NOTE'].indexOf(body.ruling.kind)<0))throw new Error('AUTOMATION_DECISION_REQUIRES_TIM');
    var actor=body.actor||(body.ruling&&body.ruling.actor)||(body.event&&body.event.actor);
    if(actor&&String(actor).toUpperCase()!==t.owner)throw new Error('AUTOMATION_OWNER_CONFLICT');
  }
  function completion(report){
    if(!report||report.scopeKnown!==true||!report.coverageEvidenceRef)return {state:'UNKNOWN',reason:'Declared scope denominator is not known'};
    var fields=['plannedUnits','examinedUnits','foundCandidates','disposedCandidates','pendingWrites','carryForward'];
    if(fields.some(function(k){return !Number.isInteger(report[k])||report[k]<0}))return {state:'PARTIAL',reason:'Required coverage/accounting counts are missing'};
    if(report.examinedUnits!==report.plannedUnits||report.disposedCandidates!==report.foundCandidates||report.pendingWrites||report.carryForward||report.independentDispositions!==true||report.sourcePaginationComplete!==true||report.requiredArtifactVerified===false)return {state:'PARTIAL',reason:'Source coverage, candidate disposition, verification or artifact remains unfinished'};
    return {state:'VERIFIED_COMPLETE',reason:'Declared source scope and independently evidenced dispositions are complete'};
  }
  function discoveryInstructions(policy){
    return 'Search current public sources and fill only missing structured fields on this exact canonical row. Preserve exact INITIATING_URL and add COMPANY_SOURCE_URL without replacing provenance. First-party ATS is not required. Read the current ACTIVE canonical Rules before work; unresearched requirements remain UNKNOWN. Current reviewed FLEX modifiers: HIGH_FLEX '+signed(policy.HIGH_FLEX_MODIFIER)+', SOFT_FLEX '+signed(policy.SOFT_FLEX_MODIFIER)+', NO_FLEX '+signed(policy.NO_FLEX_MODIFIER)+', STRICT '+signed(policy.STRICT_MODIFIER)+'. Canonical requirements/evidence and Writer-derived scoring control; do not apply the modifier twice. Record exact degree wording, source dates, explicit salary estimates and unadjusted SCOPE_FIT_RAW. Preserve identity, protected states and later Tim decisions. Submit only through Writer; COMPLETE receipt and independent master readback are required. Keep unresolved research visible.';
  }
  function signed(n){if(!Number.isFinite(+n))throw new Error('ACTIVE_FLEX_POLICY_REQUIRED');return +n>0?'+'+(+n):String(+n);}
  return {stable:stable,VERSION:VERSION,IDS:IDS,TASKS:TASKS,task:task,prompt:prompt,preflight:preflight,assertRequest:assertRequest,completion:completion,discoveryInstructions:discoveryInstructions,scopeCheck:scopeCheck};
});
