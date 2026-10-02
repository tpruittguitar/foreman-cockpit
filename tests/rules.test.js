// Never-consider rules: legacy parser remains regression-tested; runtime authority is TIM_PIPELINE_RULES_CANONICAL.
const fs = require('fs'), path = require('path');
const W = require('../apps-script/Code.gs');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'TIM_NEVER_CONSIDER_RULES.sample.txt'), 'utf8');
const R = W.parseRulesText(text);
const canonicalText = fs.readFileSync(path.join(__dirname, 'fixtures', 'TIM_PIPELINE_RULES_CANONICAL.sample.txt'), 'utf8');
const CR = W.parseCanonicalNeverConsiderRules(canonicalText);
ok(W.RULES_DOC_ID === '1uuIopBY2Et-leu_tOdxnWAJJLniKwk08rdLCypuM2BE', 'runtime RULES_DOC_ID compatibility alias points at TIM_PIPELINE_RULES_CANONICAL');
ok(CR.source === 'TIM_PIPELINE_RULES_CANONICAL' && CR.status === 'ACTIVE' && CR.defaultAction === 'ALLOW_INTAKE', 'active canonical rules parse as runtime Never-Consider authority');
ok(CR.header.RULESET_VERSION === '2' && CR.header.OWNER === 'Tim Pruitt', 'canonical rules header/version preserved');
ok(CR.rules.length === 4 && CR.activeIds.join(',') === 'NC-001,NC-002,NC-003,NC-004', 'canonical NEVER_CONSIDER section yields NC-001..NC-004');
ok(CR.rules.every(r => r.active && r.STATUS === 'ACTIVE' && r.ACTION === 'DO_NOT_ADD' && r.CATEGORY && r.REASON), 'canonical NC rules are active DO_NOT_ADD rules with categories/reasons');
ok(W.classifyNeverConsider({ COMPANY:'Pfizer', NEVER_CONSIDER_RULE_ID:'NC-001', EXCLUSION_CONFIDENCE:'HIGH' }, CR).outcome === 'EXCLUDE', 'runtime canonical parser supports high-confidence NC exclusion');
ok(W.classifyNeverConsider({ COMPANY:'Automation Partners', NEVER_CONSIDER_RULE_ID:'NC-001', EXCLUSION_CONFIDENCE:'HIGH', EMPLOYER_DOMAIN_HINT:'industrial automation supplier serving pharmaceutical plants' }, CR).outcome === 'REVIEW', 'runtime canonical parser preserves protected supplier review behavior');
const inactiveCanonical = W.parseCanonicalNeverConsiderRules(canonicalText.replace('STATUS=ACTIVE','STATUS=DRAFT_MIGRATION'));
ok(inactiveCanonical.status === 'UNAVAILABLE' && inactiveCanonical.activeIds.length === 0, 'non-ACTIVE canonical rules cannot authorize exclusions');
ok(R.status === 'ACTIVE' && R.defaultAction === 'ALLOW_INTAKE' && R.header.OWNER === 'Tim Pruitt', 'canonical Doc parses: STATUS=ACTIVE, DEFAULT_ACTION=ALLOW_INTAKE, header kept');
ok(R.rules.length === 4 && R.activeIds.join(',') === 'NC-001,NC-002,NC-003,NC-004', 'four ACTIVE rules NC-001..NC-004 with their ids preserved');
ok(R.rules.every(r => r.CATEGORY && r.ACTION === 'DO_NOT_ADD' && r.MATCH && r.DO_NOT_MATCH && r.REASON && r.EXCEPTION && r.STATUS === 'ACTIVE'), 'each rule carries CATEGORY, ACTION, MATCH, DO_NOT_MATCH, REASON, EXCEPTION, STATUS');
ok(R.rules[2].CATEGORY === 'FOOD_OR_BEVERAGE_MANUFACTURER' && /Packaging-equipment makers/.test(R.rules[2].DO_NOT_MATCH), 'multi-word values kept verbatim');
ok(!R.header.SCOUT_RUN_ID && !R.header['NC-001_COUNT'], 'template KEY= lines after the rules section are not treated as header or rules');
ok(W.parseRulesText(text.replace(/_/g, '\\_')).rules.length === 4, 'Markdown-escaped underscores (as some exporters emit) still parse');
const c = (rec) => W.classifyNeverConsider(rec, R);
// hard exclusions: Scout cites an ACTIVE rule with HIGH confidence
ok(c({ COMPANY: 'Pfizer', NEVER_CONSIDER_RULE_ID: 'NC-001', EXCLUSION_CONFIDENCE: 'HIGH', EXCLUSION_REASON: 'pharmaceutical manufacturer' }).outcome === 'EXCLUDE', 'NC-001 pharmaceutical hard exclusion');
ok(c({ COMPANY: 'Medtronic', NEVER_CONSIDER_RULE_ID: 'NC-002', EXCLUSION_CONFIDENCE: 'HIGH' }).outcome === 'EXCLUDE', 'NC-002 medical-device hard exclusion');
ok(c({ COMPANY: 'Coca-Cola Bottling', NEVER_CONSIDER_RULE_ID: 'nc-003', EXCLUSION_CONFIDENCE: 'high' }).outcome === 'EXCLUDE', 'NC-003 food/beverage hard exclusion (case-insensitive id and confidence)');
ok(c({ COMPANY: 'Chick-fil-A', NEVER_CONSIDER_RULE_ID: 'NC-004', EXCLUSION_CONFIDENCE: 'HIGH' }).ruleId === 'NC-004', 'NC-004 restaurant/food-service hard exclusion reported by rule id');
// HIGH is necessary, not sufficient: supplied employer evidence naming a protected case (DO_NOT_MATCH) wins (Forge review item 1)
const ev1 = c({ COMPANY: 'Automation Partners', NEVER_CONSIDER_RULE_ID: 'NC-001', EXCLUSION_CONFIDENCE: 'HIGH', EMPLOYER_DOMAIN_HINT: 'industrial automation supplier serving pharmaceutical plants' });
ok(ev1.outcome === 'REVIEW' && ev1.ruleId === 'NC-001' && /^EVIDENCE_CONFLICT_DO_NOT_MATCH/.test(ev1.basis), 'NC-001 cited HIGH but evidence says industrial automation supplier: REVIEW, never EXCLUDE (' + ev1.basis + ')');
const ev3 = c({ COMPANY: 'PackLine Systems', NEVER_CONSIDER_RULE_ID: 'NC-003', EXCLUSION_CONFIDENCE: 'HIGH', EMPLOYER_PRIMARY_BUSINESS: 'packaging equipment maker for food and beverage plants' });
ok(ev3.outcome === 'REVIEW' && /^EVIDENCE_CONFLICT_DO_NOT_MATCH/.test(ev3.basis), 'NC-003 cited HIGH but evidence says packaging-equipment maker: REVIEW, never EXCLUDE');
const ev2 = c({ COMPANY: 'MedBuild Integrators', NEVER_CONSIDER_RULE_ID: 'NC-002', EXCLUSION_CONFIDENCE: 'HIGH', EMPLOYER_DOMAIN_HINT: 'automation integration for medical device lines' });
ok(ev2.outcome === 'REVIEW', 'NC-002 cited HIGH but evidence says integrator: REVIEW');
ok(c({ COMPANY: 'Pfizer', NEVER_CONSIDER_RULE_ID: 'NC-001', EXCLUSION_CONFIDENCE: 'HIGH', EMPLOYER_DOMAIN_HINT: 'pharmaceutical manufacturer' }).outcome === 'EXCLUDE', 'NC-001 cited HIGH with consistent evidence still excludes');
ok(W.protectedCaseEvidence({ EMPLOYER_DOMAIN_HINT: 'commercial pharmaceutical production' }) === '', 'consistent evidence carries no protected-case term');
// not excluded
ok(c({ COMPANY: 'Automation Partners', EMPLOYER_DOMAIN_HINT: 'industrial automation supplier serving pharmaceutical plants' }).outcome === 'ALLOW', 'industrial automation supplier serving pharma is NOT excluded (no review flag either: reads as a supplier)');
ok(c({ COMPANY: 'Conveyor Systems Inc', EMPLOYER_DOMAIN_HINT: 'industrial equipment for the food manufacturing industry customers' }).outcome === 'ALLOW', 'equipment supplier serving food plants is NOT excluded');
const amb = c({ COMPANY: 'Northline Holdings', EMPLOYER_DOMAIN_HINT: 'diversified: pharmaceutical packaging and specialty chemicals', NEVER_CONSIDER_RULE_ID: 'NC-001', EXCLUSION_CONFIDENCE: 'MED' });
ok(amb.outcome === 'REVIEW' && amb.ruleId === 'NC-001', 'ambiguous domain (MED confidence) does not hard-exclude; admitted with NEVER_CONSIDER_REVIEW_NEEDED');
ok(c({ COMPANY: 'Somebody', NEVER_CONSIDER_RULE_ID: 'NC-001', EXCLUSION_CONFIDENCE: 'LOW' }).outcome === 'REVIEW', 'LOW confidence never excludes');
ok(c({ COMPANY: 'Somebody', NEVER_CONSIDER_RULE_ID: 'NC-001' }).outcome === 'REVIEW', 'cited rule without a confidence never excludes');
ok(c({ COMPANY: 'Anduril', TITLE: 'Director, Pharmaceutical Robotics', EMPLOYER_DOMAIN_HINT: 'defense technology' }).outcome === 'ALLOW', 'keyword in the title never triggers a rule');
ok(c({ COMPANY: 'Unknown Co', INITIAL_UNKNOWN_FIELDS: 'PAY,FLEX,DEGREE' }).outcome === 'ALLOW', 'unknown pay/FLEX/degree is not a basis for anything');
const wh = c({ COMPANY: 'Generic Pharma Works', EMPLOYER_DOMAIN_HINT: 'pharmaceutical manufacturer' });
ok(wh.outcome === 'REVIEW' && wh.ruleId === 'NC-001' && wh.basis === 'DOMAIN_HINT', 'writer-side domain hint only flags a review (never excludes on its own)');
// never invent
ok(c({ COMPANY: 'X', NEVER_CONSIDER_RULE_ID: 'NC-099', EXCLUSION_CONFIDENCE: 'HIGH' }).outcome === 'REVIEW' && c({ COMPANY: 'X', NEVER_CONSIDER_RULE_ID: 'NC-099', EXCLUSION_CONFIDENCE: 'HIGH' }).basis === 'UNKNOWN_RULE_ID', 'a rule id not in the canonical file cannot exclude (never invent a category)');
const retired = W.parseRulesText(text.replace('RULE_ID=NC-004\nCATEGORY=RESTAURANT_OR_FOOD_SERVICE\nACTION=DO_NOT_ADD', 'RULE_ID=NC-004\nCATEGORY=RESTAURANT_OR_FOOD_SERVICE\nACTION=DO_NOT_ADD').replace(/(RULE_ID=NC-004[\s\S]*?)STATUS=ACTIVE/, '$1STATUS=INACTIVE'));
ok(retired.activeIds.length === 3 && W.classifyNeverConsider({ COMPANY: 'Chick-fil-A', NEVER_CONSIDER_RULE_ID: 'NC-004', EXCLUSION_CONFIDENCE: 'HIGH' }, retired).outcome === 'REVIEW', 'STATUS=INACTIVE retires a rule without reusing its id; citing it no longer excludes');
const added = W.parseRulesText(text.replace('SCOUT REQUIRED OUTPUT', 'RULE_ID=NC-005\nCATEGORY=TOBACCO_MANUFACTURER\nACTION=DO_NOT_ADD\nMATCH=x\nDO_NOT_MATCH=y\nREASON=z\nEXCEPTION=Tim\nSTATUS=ACTIVE\n\nSCOUT REQUIRED OUTPUT'));
ok(added.activeIds.length === 5 && W.classifyNeverConsider({ COMPANY: 'Altria', NEVER_CONSIDER_RULE_ID: 'NC-005', EXCLUSION_CONFIDENCE: 'HIGH' }, added).outcome === 'EXCLUDE', 'a rule Tim adds to the Doc is honored with no code change');
const bad = W.parseRulesText('');
ok(bad.status === 'UNAVAILABLE' && W.classifyNeverConsider({ COMPANY: 'Pfizer', NEVER_CONSIDER_RULE_ID: 'NC-001', EXCLUSION_CONFIDENCE: 'HIGH' }, bad).outcome === 'REVIEW', 'unreadable rules file: default ALLOW_INTAKE, nothing excluded, review flagged');
ok(W.categoryTerms('FOOD_OR_BEVERAGE_MANUFACTURER').join(',') === 'food,beverage', 'category terms derive from the CATEGORY name (no hard-coded category list)');
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASS'); process.exit(fails ? 1 : 0);
