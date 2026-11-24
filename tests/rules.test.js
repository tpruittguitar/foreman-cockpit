// Never-consider rules: legacy parser remains regression-tested; runtime authority is TIM_PIPELINE_RULES_CANONICAL.
const fs = require('fs'), path = require('path');
const W = require('../apps-script/Code.gs');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'TIM_NEVER_CONSIDER_RULES.sample.txt'), 'utf8');
const R = W.parseRulesText(text);
const canonicalText = fs.readFileSync(path.join(__dirname, 'fixtures', 'TIM_PIPELINE_RULES_CANONICAL.sample.txt'), 'utf8');
const CR = W.parseCanonicalNeverConsiderRules(canonicalText);
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
// card 5: food/beverage makers whose business text says "Foods"/"Beverages" were admitted with no NC-003 review flag
[['Tyson Foods', 'Tyson Foods in Claremont, NC. Full-time Mid-Senior level role.'], ['TreeHouse Foods', 'TreeHouse Foods in Faison, NC. Full-time'], ['Liberty Coca-Cola Beverages', 'Liberty Coca-Cola Beverages bottles and distributes beverages']].forEach(function (pair) {
  const h = W.classifyNeverConsider({ COMPANY: pair[0], TITLE: 'Director of Operations', EMPLOYER_PRIMARY_BUSINESS: pair[1] }, CR);
  ok(h.outcome === 'REVIEW' && h.ruleId === 'NC-003' && h.basis === 'DOMAIN_HINT', pair[0] + ': plural "foods"/"beverages" in primary business flags NC-003 review (' + JSON.stringify(h) + ')');
});
ok(W.classifyNeverConsider({ COMPANY: 'Food Line Automation', EMPLOYER_PRIMARY_BUSINESS: 'automation for foods plants' }, CR).outcome === 'ALLOW', 'plural match still yields to supplier/automation evidence');
ok(W.classifyNeverConsider({ COMPANY: 'Seafoodery', EMPLOYER_PRIMARY_BUSINESS: 'seafoodery and foodservice equipment' }, CR).outcome === 'ALLOW', 'plural match stays whole-word (no seafood/foodservice substring hit)');
const employerLines = [
  '- NC-009 ABBVIE: employer=AbbVie; rule=NC-001; source_url=https://investors.abbvie.com/',
  '- NC-010 AMGEN: employer=Amgen; rule=NC-001; source_url=https://www.amgen.com/about',
  '- NC-011 STRYKER: employer=Stryker; rule=NC-002; source_url=https://www.stryker.com/us/en/about.html',
  '- NC-012 MEDTRONIC: employer=Medtronic; rule=NC-002; source_url=https://www.medtronic.com/no-nn/about.html',
  '- NC-020 EXAMPLE_WORKS: employer=Example Works; rule=NC-003; source_url=https://example.com/about'
];
ok(employerLines.every(line => W.parseNeverConsiderEmployerLine_(line)), 'any employer= line parses');
ok(W.parseNeverConsiderEmployerLine_('- NC-001 PHARMACEUTICAL_MANUFACTURER: not an employer line') === null, 'category bullets without employer= stay category rules');
const withEmployers = W.parseCanonicalNeverConsiderRules(canonicalText.replace('SECTION=COMPENSATION_GEOGRAPHY', employerLines.join('\n') + '\nSECTION=COMPENSATION_GEOGRAPHY'));
ok(withEmployers.employers.length === 5 && withEmployers.activeIds.join(',') === 'NC-001,NC-002,NC-003,NC-004', 'employer= lines are not category rules and no employer name is hardcoded');
[['AbbVie', 'NC-001'], ['Amgen Inc.', 'NC-001'], ['Stryker', 'NC-002'], ['Medtronic', 'NC-002'], ['Example Works', 'NC-003']].forEach(function (pair) {
  const hit = W.classifyNeverConsider({ COMPANY: pair[0], TITLE: 'Director of Manufacturing' }, withEmployers);
  ok(hit.outcome === 'EXCLUDE' && hit.confidence === 'HIGH' && hit.basis === 'EMPLOYER_LINE' && hit.ruleId === pair[1] && hit.code === 'NEVER_CONSIDER', pair[0] + ' employer line returns EXCLUDE at HIGH with NEVER_CONSIDER');
});
ok(W.classifyNeverConsider({ COMPANY: 'Anduril', TITLE: 'Director of Manufacturing' }, withEmployers).outcome === 'ALLOW', 'an employer with no line is not excluded');
const NC_005 = '- NC-005 FINANCIAL_AND_ACCOUNTING_ROLES: exclude roles whose primary function is finance or accounting, including financial management/analysis, accounting, bookkeeping, tax preparation/advisory, audit of financial statements, payroll accounting, treasury, and financial control. Apply to the actual role regardless of employer industry. A manufacturing/operations leader\'s budget, cost, or profit-and-loss accountability alone is not a finance/accounting role. title_any=finance|financial|accounting|accountant|bookkeeping|bookkeeper|payroll|treasury|financial controller|fp&a|tax accountant|tax advisory|tax preparation; title_exempt=finance and operations|finance and manufacturing|finance and production|finance and facilities|accounting and operations|accounting and manufacturing|accounting and production|financial systems|finance systems|finance transformation|production controller|quality audit|project|software|engineer|recruit|consultant|consulting';
const NC_006 = '- NC-006 PROPERTY_MANAGEMENT_ROLES: exclude roles whose primary function is residential or commercial real-estate property management, including rental/community management, leasing operations, tenant services, and real-estate portfolio management. Do not classify manufacturing plant facilities, industrial maintenance, plant operations, or manufacturing engineering leadership as property management solely because they manage a site, building, equipment, or capital assets. title_any=property manager|property management|community manager|leasing operations|tenant services|real estate portfolio|hoa; title_exempt=plant|manufacturing|factory|industrial|production|maintenance|capital project';
const NC_013 = '- NC-013 NY_PA_NORTHEAST: New York, Pennsylvania, MA, CT, RI, NH, VT, ME, NJ, DE, MD and DC, and the upper Northeast corner of the US are never considered, except remote or multi-location roles. Remote and multi-location roles are exempt from all location rules, including this rule and UPPER_MIDWEST_ONSITE. Tim 2026-11-06. ruling=TIM-20261114 (Root declined-jobs review). states=NY|PA|MA|CT|RI|NH|VT|ME|NJ|DE|MD|DC; location_exempt=remote|multi_location';
const NC_015 = '- NC-015 ROLE_FAMILIES: exclude roles whose primary function is sales, HR, IT/software, R&D, product design, field service/support, supply chain, logistics, warehouse, yard, retail, dealership, or reconditioning, and design-side engineering management (product, hardware, electrical, avionics, embedded and ML engineering managers). Apply to the actual role and title regardless of employer industry. Do not classify manufacturing plant operations, industrial maintenance, or manufacturing engineering leadership as one of these roles solely because they use software, support a product, move material, or manage a yard, warehouse, or site. Tim standing instruction, recorded Nov 11, 2026. ruling=TIM-20261114 (Root declined-jobs review). title_any=sales|salesperson|account executive|human resources|hr|recruiter|talent acquisition|software engineer|software developer|it manager|information technology|product design|product designer|hardware engineering manager|electrical engineering manager|avionics engineering manager|embedded engineering manager|machine learning engineering manager|field service|field support|supply chain|logistics|warehouse|yard manager|retail|dealership|reconditioning|r&d; title_exempt=manufacturing|plant operations|industrial maintenance|manufacturing engineering';
const NC_019 = '- NC-019 PROGRAM_PROJECT_MANAGEMENT: Program/project management titles. Manufacturing and energy employers are exempt. ruling=TIM-20261114 (Root declined-jobs review). title_any=program manager|project manager|program management|project management|program director|project director|pmo|pm; employer_business_exempt=manufacturing|energy';
const NC_020 = '- NC-020 IC_ENGINEER: titles containing Engineer, Technician, Inspector, Analyst, Scientist or Specialist with no manager or leadership level. Titles containing Staff Engineer, Senior Staff Engineer or Principal Engineer stay exempt and must never be declined by this rule. ruling=TIM-20261114 (Root declined-jobs review). title_any=engineer|technician|inspector|analyst|scientist|specialist; title_exempt=staff engineer|senior staff engineer|principal engineer; level_exempt=manager|senior manager|director|sr director|senior director|vp|vice president|head|chief|executive|general manager|plant manager|leader';
const NC_021 = '- NC-021 FIRST_LINE: Supervisor, Group Leader, Associate Manager, Area Manager, Team Lead, Shift Manager and Coordinator. ruling=TIM-20261114 (Root declined-jobs review). title_any=supervisor|group leader|associate manager|area manager|team lead|shift manager|coordinator';
const NC_022 = '- NC-022 CONSTRUCTION_EPC: Construction and EPC contractors. Manufacturing and energy employers are exempt. ruling=TIM-20261114 (Root declined-jobs review). employer_business_any=construction|epc; employer_business_exempt=manufacturing|energy';
const NC_023_CITIES = 'Chicago|Evanston|Skokie|Wilmette|Niles|Morton Grove|Lincolnwood|Park Ridge|Des Plaines|Mount Prospect|Arlington Heights|Palatine|Rolling Meadows|Schaumburg|Hoffman Estates|Elk Grove Village|Rosemont|Cicero|Berwyn|Oak Park|Oak Lawn|Orland Park|Tinley Park|Oak Forest|Blue Island|Calumet City|Chicago Heights|Harvey|Bolingbrook|Downers Grove|Glenview|Wheaton|Elmhurst|Lombard|Carol Stream|Glen Ellyn|Lisle|Naperville|Aurora|North Aurora|Batavia|Geneva|St. Charles|Elgin|Streamwood|Hanover Park|Bartlett|Bloomingdale|Glendale Heights|Addison|Bensenville|Franklin Park|Melrose Park|Elmwood Park|Waukegan|North Chicago|Gurnee|Zion|Buffalo Grove|Northbrook|Highland Park|Deerfield|Lake Forest|Libertyville|Vernon Hills|Mundelein|Crystal Lake|Algonquin|Carpentersville|McHenry|Woodstock|Huntley|Joliet|Crest Hill|Shorewood|Plainfield|Romeoville|Lockport|New Lenox|Frankfort|Mokena|Homer Glen|Woodridge|Darien|Westmont|Hinsdale|La Grange|Oak Brook|Rockford|Loves Park|Machesney Park|Belvidere|DeKalb|Sycamore|Freeport';
const NC_023 = '- NC-023 UPPER_MIDWEST_ONSITE: Onsite roles in Michigan, Wisconsin, Minnesota, Iowa and northern Illinois are excluded. Northern Illinois is defined by the Chicago-area city list. Remote and multi-location roles are exempt, the same as NC-013. These rows go to REVIEW_NEEDED for Tim, not EXCLUDE, when (a) posted base pay is $250,000 or more, or (c) the title is VP or higher, or the employer is a top-priority AI, defense, space or energy firm. "Head of" titles count as executive (VP or higher) for the REVIEW_NEEDED exception. ruling=TIM-20261114 (Root declined-jobs review). states=MI|WI|MN|IA; city_any=' + NC_023_CITIES + '; location_exempt=remote|multi_location; review_if=base_pay>=250000|title_level>=VP|head_of|priority_employer=AI,defense,space,energy';
const NC_016 = '- NC-016 PAYER_GOVERNMENT_QUALITY: Non-manufacturing quality roles at payers and government-services firms (Centene, Maximus, Kaiser, CareStar). ruling=TIM-20261114 (Root declined-jobs review).';
const NC_024 = '- NC-024 CENTENE: employer=Centene; rule=NC-016; source_url=https://www.centene.com/';
const NC_025 = '- NC-025 MAXIMUS: employer=Maximus; rule=NC-016; source_url=https://www.maximus.com/';
const NC_026 = '- NC-026 KAISER: employer=Kaiser Permanente; rule=NC-016; source_url=https://about.kaiserpermanente.org/';
const NC_027 = '- NC-027 CARESTAR: employer=CareStar; rule=NC-016; source_url=https://www.carestar.com/';
const NC_029 = '- NC-029 LAW_FIRMS_AND_LEGAL_SERVICES: exclude before intake only when the employer\'s core business is a law firm, trial practice, or legal services firm. Do not exclude manufacturers, industrial suppliers, automation firms, or other employers solely because they have an in-house legal department or mention legal, regulatory, quality, or compliance functions. Tim, Hermes chat, recorded Nov 24, 2026. employer_business_any=law firm|law firms|legal services|legal service|trial lawyer|trial lawyers|lawyers|law office|law offices|legal practice|attorney at law|attorneys at law; employer_business_exempt=manufacturing|manufacturer|equipment|automation|supplier|component|software|recruiting|staffing';
const NC_030 = '- NC-030 LEGAL_ROLES: exclude roles whose primary function is the practice of law or legal operations, including attorney, counsel, paralegal, and legal operations. Apply to the actual role and title regardless of employer industry. Do not classify manufacturing quality, regulatory, or compliance roles as legal roles solely because those functions touch regulations or policies. Whole-word title matches only: counsel does not match counseling or counselor; legal does not match regulatory, compliance, or quality. Tim, Hermes chat, recorded Nov 24, 2026. title_any=attorney|counsel|paralegal|legal operations|lawyer|legal ops|legal';
const roleText = canonicalText.replace('SECTION=COMPENSATION_GEOGRAPHY', [NC_005, NC_006, NC_015, 'SECTION=COMPENSATION_GEOGRAPHY'].join('\n'));
const withRoles = W.parseCanonicalNeverConsiderRules(roleText);
const finance = W.classifyNeverConsider({ COMPANY: 'Any Co', TITLE: 'Head of Accounting' }, withRoles);
ok(finance.outcome === 'EXCLUDE' && finance.confidence === 'HIGH' && finance.ruleId === 'NC-005' && finance.basis === 'TITLE_RULE' && finance.code === 'NEVER_CONSIDER', 'NC-005 title match returns EXCLUDE at HIGH with NEVER_CONSIDER');
const property = W.classifyNeverConsider({ COMPANY: 'Any Co', TITLE: 'Property Manager' }, withRoles);
ok(property.outcome === 'EXCLUDE' && property.confidence === 'HIGH' && property.ruleId === 'NC-006' && property.basis === 'TITLE_RULE', 'NC-006 title match returns EXCLUDE at HIGH');
ok(W.classifyNeverConsider({ COMPANY: 'Any Co', TITLE: 'Director of Manufacturing' }, withRoles).outcome === 'ALLOW', 'a manufacturing title is not an NC-005 or NC-006 match');
ok(W.classifyNeverConsider({ COMPANY: 'Discrete Metals', TITLE: 'Quality Manager', EMPLOYER_DOMAIN_HINT: 'quality management for plant operations' }, withRoles).outcome === 'ALLOW', 'a quality manager title with management in the business text is not flagged by the domain hint');
ok(W.classifyNeverConsider({ COMPANY: 'Discrete Metals', TITLE: 'Operations Manager', EMPLOYER_PRIMARY_BUSINESS: 'financial oversight of manufacturing operations' }, withRoles).outcome === 'ALLOW', 'an operations manager title with financial in the business text is not flagged by the domain hint');
ok(W.classifyNeverConsider({ COMPANY: 'Generic Pharma Works', EMPLOYER_DOMAIN_HINT: 'pharmaceutical manufacturer' }, withRoles).outcome === 'REVIEW', 'a real category word still flags review after role rules are skipped');
ok(W.classifyNeverConsider({ COMPANY: 'Any Co', TITLE: 'Head of Accounting' }, CR).outcome === 'ALLOW', 'NC-005 does not exclude when that rule is absent');
const hidden = W.classifyNeverConsider({ COMPANY: 'BioSpace', TITLE: 'Head of Accounting', SOURCE_URL: 'https://www.biospace.com/jobs/123', SCOUT_NOTES: 'CLIENT=UNKNOWN' }, withRoles);
ok(hidden.outcome === 'REVIEW' && hidden.basis === 'REVIEW_NEEDED' && hidden.ruleId === 'NC-005', 'a BioSpace hidden-client row is REVIEW_NEEDED, not EXCLUDE');
const namedOnBioSpace = W.classifyNeverConsider({ COMPANY: 'AbbVie', TITLE: 'Director of Manufacturing', SOURCE_URL: 'https://www.biospace.com/jobs/abb' }, withEmployers);
ok(namedOnBioSpace.outcome === 'EXCLUDE' && namedOnBioSpace.ruleId === 'NC-001', 'a named employer on BioSpace still follows the employer line');
const abbvieRow = '1 | V2I-ABB | AbbVie | Director of Manufacturing | SCOUT_INTAKE | OPEN | - | REQ-123 | Austin, TX | SOURCE_URL=https://example.com/jobs/123';
const abbvieCard = { COMPANY: 'AbbVie', TITLE: 'Director of Manufacturing', LOCATION: 'Austin, TX', SOURCE_URL: 'https://example.com/jobs/123', REQ_ID: 'REQ-123' };
const intakeCtx = { now: '2026-11-14T12:00:00.000Z', nowET: '2026-11-14 07:00 ET' };
const existing = W.planIntake([abbvieRow], [abbvieCard], withEmployers, intakeCtx);
ok(existing.results[0].result === 'EXISTING_MATCH' && existing.results[0].PRIMARY_ID === 'V2I-ABB' && existing.summary.ENTERED_MASTER === 0 && existing.summary.NEVER_CONSIDER_EXCLUDED === 0, 'an existing master identity still follows matchExisting');
const financeRow = '1 | V2I-FIN | Northline Books | Head of Accounting | SCOUT_INTAKE | OPEN | - | REQ-9 | Austin, TX | SOURCE_URL=https://example.com/jobs/fin';
const financeExisting = W.planIntake([financeRow], [{ COMPANY: 'Northline Books', TITLE: 'Head of Accounting', LOCATION: 'Austin, TX', SOURCE_URL: 'https://example.com/jobs/fin', REQ_ID: 'REQ-9' }], withRoles, intakeCtx);
ok(financeExisting.results[0].result === 'EXISTING_MATCH' && financeExisting.summary.NEVER_CONSIDER_EXCLUDED === 0, 'an existing master identity still follows matchExisting on an NC-005 title');
const freshLines = ['V2_CURRENT_POPULATION_MASTER', 'COUNTS: TOTAL=0', 'END V2_CURRENT_POPULATION_MASTER TOTAL=0'];
const fresh = W.planIntake(freshLines, [abbvieCard], withEmployers, intakeCtx);
ok(fresh.results[0].result === 'NEVER_CONSIDER_EXCLUDED' && fresh.results[0].NEVER_CONSIDER_RULE_ID === 'NC-001' && fresh.excluded[0].DECLINE_REASON_CODE === 'NEVER_CONSIDER', 'a new employer line match is excluded at intake with decline code NEVER_CONSIDER');
const structuredText = canonicalText.replace('SECTION=COMPENSATION_GEOGRAPHY', [NC_005, NC_006, NC_013, NC_015, NC_016, NC_019, NC_020, NC_021, NC_022, NC_023, NC_024, NC_025, NC_026, NC_027, NC_029, NC_030, 'SECTION=COMPENSATION_GEOGRAPHY'].join('\n'));
const SR = W.parseCanonicalNeverConsiderRules(structuredText);
ok(SR.status === 'ACTIVE' && !SR.rules.some(r => r.RULE_ID === 'NC-001' && r.spec) && SR.rules.some(r => r.RULE_ID === 'NC-020' && r.spec), 'machine-field lines parse and a prose NC line has no spec');
const sc = (rec) => W.classifyNeverConsider(Object.assign({ COMPANY: 'Any Co', LOCATION: 'Austin, TX', REMOTE_HYBRID: 'On-site' }, rec), SR);
['Staff Engineer', 'Senior Staff Engineer', 'Principal Engineer'].forEach(title => {
  const hit = sc({ TITLE: title });
  ok(hit.outcome === 'ALLOW' && hit.ruleId !== 'NC-020', title + ' is never hit by NC-020');
});
ok(sc({ TITLE: 'Quality Engineering Manager' }).outcome === 'ALLOW', 'Quality Engineering Manager is not hit by NC-020');
ok(sc({ TITLE: 'Process Engineer' }).outcome === 'EXCLUDE' && sc({ TITLE: 'Process Engineer' }).ruleId === 'NC-020' && sc({ TITLE: 'Process Engineer' }).code === 'NEVER_CONSIDER', 'an engineer title with no exempt level is excluded by NC-020');
const supervisor = sc({ TITLE: 'Supervisor' });
ok(supervisor.outcome === 'EXCLUDE' && supervisor.confidence === 'HIGH' && supervisor.ruleId === 'NC-021' && supervisor.code === 'NEVER_CONSIDER', 'a Supervisor title is hit by NC-021');
ok(sc({ TITLE: 'Project Manager', EMPLOYER_PRIMARY_BUSINESS: 'automotive manufacturing' }).outcome === 'ALLOW', 'a PM title at a manufacturer is exempt from NC-019');
ok(sc({ TITLE: 'Project Manager', EMPLOYER_PRIMARY_BUSINESS: 'enterprise software' }).ruleId === 'NC-019' && sc({ TITLE: 'Project Manager', EMPLOYER_PRIMARY_BUSINESS: 'enterprise software' }).outcome === 'EXCLUDE', 'a PM title outside manufacturing and energy is excluded by NC-019');
ok(sc({ TITLE: 'Project Manager' }).outcome === 'ALLOW', 'a PM title with no business evidence is not flagged');
ok(sc({ COMPANY: 'Poulin / Willey Trial Lawyers', TITLE: 'Associate Attorney', EMPLOYER_PRIMARY_BUSINESS: 'Poulin / Willey Trial Lawyers' }).outcome === 'EXCLUDE' && ['NC-029', 'NC-030'].includes(sc({ COMPANY: 'Poulin / Willey Trial Lawyers', TITLE: 'Associate Attorney', EMPLOYER_PRIMARY_BUSINESS: 'Poulin / Willey Trial Lawyers' }).ruleId), 'law-firm employer and attorney title exclude under NC-029 or NC-030');
ok(sc({ COMPANY: 'Poulin / Willey Trial Lawyers', TITLE: 'Office Manager', EMPLOYER_PRIMARY_BUSINESS: 'Poulin / Willey Trial Lawyers' }).outcome === 'EXCLUDE' && sc({ COMPANY: 'Poulin / Willey Trial Lawyers', TITLE: 'Office Manager', EMPLOYER_PRIMARY_BUSINESS: 'Poulin / Willey Trial Lawyers' }).ruleId === 'NC-029', 'law-firm employer alone excludes under NC-029');
ok(sc({ TITLE: 'Attorney' }).outcome === 'EXCLUDE' && sc({ TITLE: 'Attorney' }).ruleId === 'NC-030', 'Attorney excludes under NC-030');
ok(sc({ TITLE: 'General Counsel' }).outcome === 'EXCLUDE' && sc({ TITLE: 'General Counsel' }).ruleId === 'NC-030', 'General Counsel excludes under NC-030');
ok(sc({ TITLE: 'Paralegal' }).outcome === 'EXCLUDE' && sc({ TITLE: 'Paralegal' }).ruleId === 'NC-030', 'Paralegal excludes under NC-030');
ok(sc({ TITLE: 'Legal Operations Manager' }).outcome === 'EXCLUDE' && sc({ TITLE: 'Legal Operations Manager' }).ruleId === 'NC-030', 'Legal Operations Manager excludes under NC-030');
ok(sc({ TITLE: 'Quality Manager', EMPLOYER_PRIMARY_BUSINESS: 'discrete manufacturing' }).outcome === 'ALLOW', 'Quality Manager at discrete manufacturing is allowed');
ok(sc({ TITLE: 'Regulatory Affairs Director', EMPLOYER_PRIMARY_BUSINESS: 'discrete manufacturing' }).outcome === 'ALLOW', 'Regulatory Affairs Director at discrete manufacturing is allowed');
ok(sc({ TITLE: 'Compliance Manager', EMPLOYER_PRIMARY_BUSINESS: 'discrete manufacturing' }).outcome === 'ALLOW', 'Compliance Manager at discrete manufacturing is allowed');
ok(sc({ TITLE: 'EHS/Quality Compliance', EMPLOYER_PRIMARY_BUSINESS: 'discrete manufacturing' }).outcome === 'ALLOW', 'EHS/Quality Compliance at discrete manufacturing is allowed');
ok(sc({ TITLE: 'School Counselor' }).outcome === 'ALLOW', 'School Counselor is not caught by counsel');
ok(sc({ TITLE: 'Career Counseling Manager' }).outcome === 'ALLOW', 'Career Counseling Manager is not caught by counsel');
ok(sc({ TITLE: 'Compliance Counsel' }).outcome === 'EXCLUDE' && sc({ TITLE: 'Compliance Counsel' }).ruleId === 'NC-030', 'Compliance Counsel still excludes under NC-030');
ok(sc({ COMPANY: 'Acme Manufacturing', TITLE: 'Quality Manager', EMPLOYER_PRIMARY_BUSINESS: 'manufacturing; in-house legal department' }).outcome === 'ALLOW', 'a manufacturer with an in-house legal department is not excluded by NC-029');
const mi = { TITLE: 'Director of Manufacturing', LOCATION: 'Detroit, MI', REMOTE_HYBRID: 'On-site' };
const highPay = sc(Object.assign({ SALARY_BASE_POSTED: '$260,000' }, mi));
ok(highPay.outcome === 'REVIEW' && highPay.basis === 'REVIEW_NEEDED' && highPay.ruleId === 'NC-023', 'an onsite MI role at $260k goes to REVIEW_NEEDED');
const lowPay = sc(Object.assign({ SALARY_BASE_POSTED: '$200,000' }, mi));
ok(lowPay.outcome === 'EXCLUDE' && lowPay.confidence === 'HIGH' && lowPay.ruleId === 'NC-023' && lowPay.code === 'NEVER_CONSIDER', 'an onsite MI role at $200k is EXCLUDE');
ok(sc(Object.assign({}, mi, { REMOTE_HYBRID: 'Remote', SALARY_BASE_POSTED: '$260,000' })).outcome === 'ALLOW', 'a remote MI role passes');
const head = sc({ TITLE: 'Head of Quality', LOCATION: 'Madison, WI', REMOTE_HYBRID: 'On-site' });
ok(head.outcome === 'REVIEW' && head.basis === 'REVIEW_NEEDED' && head.ruleId === 'NC-023', 'Head of Quality onsite in WI goes to REVIEW_NEEDED');
const vp = sc({ TITLE: 'VP of Quality', LOCATION: 'Madison, WI', REMOTE_HYBRID: 'On-site' });
ok(vp.outcome === 'REVIEW' && vp.basis === 'REVIEW_NEEDED' && vp.ruleId === 'NC-023', 'a VP title onsite in WI goes to REVIEW_NEEDED');
const defense = sc(Object.assign({ EMPLOYER_PRIMARY_BUSINESS: 'defense technology', SALARY_BASE_POSTED: '$200,000' }, mi));
ok(defense.outcome === 'REVIEW' && defense.basis === 'REVIEW_NEEDED' && defense.ruleId === 'NC-023', 'a top-priority defense employer onsite in MI goes to REVIEW_NEEDED');
const nj = sc({ TITLE: 'Director of Manufacturing', LOCATION: 'Newark, NJ', REMOTE_HYBRID: 'On-site' });
ok(nj.outcome === 'EXCLUDE' && nj.ruleId === 'NC-013' && nj.confidence === 'HIGH' && nj.code === 'NEVER_CONSIDER', 'an NJ onsite role is EXCLUDE under NC-013');
ok(sc({ TITLE: 'Director of Manufacturing', LOCATION: 'Newark, NJ', REMOTE_HYBRID: 'Remote' }).outcome === 'ALLOW', 'a remote NJ role passes');
// NC-013 keeps the state (card a9c0469): a (MA) suffix, a trailing ZIP and a LinkedIn metro name with no state (Metasys V2I-514B069A723C, LOCATION 'Greater Boston').
['Boston (MA)', 'Greater Boston (MA)', 'Boston (Massachusetts) (On-site)', 'Warren, MA 01083', 'Nashua, NH 03064-2813', 'Greater Boston', 'Greater Philadelphia', 'New York City Metropolitan Area', 'Greater Pittsburgh Region'].forEach(loc => {
  const hit = sc({ COMPANY: 'Metasys Technologies', TITLE: 'General Manager', LOCATION: loc, REMOTE_HYBRID: 'On-site' });
  ok(hit.outcome === 'EXCLUDE' && hit.ruleId === 'NC-013' && hit.code === 'NEVER_CONSIDER', loc + ' onsite keeps its state and is EXCLUDE under NC-013');
});
ok(sc({ TITLE: 'General Manager', LOCATION: 'Greater Boston', REMOTE_HYBRID: 'Remote' }).outcome === 'ALLOW', 'a remote Greater Boston role passes');
['Atlanta Metropolitan Area', 'Tampa, FL 33607', 'Greater Boston Area, Virginia', 'Austin (TX)', 'Plant (HQ)'].forEach(loc => {
  ok(sc({ TITLE: 'General Manager', LOCATION: loc, REMOTE_HYBRID: 'On-site' }).outcome === 'ALLOW', loc + ' is not a Northeast location');
});
const missing = sc({ TITLE: 'Director of Manufacturing', LOCATION: '', REMOTE_HYBRID: 'On-site' });
ok(missing.outcome === 'ALLOW' && !missing.ruleId && !missing.basis, 'missing location under a location rule passes with no flag');
ok(sc({ TITLE: 'Director of Manufacturing', LOCATION: 'Chicago, IL' }).ruleId === 'NC-023', 'Chicago onsite is northern Illinois under NC-023');
ok(sc({ TITLE: 'Director of Manufacturing', LOCATION: 'Springfield, IL' }).outcome === 'ALLOW', 'downstate Illinois is outside the Chicago-area city list');
ok(sc({ TITLE: 'Director of Manufacturing', LOCATION: 'East Chicago, IN' }).outcome === 'ALLOW', 'East Chicago, Indiana is not northern Illinois');
ok(sc({ TITLE: 'Sales Manager' }).ruleId === 'NC-015' && sc({ TITLE: 'Sales Manager' }).outcome === 'EXCLUDE', 'NC-015 title pattern excludes a sales title');
ok(sc({ TITLE: 'IT Manager' }).ruleId === 'NC-015', 'IT Manager is the whole phrase it manager');
ok(sc({ TITLE: 'Unit Manager' }).outcome === 'ALLOW', 'it manager does not match inside Unit Manager');
ok(sc({ TITLE: 'Three Rivers Operations' }).outcome === 'ALLOW', 'hr does not match inside Three');
ok(sc({ TITLE: 'Director of Wholesale' }).outcome === 'ALLOW', 'sales does not match inside wholesale');
ok(sc({ TITLE: 'HOA Community Manager' }).ruleId === 'NC-006', 'hoa matches as a whole word');
ok(sc({ TITLE: 'Shoa Plant Manager' }).outcome === 'ALLOW', 'hoa does not match inside a word');
ok(sc({ TITLE: 'Senior PM', EMPLOYER_PRIMARY_BUSINESS: 'enterprise software' }).ruleId === 'NC-019', 'pm matches as a whole word');
ok(sc({ TITLE: 'Development Manager' }).outcome === 'ALLOW', 'pm does not match inside development');
ok(sc({ TITLE: 'Director of Capital Projects' }).outcome === 'ALLOW', 'Director of Capital Projects does not hit NC-019');
const sop = sc({ TITLE: 'Manager, Sales and Operations Planning' });
ok(sop.outcome === 'EXCLUDE' && sop.ruleId === 'NC-015', 'Sales and Operations Planning currently hits NC-015 because sales is a whole word');
ok(sc({ TITLE: 'Team Lead' }).ruleId === 'NC-021', 'Team Lead is the NC-021 phrase');
ok(sc({ TITLE: 'Team Leader' }).outcome === 'ALLOW', 'Team Leader is not the phrase team lead');
ok(sc({ TITLE: 'Team Leader Development Program Director' }).outcome === 'ALLOW', 'team lead does not hit Team Leader Development Program Director');
const directorLead = sc({ TITLE: 'Director, Team Lead' });
ok(directorLead.outcome === 'EXCLUDE' && directorLead.ruleId === 'NC-021', 'a director title that also contains the phrase team lead still hits NC-021');
['Director of Quality', 'Plant Manager', 'Senior Director Manufacturing Operations', 'Head of Quality', 'VP Operations', 'Director of Operational Excellence', 'Senior Staff Engineer, Quality/Reliability', 'Repair Quality Leader', 'Director of Quality Engineering', 'Director, Manufacturing Engineering', 'VP Engineering', 'Head of Manufacturing Engineering', 'Senior Manager, Process Engineering', 'Engineering Manager', 'Principal Engineer', 'Chief Engineer', 'Sr Director of Manufacturing', 'General Manager, Plant Operations'].forEach(function (title) {
  const hit = sc({ TITLE: title });
  ok(hit.outcome === 'ALLOW', title + ' passes (' + (hit.outcome === 'ALLOW' ? 'no rule' : hit.outcome + ' ' + hit.ruleId) + ')');
});
ok(sc({ TITLE: 'Quality Engineer' }).outcome === 'EXCLUDE' && sc({ TITLE: 'Quality Engineer' }).ruleId === 'NC-020', 'Quality Engineer is still the whole word engineer');
// NC-020 title_exempt: split and reordered Staff/Principal Engineer titles (28 wrongly declined 2026-11-14, plus three named forms)
['Sr. Staff Manufacturing Engineer, Power Electronics', 'Mechanical Engineer, Senior Staff', 'Facilities Engineer Senior Principal – Projects', 'Senior Staff Systems Engineer – Systems Strategy & Survivability', 'Senior / Staff Dry Etch Process Development Engineer', 'Principal Mechanical Engineer - Thermal Projects', 'Principal Manufacturing Engineer (Propulsion)', 'Staff Manufacturing Engineer, Autonomous Airpower', 'Senior Staff / Senior Full Stack Engineer (Clearance Required)', 'Sentinel - Sr. Staff Systems Engineer', 'Senior Principal Materials Engineer', 'Sr. Principal Mechanical Engineer', 'Sr Staff Systems Engineer', 'Staff Manufacturing Engineer, Barracuda', 'Principal Manufacturing Engineer (Payloads)', 'Senior Staff Systems Engineer', 'Staff Software Engineer, Manufacturing Design Technology', 'Senior Staff Optical Engineer, Geo', 'Senior/Staff Automation Controls Engineer', 'Staff Aeronautical Engineer -Test and Evaluation Lead', 'Senior / Staff Probe Card Engineer', 'Staff Systems Engineer - Model-Based Systems Engineer (MBSE)', 'Staff Manufacturing Engineer, Automation Equipment', 'Project Engineer Senior Staff', 'Staff Steering Engineer, Chassis', 'Staff Robotics Manufacturing Engineer, Optimus General Assembly, Line Lead', 'Staff Vehicle Product Management Engineer', 'Principal Manufacturing Engineer',
  'Staff Manufacturing Engineer', 'Principal Mechanical Engineer', 'Facilities Engineer Senior Principal'].forEach(function (title) {
  const hit = sc({ TITLE: title });
  ok(hit.outcome === 'ALLOW', 'NC-020 title_exempt: ' + title + ' passes (' + (hit.outcome === 'ALLOW' ? 'no rule' : hit.outcome + ' ' + hit.ruleId) + ')');
});
['Process Engineer', 'Quality Engineer'].forEach(function (title) {
  const hit = sc({ TITLE: title });
  ok(hit.outcome === 'EXCLUDE' && hit.ruleId === 'NC-020', 'NC-020 title_exempt: plain ' + title + ' is still EXCLUDE');
});
ok(sc({ TITLE: 'Process Engineer (Senior Staff)' }).outcome === 'ALLOW', 'NC-020 title_exempt reads the parenthetical suffix');
ok(sc({ TITLE: 'Process Engineer (Contract)' }).ruleId === 'NC-020', 'NC-020 a non-exempt parenthetical suffix is still EXCLUDE');
ok(sc({ TITLE: 'Director of Manufacturing', EMPLOYER_PRIMARY_BUSINESS: 'commercial construction' }).ruleId === 'NC-022', 'NC-022 excludes a construction employer');
ok(sc({ TITLE: 'Director of Manufacturing', EMPLOYER_PRIMARY_BUSINESS: 'construction equipment manufacturing' }).outcome === 'ALLOW', 'a manufacturer is exempt from NC-022');
ok(sc({ COMPANY: 'Centene', TITLE: 'Director of Quality' }).ruleId === 'NC-016' && sc({ COMPANY: 'Centene', TITLE: 'Director of Quality' }).basis === 'EMPLOYER_LINE', 'NC-024 employer line still excludes through NC-016');
const proseOnly = W.parseCanonicalNeverConsiderRules(canonicalText.replace('SECTION=COMPENSATION_GEOGRAPHY', '- NC-020 IC_ENGINEER: titles containing Engineer with no manager level.\nSECTION=COMPENSATION_GEOGRAPHY'));
ok(proseOnly.status === 'ACTIVE' && W.classifyNeverConsider({ COMPANY: 'Any Co', TITLE: 'Process Engineer', LOCATION: 'Austin, TX' }, proseOnly).outcome === 'ALLOW', 'a prose-only NC line is ignored by the structured path');
const badField = W.parseCanonicalNeverConsiderRules(canonicalText.replace('SECTION=COMPENSATION_GEOGRAPHY', '- NC-013 NY_PA_NORTHEAST: northeast. states=Michigan|NJ\nSECTION=COMPENSATION_GEOGRAPHY'));
ok(badField.status === 'POLICY_ERROR' && /unparseable/i.test(badField.error) && badField.rules.length === 0, 'an unparseable machine field is a policy error');
ok(W.classifyNeverConsider({ COMPANY: 'Any Co', TITLE: 'Director of Manufacturing', LOCATION: 'Newark, NJ', REMOTE_HYBRID: 'On-site' }, badField).outcome === 'ALLOW', 'a policy error does not exclude or review the row');
const badPlan = W.planIntake(freshLines, [{ COMPANY: 'Any Co', TITLE: 'Director of Manufacturing', LOCATION: 'Newark, NJ', SOURCE_URL: 'https://example.com/jobs/nj', REMOTE_HYBRID: 'On-site' }], badField, intakeCtx);
ok(badPlan.ok === false && /unparseable/i.test(badPlan.error), 'a policy error does not route intake rows');
const missingPlan = W.planIntake(freshLines, [{ COMPANY: 'Garden State Metals', TITLE: 'Director of Manufacturing', SOURCE_URL: 'https://example.com/jobs/miss', REMOTE_HYBRID: 'On-site' }], SR, intakeCtx);
ok(missingPlan.results[0].result === 'WRITE_FAILED' && /INVALID_INPUT/.test(missingPlan.results[0].detail) && missingPlan.newLines.length === 0 && missingPlan.summary.NEVER_CONSIDER_REVIEW_NEEDED === 0 && missingPlan.summary.NEVER_CONSIDER_EXCLUDED === 0, 'missing location is refused at intake and is not a never-consider flag');
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASS'); process.exit(fails ? 1 : 0);
