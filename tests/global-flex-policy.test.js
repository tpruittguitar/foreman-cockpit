const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../pipeline-rules');
const P=require('../pipeline-policy');
const W=require('../apps-script/Code.gs');

test('FLEX policy defaults preserve current production behavior',()=>{
  const p=R.flexPolicy('SECTION=OTHER\nX=1\n');
  assert.equal(p.HIGH_FLEX_MODIFIER,15);
  assert.equal(p.SOFT_FLEX_MODIFIER,6);
  assert.equal(p.NO_FLEX_MODIFIER,-10);
  assert.equal(p.STRICT_MODIFIER,-10);
  assert.equal(p.NOT_STATED_CLASS,'HIGH_FLEX');
  assert.equal(p.EQUIVALENCY_CLASS,'SOFT_FLEX');
  assert.equal(p.HARD_DEGREE_CLASS,'NO_FLEX');
  assert.equal(p.SINGLE_PATH_CLASS,'STRICT');
  assert.equal(p.FRESH_DEGREE_OVERRIDES_STALE_CLASS,'NO');
  assert.deepEqual(P.normalizeFlexPolicy({}),Object.assign({},P.FLEX_POLICY_DEFAULTS));
  assert.deepEqual(R.FLEX_DEFAULTS,P.FLEX_POLICY_DEFAULTS);
});

test('Generated FLEX prose stays synchronized with structured policy values',()=>{
  const src='TIM_PIPELINE_RULES_CANONICAL\nSECTION=DEGREE_FLEX\n- HIGH_FLEX: old hard-coded prose. Modifier +15.\n- SOFT_FLEX: old prose. Modifier +6.\nSECTION=TITLE_SCOPE_FIT\nX=1\n';
  const out=R.setFlexPolicy(src,{HIGH_FLEX_MODIFIER:12,SOFT_FLEX_MODIFIER:4,NO_FLEX_MODIFIER:-8,STRICT_MODIFIER:-20,NOT_STATED_CLASS:'SOFT_FLEX',EQUIVALENCY_CLASS:'HIGH_FLEX',HARD_DEGREE_CLASS:'STRICT',SINGLE_PATH_CLASS:'NO_FLEX',FRESH_DEGREE_OVERRIDES_STALE_CLASS:'YES'});
  assert.match(out,/FLEX_POLICY_PROSE_BEGIN/);
  assert.match(out,/Degree not stated => SOFT_FLEX/);
  assert.match(out,/Equivalent experience => HIGH_FLEX/);
  assert.match(out,/Hard degree requirement without equivalency => STRICT/);
  assert.match(out,/Confirmed single required degree path => NO_FLEX/);
  assert.match(out,/HIGH_FLEX \+12, SOFT_FLEX \+4, NO_FLEX -8, STRICT -20/);
  assert.match(out,/Fresh degree evidence overrides stale FLEX = YES/);
  assert.doesNotMatch(out,/old hard-coded prose|old prose/);
  assert.equal((out.match(/FLEX_POLICY_PROSE_BEGIN/g)||[]).length,1);
  assert.equal(R.setFlexPolicy(out,R.flexPolicy(out)),out,'generated prose is stable on repeat save');
});

test('FLEX-only save transformation can use canonical text without committing unrelated raw-draft edits',()=>{
  const canonical='TIM_PIPELINE_RULES_CANONICAL\nSECTION=DEGREE_FLEX\n- canonical prose\nSECTION=OTHER\nCANONICAL_ONLY=YES\n';
  const draft=canonical.replace('CANONICAL_ONLY=YES','CANONICAL_ONLY=YES\nUNSAVED_RAW_EDIT=DO_NOT_COMMIT');
  const policy={HIGH_FLEX_MODIFIER:13};
  const submitted=R.setFlexPolicy(canonical,policy);
  const retainedLocalDraft=R.setFlexPolicy(draft,policy);
  assert.doesNotMatch(submitted,/UNSAVED_RAW_EDIT/);
  assert.match(retainedLocalDraft,/UNSAVED_RAW_EDIT=DO_NOT_COMMIT/);
  assert.equal(R.flexPolicy(submitted).HIGH_FLEX_MODIFIER,13);
  assert.equal(R.flexPolicy(retainedLocalDraft).HIGH_FLEX_MODIFIER,13);
});

test('Rules editor round-trips structured FLEX policy in canonical DEGREE_FLEX section',()=>{
  const src='TIM_PIPELINE_RULES_CANONICAL\nSECTION=DEGREE_FLEX\n- prose stays here\nSECTION=TITLE_SCOPE_FIT\nX=1\n';
  const out=R.setFlexPolicy(src,{HIGH_FLEX_MODIFIER:12,SOFT_FLEX_MODIFIER:4,NO_FLEX_MODIFIER:-8,STRICT_MODIFIER:-20,NOT_STATED_CLASS:'SOFT_FLEX',EQUIVALENCY_CLASS:'HIGH_FLEX',HARD_DEGREE_CLASS:'STRICT',SINGLE_PATH_CLASS:'STRICT',FRESH_DEGREE_OVERRIDES_STALE_CLASS:'NO'});
  const p=R.flexPolicy(out);
  assert.equal(p.HIGH_FLEX_MODIFIER,12);
  assert.equal(p.SOFT_FLEX_MODIFIER,4);
  assert.equal(p.NO_FLEX_MODIFIER,-8);
  assert.equal(p.STRICT_MODIFIER,-20);
  assert.equal(p.NOT_STATED_CLASS,'SOFT_FLEX');
  assert.equal(p.EQUIVALENCY_CLASS,'HIGH_FLEX');
  assert.equal(p.HARD_DEGREE_CLASS,'STRICT');
  assert.equal(p.FRESH_DEGREE_OVERRIDES_STALE_CLASS,'NO');
  assert.match(out,/- prose stays here/);
  assert.equal((out.match(/HIGH_FLEX_MODIFIER=/g)||[]).length,1);
});

test('PipelinePolicy consumes canonical FLEX class mappings and modifiers',()=>{
  const cfg={HIGH_FLEX_MODIFIER:11,SOFT_FLEX_MODIFIER:3,NO_FLEX_MODIFIER:-7,STRICT_MODIFIER:-25,NOT_STATED_CLASS:'SOFT_FLEX',EQUIVALENCY_CLASS:'HIGH_FLEX',HARD_DEGREE_CLASS:'STRICT',SINGLE_PATH_CLASS:'STRICT'};
  let f=P.flex({DEGREE_TEXT:'Degree not stated'},cfg);
  assert.equal(f.class,'SOFT_FLEX');assert.equal(f.modifier,3);
  f=P.flex({DEGREE_TEXT:"Bachelor's degree or equivalent experience"},cfg);
  assert.equal(f.class,'HIGH_FLEX');assert.equal(f.modifier,11);
  f=P.flex({REQUIREMENTS_REVIEWED:'YES',DEGREE_TEXT:"Bachelor's degree required"},cfg);
  assert.equal(f.class,'STRICT');assert.equal(f.modifier,-25);assert.equal(f.blocked,true);
});

test('Writer mutation uses supplied canonical FLEX policy',()=>{
  const row='1 | TEST-1 | Test Co | Director | MANUAL_RESEARCH | OPEN | - | REQ1 | TN | TEST';
  const cfg={HIGH_FLEX_MODIFIER:9,SOFT_FLEX_MODIFIER:2,NO_FLEX_MODIFIER:-5,STRICT_MODIFIER:-30,NOT_STATED_CLASS:'HIGH_FLEX',EQUIVALENCY_CLASS:'SOFT_FLEX',HARD_DEGREE_CLASS:'STRICT',SINGLE_PATH_CLASS:'STRICT'};
  const r=W.mutateRow(row,{kind:'ENRICH',actor:'CLAUDE',requestId:'T1',fields:{DEGREE_TEXT:"Bachelor's degree required",REQUIREMENTS_REVIEWED:'YES'}},cfg);
  assert.equal(r.ok,true,r.error);
  const payload=W.parsePayload(r.after.split(' | ').slice(9).join(' | ')).payload;
  assert.equal(payload.FLEX_CLASS,'STRICT');
  assert.equal(payload.FLEX_MODIFIER,'-30');
});

test('Unrelated ENRICH still does not create FLEX fields under custom policy',()=>{
  const row='1 | TEST-2 | Test Co | Director | MANUAL_RESEARCH | OPEN | - | REQ2 | TN | TEST';
  const cfg={HIGH_FLEX_MODIFIER:99,NOT_STATED_CLASS:'STRICT'};
  const r=W.mutateRow(row,{kind:'ENRICH',actor:'CLAUDE',requestId:'T2',fields:{SALARY_BASE_EST:'$200000-$240000'}},cfg);
  const payload=W.parsePayload(r.after.split(' | ').slice(9).join(' | ')).payload;
  assert.equal('FLEX_CLASS' in payload,false);
  assert.equal('FLEX_MODIFIER' in payload,false);
});

test('Writer obeys app-managed fresh degree precedence switch',()=>{
  const row='1 | TEST-3 | Test Co | Director | MANUAL_RESEARCH | OPEN | - | REQ3 | TN | TEST; FLEX=SOFT; FLEX_CLASS=SOFT_FLEX; FLEX_MODIFIER=6';
  const base={HIGH_FLEX_MODIFIER:15,SOFT_FLEX_MODIFIER:6,NO_FLEX_MODIFIER:-10,STRICT_MODIFIER:-10,NOT_STATED_CLASS:'HIGH_FLEX',EQUIVALENCY_CLASS:'SOFT_FLEX',HARD_DEGREE_CLASS:'NO_FLEX',SINGLE_PATH_CLASS:'STRICT'};
  const yes=Object.assign({},base,{FRESH_DEGREE_OVERRIDES_STALE_CLASS:'YES'});
  const no=Object.assign({},base,{FRESH_DEGREE_OVERRIDES_STALE_CLASS:'NO'});
  const fields={DEGREE_TEXT:"Bachelor's degree required",REQUIREMENTS_REVIEWED:'YES'};
  const ry=W.mutateRow(row,{kind:'ENRICH',actor:'CLAUDE',requestId:'T3Y',fields},yes);
  const py=W.parsePayload(ry.after.split(' | ').slice(9).join(' | ')).payload;
  assert.equal(py.FLEX_CLASS,'NO_FLEX');
  assert.equal(py.FLEX_MODIFIER,'-10');
  const rn=W.mutateRow(row,{kind:'ENRICH',actor:'CLAUDE',requestId:'T3N',fields},no);
  const pn=W.parsePayload(rn.after.split(' | ').slice(9).join(' | ')).payload;
  assert.equal(pn.FLEX_CLASS,'SOFT_FLEX');
  assert.equal(pn.FLEX_MODIFIER,'6');
});

test('Explicit FLEX in same write still wins over fresh degree precedence',()=>{
  const row='1 | TEST-4 | Test Co | Director | MANUAL_RESEARCH | OPEN | - | REQ4 | TN | TEST; FLEX_CLASS=NO_FLEX; FLEX_MODIFIER=-10';
  const cfg={FRESH_DEGREE_OVERRIDES_STALE_CLASS:'YES'};
  const r=W.mutateRow(row,{kind:'ENRICH',actor:'CLAUDE',requestId:'T4',fields:{FLEX:'SOFT',DEGREE_TEXT:"Bachelor's degree required",REQUIREMENTS_REVIEWED:'YES'}},cfg);
  const p=W.parsePayload(r.after.split(' | ').slice(9).join(' | ')).payload;
  assert.equal(p.FLEX_CLASS,'SOFT_FLEX');
  assert.equal(p.FLEX_MODIFIER,'6');
});

const pl=line=>W.parsePayload(line.split(' | ').slice(9).join(' | ')).payload;

test('Absent policy keys reproduce production: conclusive fresh degree evidence keeps the stale class unless Tim turns precedence on',()=>{
  const row='1 | TEST-5 | Test Co | Director | MANUAL_RESEARCH | OPEN | - | REQ5 | TN | TEST; FLEX_CLASS=SOFT_FLEX; FLEX_MODIFIER=6';
  const fields={DEGREE_TEXT:"Bachelor's degree required",REQUIREMENTS_REVIEWED:'YES'};
  const def=pl(W.mutateRow(row,{kind:'ENRICH',actor:'CLAUDE',requestId:'T5',fields},R.flexPolicy('SECTION=DEGREE_FLEX\n- prose only\n')).after);
  assert.equal(def.FLEX_CLASS,'SOFT_FLEX');assert.equal(def.FLEX_MODIFIER,'6');
  const on=pl(W.mutateRow(row,{kind:'ENRICH',actor:'CLAUDE',requestId:'T5Y',fields},{FRESH_DEGREE_OVERRIDES_STALE_CLASS:'YES'}).after);
  assert.equal(on.FLEX_CLASS,'NO_FLEX');assert.equal(on.FLEX_MODIFIER,'-10');
});

test('Fresh degree precedence never wipes a known class or STRICT hold with inconclusive evidence',()=>{
  const yes={FRESH_DEGREE_OVERRIDES_STALE_CLASS:'YES'};
  const strict='1 | TEST-6 | Test Co | Director | MANUAL_RESEARCH | OPEN | - | REQ6 | TN | TEST; FLEX_CLASS=STRICT; FLEX_MODIFIER=-10';
  const s=pl(W.mutateRow(strict,{kind:'ENRICH',actor:'CLAUDE',requestId:'T6',fields:{DEGREE_TEXT:'See posting'}},yes).after);
  assert.equal(s.FLEX_CLASS,'STRICT');assert.equal(s.FLEX_MODIFIER,'-10');
  const tim='1 | TEST-7 | Test Co | Director | MANUAL_RESEARCH | OPEN | - | REQ7 | TN | TEST; FLEX=NO; FLEX_CLASS=NO_FLEX; FLEX_MODIFIER=-10';
  const n=pl(W.mutateRow(tim,{kind:'ENRICH',actor:'CLAUDE',requestId:'T7',fields:{DEGREE_TEXT:'Bachelor degree in engineering'}},yes).after);
  assert.equal(n.FLEX_CLASS,'NO_FLEX');assert.equal(n.FLEX_MODIFIER,'-10');assert.equal(n.FLEX,'NO');
});

test('STRICT pursue gate uses the transaction FLEX policy',()=>{
  const row='1 | TEST-8 | Test Co | Director | MANUAL_RESEARCH | OPEN | - | REQ8 | TN | TEST; REQUIREMENTS_REVIEWED=YES; DEGREE_SINGLE_PATH_CONFIRMED=YES; DEGREE_TEXT=Bachelor degree required';
  assert.equal(W.mutateRow(row,{kind:'APPLY_NOW',value:'YES',actor:'CLAUDE',requestId:'T8'},{}).ok,false);
  assert.equal(W.mutateRow(row,{kind:'APPLY_NOW',value:'YES',actor:'CLAUDE',requestId:'T8B'},{SINGLE_PATH_CLASS:'NO_FLEX'}).ok,true);
});

test('Load approved FLEX/URL update keeps saved structured FLEX keys',()=>{
  const src=R.setFlexPolicy('TIM_PIPELINE_RULES_CANONICAL\nSECTION=DEGREE_FLEX\n- old prose\nSECTION=TITLE_SCOPE_FIT\nX=1',{HIGH_FLEX_MODIFIER:12,FRESH_DEGREE_OVERRIDES_STALE_CLASS:'YES'});
  const replaced=src.replace(/SECTION=DEGREE_FLEX[\s\S]*?(?=SECTION=TITLE_SCOPE_FIT)/,'SECTION=DEGREE_FLEX\n- new prose\n');
  const out=R.setFlexPolicy(replaced,R.flexPolicy(src));
  assert.equal(R.flexPolicy(out).HIGH_FLEX_MODIFIER,12);assert.equal(R.flexPolicy(out).FRESH_DEGREE_OVERRIDES_STALE_CLASS,'YES');
  assert.match(out,/- new prose/);assert.doesNotMatch(out,/- old prose/);
  assert.equal(R.setFlexPolicy(out,R.flexPolicy(out)),out,'saving the same policy twice is stable');
});

// ---- Writer end-to-end: policy comes from the canonical Rules document, read once per transaction ----
const MASTER='19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI', RULES='1uuIopBY2Et-leu_tOdxnWAJJLniKwk08rdLCypuM2BE';
function services(rowCount,rulesText){
  const para=t=>{let s=t;return {getText:()=>s,setText:v=>{s=v}}};
  const rows=[];for(let i=1;i<=rowCount;i++)rows.push(i+' | V2F-ROW'+String(i).padStart(8,'0')+' | Acme '+i+' | Director | SCOUT_INTAKE | ANALYSIS_PENDING | - | REQ-'+i+' | Austin, TX | SOURCE_URL=https://example.com/'+i);
  const master=['COUNTS: TOTAL='+rowCount+' SCOUT_INTAKE='+rowCount+' UNACCOUNTED=0',...rows,'END V2_CURRENT_POPULATION_MASTER ('+rowCount+' rows)'].map(para);
  const receipts=[];let events='',opens={};
  const doc=(body)=>({getBody:()=>body,saveAndClose(){}});
  const files={PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS:{getId:()=>'RECEIPTS'},'PIPELINE_EVENT_LOG.jsonl':{getId:()=>'EVENTS',getBlob:()=>({getDataAsString:()=>events}),setContent:v=>{events=v}}};
  const iter=l=>{let i=0;return {hasNext:()=>i<l.length,next:()=>l[i++]}};
  const folder={getFilesByName:n=>iter(files[n]?[files[n]]:[]),createFile:n=>{throw new Error('unexpected createFile '+n)}};
  global.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
  global.DriveApp={getFileById:id=>({getLastUpdated:()=>new Date('2026-10-04T20:00:00Z'),getParents:()=>iter([folder]),getId:()=>id})};
  global.DocumentApp={openById:id=>{opens[id]=(opens[id]||0)+1;
    if(id===MASTER)return doc({getParagraphs:()=>master});
    if(id===RULES){if(rulesText===null)throw new Error('simulated canonical rules outage');return doc({getText:()=>rulesText});}
    return doc({getText:()=>receipts.join('\n'),appendParagraph:t=>receipts.push(t)});}};
  global.MimeType={PLAIN_TEXT:'text/plain'};
  return {opens,receipts:()=>receipts.join('\n'),row:id=>master.map(p=>p.getText()).find(l=>l.split(' | ')[1]===id)};
}
const rules='TIM_PIPELINE_RULES_CANONICAL\nSTATUS=ACTIVE\nSECTION=DEGREE_FLEX\nFLEX_POLICY_VERSION=1\nNO_FLEX_MODIFIER=-4\nHARD_DEGREE_CLASS=NO_FLEX\n- prose\nSECTION=TITLE_SCOPE_FIT\nX=1';
const degree=(i,rid)=>({action:'ruling',ruling:{primaryId:'V2F-ROW'+String(i).padStart(8,'0'),kind:'ENRICH',actor:'CLAUDE',requestId:rid+i,fields:{DEGREE_TEXT:"Bachelor's degree required",REQUIREMENTS_REVIEWED:'YES'}}});

test('A 30-row all-ruling batch reads the canonical Rules document once and applies its policy to every row',()=>{
  const s=services(30,rules);
  const r=W.dispatchWrite_({action:'batch',requests:Array.from({length:30},(_,i)=>degree(i+1,'BATCH-'))});
  assert.equal(r.mode,'BATCH_RULING_SINGLE_COMMIT');assert.equal(r.ok,true);assert.equal(r.processed,30);
  assert.equal(s.opens[RULES],1,'rules read once per batch');
  for(let i=1;i<=30;i++){const p=pl(s.row('V2F-ROW'+String(i).padStart(8,'0')));assert.equal(p.FLEX_CLASS,'NO_FLEX');assert.equal(p.FLEX_MODIFIER,'-4')}
});

test('A single ruling reads the canonical Rules document once',()=>{
  const s=services(2,rules);
  const r=W.dispatchWrite_(degree(1,'SINGLE-'));
  assert.equal(r.ok,true,r.error);assert.equal(s.opens[RULES],1);
  assert.equal(pl(s.row('V2F-ROW00000001')).FLEX_MODIFIER,'-4');
});

test('Writer surfaces CANONICAL_STRUCTURED policy provenance in batch result and receipts',()=>{
  const s=services(1,rules);
  const r=W.dispatchWrite_({action:'batch',requests:[degree(1,'PROV-')]});
  assert.equal(r.ok,true);
  assert.equal(r.flexPolicySource,'CANONICAL_STRUCTURED');
  assert.equal(r.flexPolicyWarning,'');
  assert.equal(r.results[0].flexPolicySource,'CANONICAL_STRUCTURED');
});

test('Writer surfaces DEFAULT_FALLBACK when canonical FLEX policy cannot be read',()=>{
  const s=services(1,null);
  const r=W.dispatchWrite_({action:'batch',requests:[degree(1,'FALLBACK-')]});
  assert.equal(r.ok,true);
  assert.equal(r.flexPolicySource,'DEFAULT_FALLBACK');
  assert.match(r.flexPolicyWarning,/Canonical FLEX policy read failed/);
  assert.equal(r.results[0].flexPolicySource,'DEFAULT_FALLBACK');
  const p=pl(s.row('V2F-ROW00000001'));
  assert.equal(p.FLEX_CLASS,'NO_FLEX');
  assert.equal(p.FLEX_MODIFIER,'-10','production default still applies during explicit fallback');
});

test('Writer surfaces CANONICAL_DEFAULTS when canonical rules are readable but structured FLEX keys are absent',()=>{
  const readable='TIM_PIPELINE_RULES_CANONICAL\nSECTION=DEGREE_FLEX\n- prose only\nSECTION=OTHER\nX=1';
  const s=services(1,readable);
  const r=W.dispatchWrite_({action:'batch',requests:[degree(1,'DEFAULTS-')]});
  assert.equal(r.ok,true);
  assert.equal(r.flexPolicySource,'CANONICAL_DEFAULTS');
  assert.match(r.flexPolicyWarning,/No structured FLEX policy keys found/);
});

// ---- PR #33 hardening: prose sync against the live-shaped section, and provenance on every write path ----
const LIVE_FLEX='TIM_PIPELINE_RULES_CANONICAL\nSECTION=DEGREE_FLEX\n'+
'- HIGH_FLEX: reviewed requirements mention no degree, or explicitly accept a non-degree experience route. Modifier +15. Blank unresearched requirements remain UNKNOWN.\n'+
'- SOFT_FLEX: degree listed and the same requirements block offers multiple degree-or-experience paths. Modifier +6.\n'+
'- NO_FLEX: degree required without recorded equivalency. Modifier -10. Still pursue if adjusted fit is 80+ and pay/title rules clear.\n'+
'- STRICT: explicit strict classification or confirmed single required degree path without equivalency. Modifier -10 for reporting; do not pursue unless Tim overrides. Do not automatically convert NO_FLEX to STRICT.\n'+
'- Adjusted fit = clamp(raw scope fit + FLEX modifier, 0, 100). Report class, modifier, raw fit, adjusted fit, exact degree wording, and evidence. Apply pay and title rules afterward. Store unadjusted fit in SCOPE_FIT_RAW; do not apply the modifier twice.\n'+
'- Compatibility: YES=HIGH_FLEX, SOFT=SOFT_FLEX, NO=NO_FLEX, STRICT_NO=STRICT. FLEX concerns degree eligibility, not remote/hybrid work.\n'+
'- Protected application and rejection states remain authoritative.\nSECTION=TITLE_SCOPE_FIT\nX=1\n';
const NONDEFAULT={HIGH_FLEX_MODIFIER:12,SOFT_FLEX_MODIFIER:4,NO_FLEX_MODIFIER:-8,STRICT_MODIFIER:-20,NOT_STATED_CLASS:'SOFT_FLEX',EQUIVALENCY_CLASS:'HIGH_FLEX',HARD_DEGREE_CLASS:'STRICT',SINGLE_PATH_CLASS:'NO_FLEX',FRESH_DEGREE_OVERRIDES_STALE_CLASS:'YES'};

test('Live-shaped DEGREE_FLEX: keys and generated prose agree, governing rules survive, old modifier prose is gone, repeat saves are byte-stable',()=>{
  const out=R.setFlexPolicy(LIVE_FLEX,NONDEFAULT);
  assert.deepEqual(R.flexPolicy(out),NONDEFAULT,'structured keys carry the saved policy');
  const sec=out.match(/SECTION=DEGREE_FLEX\n([\s\S]*?)(?=\nSECTION=)/)[1];
  for(const k of Object.keys(NONDEFAULT))assert.match(sec,new RegExp('^'+k+'='+NONDEFAULT[k]+'$','m'));
  assert.match(sec,/Degree not stated => SOFT_FLEX\./);
  assert.match(sec,/Equivalent experience => HIGH_FLEX\./);
  assert.match(sec,/Hard degree requirement without equivalency => STRICT\./);
  assert.match(sec,/Confirmed single required degree path => NO_FLEX\./);
  assert.match(sec,/FLEX modifiers: HIGH_FLEX \+12, SOFT_FLEX \+4, NO_FLEX -8, STRICT -20\./);
  assert.match(sec,/Fresh degree evidence overrides stale FLEX = YES\./);
  assert.doesNotMatch(sec,/Modifier [+-]\d+/,'no hard-coded modifier prose remains');
  assert.doesNotMatch(sec,/[+-]15|[+-]6\b|-10/,'no stale default numbers remain in the section');
  for(const keep of ['Adjusted fit = clamp(raw scope fit + FLEX modifier, 0, 100)','Store unadjusted fit in SCOPE_FIT_RAW; do not apply the modifier twice.',
    'Blank unresearched requirements remain UNKNOWN','still pursue if adjusted fit is 80+ and pay/title rules clear','do not pursue unless Tim overrides','Do not automatically convert NO_FLEX to STRICT',
    'Compatibility: YES=HIGH_FLEX, SOFT=SOFT_FLEX, NO=NO_FLEX, STRICT_NO=STRICT','Protected application and rejection states remain authoritative.'])
    assert.ok(sec.includes(keep),'governing rule kept: '+keep);
  assert.equal((out.match(/Adjusted fit =/g)||[]).length,1);
  assert.match(out,/\nSECTION=TITLE_SCOPE_FIT\nX=1\n$/,'other sections untouched');
  const again=R.setFlexPolicy(out,NONDEFAULT);
  assert.equal(again,out,'repeat save with no changes is idempotent');
  assert.equal(R.setFlexPolicy(again,R.flexPolicy(again)),out);
  const back=R.setFlexPolicy(out,R.FLEX_DEFAULTS);
  assert.match(back,/FLEX modifiers: HIGH_FLEX \+15, SOFT_FLEX \+6, NO_FLEX -10, STRICT -10\./);
  assert.equal((back.match(/FLEX_POLICY_PROSE_BEGIN/g)||[]).length,1);
});

test('Section-less rules get keys and generated prose together',()=>{
  const out=R.setFlexPolicy('TIM_PIPELINE_RULES_CANONICAL\nSECTION=OTHER\nX=1',NONDEFAULT);
  assert.match(out,/FLEX modifiers: HIGH_FLEX \+12/);
  assert.equal(R.setFlexPolicy(out,NONDEFAULT),out);
});

test('Batch receipts carry FLEX_POLICY_SOURCE for every row',()=>{
  const s=services(2,rules);
  const r=W.dispatchWrite_({action:'batch',requests:[degree(1,'RCPT-'),degree(2,'RCPT-')]});
  assert.equal(r.mode,'BATCH_RULING_SINGLE_COMMIT');assert.equal(s.opens[RULES],1);
  assert.equal((s.receipts().match(/FLEX_POLICY_SOURCE=CANONICAL_STRUCTURED/g)||[]).length,2);
  assert.equal(Object.keys(W.completedReceiptRequestIds_(s.receipts())).sort().join(),'RCPT-1,RCPT-2','receipts still parse as COMPLETE');
});

test('Single ruling result and receipt carry provenance; fallback warning reaches the receipt',()=>{
  let s=services(1,rules);
  let r=W.dispatchWrite_(degree(1,'SP-'));
  assert.equal(r.ok,true,r.error);assert.equal(r.flexPolicySource,'CANONICAL_STRUCTURED');assert.equal(r.receipt.FLEX_POLICY_SOURCE,'CANONICAL_STRUCTURED');
  assert.match(s.receipts(),/FLEX_POLICY_SOURCE=CANONICAL_STRUCTURED/);
  s=services(1,null);
  r=W.dispatchWrite_(degree(1,'SF-'));
  assert.equal(r.ok,true,r.error);assert.equal(r.flexPolicySource,'DEFAULT_FALLBACK');assert.equal(s.opens[RULES],1);
  assert.match(s.receipts(),/FLEX_POLICY_SOURCE=DEFAULT_FALLBACK/);
  assert.match(s.receipts(),/FLEX_POLICY_WARNING=Canonical FLEX policy read failed: simulated canonical rules outage/);
  assert.equal(pl(s.row('V2F-ROW00000001')).FLEX_MODIFIER,'-10');
});

test('Upsert reads the canonical Rules document once and its receipt carries provenance',()=>{
  const s=services(1,'TIM_PIPELINE_RULES_CANONICAL\nSECTION=DEGREE_FLEX\n- prose only\nSECTION=OTHER\nX=1');
  const r=W.dispatchWrite_({action:'upsert_application',event:{TARGET_PRIMARY_ID:'V2F-ROW00000001',STATE:'APPLIED',EVENT_DATE:'2026-10-02',EVIDENCE:'Gmail 1cd "Thanks for applying"',actor:'FORGE',requestId:'UP-1'}});
  assert.equal(r.ok,true,r.error);assert.equal(r.mode,'UPDATE');
  assert.equal(s.opens[RULES],1,'rules read once per upsert');
  assert.equal(r.receipt.FLEX_POLICY_SOURCE,'CANONICAL_DEFAULTS');
  assert.match(r.receipt.FLEX_POLICY_WARNING,/No structured FLEX policy keys found/);
  assert.match(s.receipts(),/FLEX_POLICY_SOURCE=CANONICAL_DEFAULTS/);
  assert.match(pl(s.row('V2F-ROW00000001')).STATE_SOURCE,/^FORGE:UP-1$/);
});


test('Canonical decline reason codes are parsed from DECLINE_RULES without duplicating policy in the UI',()=>{
  const text='TIM_PIPELINE_RULES_CANONICAL\nSECTION=DECLINE_RULES\n- Allowed reason codes: PAY_BELOW_FLOOR, FLEX_STRICT_NO, SCOPE_BELOW_TARGET, TIM_EXPLICIT_DECLINE.\nSECTION=OTHER\nX=1';
  assert.deepEqual(R.declineReasonCodes(text),['PAY_BELOW_FLOOR','FLEX_STRICT_NO','SCOPE_BELOW_TARGET','TIM_EXPLICIT_DECLINE']);
  assert.deepEqual(R.declineReasonCodes('SECTION=DECLINE_RULES\n- no list here'),[]);
});
