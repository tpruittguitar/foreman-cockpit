const test=require('node:test');const assert=require('node:assert/strict');const T=require('../pipeline-target-companies.js');
test('manual priority vocabulary and cadence are stable',()=>{assert.deepEqual(T.PRIORITIES,['P1','P2','P3','WATCH','PAUSED']);assert.equal(T.cadence('P1'),'Every Scout run');assert.equal(T.cadence('PAUSED'),'No targeted search')});
test('rules round trip preserves manual priorities',()=>{const r={companies:[{id:'TC-1',company:'Shield AI',priority:'P1',priority_source:'TIM_MANUAL',careers_url:'https://shield.ai/careers'}]};const text=T.setRules('STATUS=ACTIVE\nSECTION=CORE\n- x\nEND TIM_PIPELINE_RULES_CANONICAL',r);const back=T.parseRules(text);assert.equal(back.companies[0].company,'Shield AI');assert.equal(back.companies[0].priority,'P1');assert.equal(back.companies[0].priority_source,'TIM_MANUAL')});
test('setRules replaces only target section',()=>{let a='STATUS=ACTIVE\nSECTION=CORE\n- keep\nEND TIM_PIPELINE_RULES_CANONICAL';a=T.setRules(a,{companies:[{company:'A',priority:'P2'}]});const b=T.setRules(a,{companies:[{company:'B',priority:'P3'}]});assert.match(b,/SECTION=CORE\n- keep/);assert.doesNotMatch(b,/"company":"A"/);assert.match(b,/"company":"B"/)});
test('paused priority forces paused status',()=>{const r=T.normalizeRegistry({companies:[{company:'X',priority:'PAUSED',status:'ACTIVE'}]});assert.equal(r.companies[0].status,'PAUSED')});

const RULES='TIM_PIPELINE_RULES_CANONICAL\nSTATUS=ACTIVE\nSECTION=DEGREE_FLEX\nFLEX_POLICY_VERSION=1\n- flex prose\nSECTION=DECLINE_RULES\n- Allowed reason codes: PAY_BELOW_FLOOR.\nEND TIM_PIPELINE_RULES_CANONICAL';
const full={id:'TC-007',company:'Shield AI',aliases:['Shield AI Inc','ShieldAI'],priority:'P1',status:'ACTIVE',priority_source:'TIM_MANUAL',careers_url:'https://shield.ai/careers',rationale:'autonomy + aircraft production',builds:'Hivemind autonomy software and V-BAT VTOL drones built in-house.',builds_source:'AUTO_SEARCH',builds_asof:'2026-10-04',source_rank:7,target_functions:['Manufacturing','Quality'],added_source:'LinkedIn Week 79',last_searched_at:'',last_useful_hit_at:'',jobs_found:3,qualified_hits:1,notes:'Line 1\nline 2 with "quotes"'};

test('every manual field survives normalize -> rules section -> parse, for all five priorities',()=>{
  for(const p of T.PRIORITIES){
    const back=T.parseRules(T.setRules(RULES,{companies:[{...full,priority:p}]})).companies[0];
    assert.equal(back.priority,p);assert.equal(back.status,p==='PAUSED'?'PAUSED':'ACTIVE');assert.equal(back.priority_source,'TIM_MANUAL');
    assert.deepEqual(back.aliases,full.aliases);assert.equal(back.careers_url,full.careers_url);assert.equal(back.notes,full.notes);
    assert.equal(back.builds,full.builds);assert.equal(back.builds_source,'AUTO_SEARCH');assert.equal(back.builds_asof,'2026-10-04');assert.equal(back.rationale,full.rationale);
  }
});

test('saving the registry leaves every other rules section byte-identical and is idempotent',()=>{
  const once=T.setRules(RULES,{companies:[full]}),twice=T.setRules(once,T.parseRules(once));
  assert.equal(twice,once);
  const strip=t=>t.replace(/\nSECTION=TARGET_COMPANIES[\s\S]*?(?=\nEND TIM_PIPELINE_RULES_CANONICAL)/,'');
  assert.equal(strip(once),RULES);
});

test('normalization: duplicate names collapse case-insensitively, invalid priority falls back to WATCH, nameless rows dropped',()=>{
  const r=T.normalizeRegistry({companies:[{company:'Hadrian',priority:'p1'},{company:'HADRIAN',priority:'P3'},{company:'X',priority:'URGENT'},{company:'  ',priority:'P1'}]});
  assert.deepEqual(r.companies.map(c=>c.company+':'+c.priority),['Hadrian:P1','X:WATCH']);
});

test('edit provenance: only a priority change marks priority TIM_MANUAL; only a builds change marks builds TIM_MANUAL',()=>{
  const seed={...full,priority_source:'SEED_RECOMMENDATION'};
  const form=c=>({company:c.company,priority:c.priority,aliases:c.aliases.join(', '),careers_url:c.careers_url,builds:c.builds,rationale:c.rationale,notes:c.notes});
  const notesOnly=T.applyEdit({...seed},{...form(seed),notes:'new note'},false);
  assert.equal(notesOnly.priority_source,'SEED_RECOMMENDATION');assert.equal(notesOnly.builds_source,'AUTO_SEARCH');assert.equal(notesOnly.notes,'new note');
  const pri=T.applyEdit({...seed},{...form(seed),priority:'P2'},false);assert.equal(pri.priority_source,'TIM_MANUAL');assert.equal(pri.priority,'P2');
  const b=T.applyEdit({...seed},{...form(seed),builds:'Corrected by Tim'},false);assert.equal(b.builds_source,'TIM_MANUAL');assert.match(b.builds_asof,/^\d{4}-\d{2}-\d{2}$/);assert.equal(b.priority_source,'SEED_RECOMMENDATION');
  const added=T.applyEdit({},{company:'New Co',priority:'P3',aliases:'NC',careers_url:'https://x',builds:'',rationale:'r',notes:''},true);assert.equal(added.priority_source,'TIM_MANUAL');assert.equal(added.builds_source,'');
  const paused=T.applyEdit({...seed},{...form(seed),priority:'PAUSED'},false);assert.equal(paused.status,'PAUSED');
});

test('notes column shows what they build with provenance, why here, notes and aliases, escaped',()=>{
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const h=T.notesHtml({...full,builds:'<b>drones</b>'},esc);
  assert.match(h,/&lt;b>drones/);assert.match(h,/auto-search · verify 2026-10-04/);assert.match(h,/Why here: autonomy/);assert.match(h,/Notes: Line 1/);assert.match(h,/Aliases: Shield AI Inc, ShieldAI/);
  assert.match(T.notesHtml({...full,builds_source:'TIM_MANUAL'},esc),/\[Tim 2026-10-04\]/);
  assert.match(T.notesHtml({company:'X'},esc),/not recorded/);
});
