// Canonical source-URL identity for dedupe. Run: node tests/canon-url.test.js
const fs = require('fs'), path = require('path');
const W = require('../apps-script/Code.gs'); const G = require('./gen_population.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const C = W.canonUrl;

// unchanged identities
ok(C('https://www.linkedin.com/jobs/view/director-of-quality-at-acme-4473365262?trk=abc') === 'linkedin.com/jobs/view/4473365262', 'LinkedIn job id');
ok(C('https://www.indeed.com/viewjob?jk=abc123def456&from=alert') === 'indeed.com/jk/abc123def456', 'Indeed jk');
ok(C('https://job-boards.greenhouse.io/novaforge/jobs/7777777001?utm_source=x') === 'job-boards.greenhouse.io/novaforge/jobs/7777777001', 'path-identified ATS keeps host+path, drops tracking query');
ok(C('not a url') === '', 'non-URL is no identity');

// ZipRecruiter redirect links carry only a per-result match_token: no identity (2026-10-13 ZipRecruiter pass, 11 of 12 rejected)
const zr1 = 'https://www.ziprecruiter.com/job-redirect?match_token=Cp8BChZyUnZxQW9nZFQzd2FBdWJma180a3hBEiQwMWEx&tsid=100000501';
const zr2 = 'https://www.ziprecruiter.com/job-redirect?match_token=Cp8BChZoUGdSaklaVjZNeDdjX2xlLTU5U2tBEiQwMWEx&tsid=100000501';
ok(C(zr1) === '' && C(zr2) === '', 'ZipRecruiter job-redirect is no identity');
ok(C('https://www.ziprecruiter.com/c/Acme/Job/Director-of-Manufacturing/-in-Austin,TX?jid=abc') !== '', 'a ZipRecruiter company job page still has an identity');

// Glassdoor: the job id lives in the query
const gd1 = 'https://www.glassdoor.com/partner/jobListing.htm?pos=101&ao=1136043&s=58&guid=0000019a&src=GD_JOB_AD&t=SR&vt=w&cs=1_2e&cb=1759&jobListingId=1010282598032&jrtk=5-yul1';
const gd2 = 'https://www.glassdoor.com/partner/jobListing.htm?pos=102&ao=1136043&s=58&guid=0000019b&src=GD_JOB_AD&t=SR&vt=w&cs=1_9f&cb=1759&jobListingId=1009877001234&jrtk=5-yul1';
ok(C(gd1) === 'glassdoor.com/job/1010282598032', 'Glassdoor partner jobListing.htm keyed by jobListingId: ' + C(gd1));
ok(C(gd1) !== C(gd2), 'two different Glassdoor jobs on jobListing.htm no longer share one identity');
ok(C('https://www.glassdoor.com/job-listing/director-quality-acme-JV_IC1154532_KO0,16_KE17,21.htm?jl=1010282598032&utm=x') === 'glassdoor.com/job/1010282598032', 'Glassdoor jl= on job-listing pages resolves to the same job id as jobListingId=');
ok(C('https://www.glassdoor.co.uk/partner/jobListing.htm?jobListingId=1010282598032') === 'glassdoor.com/job/1010282598032', 'Glassdoor country domain resolves to the same job id');
ok(C('https://www.glassdoor.com/partner/jobListing.htm?pos=101&guid=0000019a') === '', 'Glassdoor jobListing.htm without a job id is not an identity');

// Greenhouse embedded on an employer career page: ?gh_jid= is the job
const gh1 = 'https://www.acme.com/careers/openings?gh_jid=5551234001&gh_src=abc', gh2 = 'https://www.acme.com/careers/openings?gh_jid=5551234002';
ok(C(gh1) === 'acme.com/careers/openings?gh_jid=5551234001', 'gh_jid kept as the job identity on an employer page');
ok(C(gh1) !== C(gh2), 'two gh_jid jobs on one career page are distinct');

// end to end: a master row sourced from Glassdoor must not swallow other Glassdoor jobs
const rules = W.parseRulesText(fs.readFileSync(path.join(__dirname, 'fixtures', 'TIM_NEVER_CONSIDER_RULES.sample.txt'), 'utf8'));
const ctx = { run: { SCOUT_RUN_ID: 'RUN-GD-1', GROSS_FOUND: 3 }, now: '2026-10-06T03:00:00.000Z', nowET: '2026-10-05 23:00 ET' };
const lines = G.generate(570, 11).split('\n');
const at = lines.findIndex(l => /^\d+ \| /.test(l) && / \| READY_TO_PURSUE \| /.test(l));
const anchorId = lines[at].split(' | ')[1];
lines[at] = lines[at] + '; SOURCE_URL=' + gd1;
const recs = [
  { COMPANY: 'Prince Industries', TITLE: 'VP, Manufacturing', LOCATION: 'Carol Stream, IL', SOURCE_URL: gd2, SOURCE_PROVIDER: 'Glassdoor', IDENTITY_CONFIDENCE: 'HIGH' },
  { COMPANY: 'Stella-Jones', TITLE: 'Director of Manufacturing Engineering & Reliability', LOCATION: 'Chicago, IL', SOURCE_URL: 'https://www.glassdoor.com/partner/jobListing.htm?pos=103&guid=0000019c&jobListingId=1009999004321', SOURCE_PROVIDER: 'Glassdoor', IDENTITY_CONFIDENCE: 'HIGH' },
  { COMPANY: 'Some Other Co', TITLE: 'Plant Director', LOCATION: 'Bettendorf, IA', SOURCE_URL: gd1.replace('pos=101', 'pos=7'), SOURCE_PROVIDER: 'Glassdoor', IDENTITY_CONFIDENCE: 'HIGH' }
];
const plan = W.planIntake(lines, recs, rules, ctx);
ok(plan.ok, 'plan ok');
ok(plan.results[0].result === 'SCOUT_INTAKE_WRITTEN' && plan.results[1].result === 'SCOUT_INTAKE_WRITTEN', 'distinct Glassdoor jobs are admitted, not EXISTING_MATCH to the Glassdoor-sourced row (' + plan.results[0].result + ', ' + plan.results[1].result + ')');
ok(plan.results[2].outcome === 'IDENTITY_CONFLICT' && plan.results[2].candidateIds.includes(anchorId), 'shared Glassdoor URL at a different employer is held as an identity conflict');

// dedupe index: the URL fields the Writer writes on new rows take part; the never-written JOB_URL / CANONICAL_URL do not
{
  const line=(inv,pid,payload)=>inv+' | '+pid+' | Acme Corp | Director of Quality | SCOUT_INTAKE | UNRESOLVED/SCOUT_INTAKE | - | UNKNOWN | Dallas, TX | '+payload;
  const idx=W.indexExisting([
    line(901,'V2X-INDEX000001','DATE_ADDED=2026-10-05; COMPANY_SOURCE_URL=https://www.glassdoor.com/job-listing/director-of-quality-acme-JV_IC1139977_KO0,19_KE20,24.htm?jl=1009876543210&src=GD_JOB_AD; SOURCE_URL=https://www.linkedin.com/jobs/view/4473365262'),
    line(902,'V2X-INDEX000002','DATE_ADDED=2026-10-05; INITIATING_URL=https://jobs.example.org/role/55?utm_source=mail; INTAKE_SOURCE_URL=https://job-boards.greenhouse.io/acme/jobs/7777777002'),
    line(903,'V2X-INDEX000003','DATE_ADDED=2026-10-05; JOB_URL=https://jobs.example.org/legacy/1; CANONICAL_URL=https://jobs.example.org/legacy/2')
  ]);
  ok(idx.length===3,'three indexed rows');
  ok(idx[0].urls.indexOf('glassdoor.com/job/1009876543210')>=0,'COMPANY_SOURCE_URL (Glassdoor jl) is indexed');
  ok(idx[0].urls.indexOf('linkedin.com/jobs/view/4473365262')>=0,'SOURCE_URL still indexed');
  ok(idx[1].urls.indexOf(C('https://jobs.example.org/role/55'))>=0,'INITIATING_URL is indexed without its tracking query');
  ok(idx[1].urls.indexOf('job-boards.greenhouse.io/acme/jobs/7777777002')>=0,'INTAKE_SOURCE_URL is indexed');
  ok(idx[2].urls.length===0,'JOB_URL and CANONICAL_URL (no writer, 0 live rows) no longer feed dedupe');
  const m=W.matchExisting({COMPANY:'Other Co',TITLE:'Something Else',LOCATION:'Austin, TX',REQ_ID:'',SOURCE_URL:'https://www.glassdoor.com/Job/x/joblisting.htm?jobListingId=1009876543210'},idx);
  ok(m.kind!=='none'&&m.rows.some(r=>r.id==='V2X-INDEX000001'),'a rediscovery through the company source URL matches the existing row');
}

// Indeed sponsored click redirects: no jk= means no job identity (2026-10-10 collision on V2I-67CE5AAAAF49)
const pa1 = 'https://www.indeed.com/pagead/clk/dl?mo=r&ad=-6NYlbfkN0Aaa111&xkcb=SoBb&camk=abc&p=1&jsa=1234';
const pa2 = 'https://www.indeed.com/pagead/clk/dl?mo=r&ad=-6NYlbfkN0Bbb222&xkcb=SoCc&camk=def&p=2&jsa=5678';
ok(C(pa1) === '' && C(pa2) === '', 'Indeed pagead/clk/dl without jk is not an identity');
ok(C('https://www.indeed.com/pagead/clk?mo=r&ad=xyz') === '', 'Indeed pagead/clk without jk is not an identity');
ok(C('https://www.indeed.com/rc/clk/dl?ad=xyz&from=ja') === '', 'Indeed rc/clk without jk is not an identity');
ok(C('https://www.indeed.com/rc/clk?jk=857f3a877e8f483d&from=ja') === 'indeed.com/jk/857f3a877e8f483d', 'Indeed rc/clk with jk keeps the jk identity');
ok(C('https://www.indeed.com/pagead/clk?jk=b0673553d52bd5c1&ad=xyz') === 'indeed.com/jk/b0673553d52bd5c1', 'Indeed pagead with jk keeps the jk identity');
{
  const pl = G.generate(570, 12).split('\n');
  const ai = pl.findIndex(l => /^\d+ \| /.test(l) && / \| READY_TO_PURSUE \| /.test(l));
  const c = pl[ai].split(' | ');
  pl[ai] = pl[ai] + '; SOURCE_URL=' + pa1;
  const p2 = W.planIntake(pl, [
    { COMPANY: 'Align Production Systems', TITLE: 'Director Engineering Quality Processes', LOCATION: 'Decatur, IL', SOURCE_URL: pa2, SOURCE_PROVIDER: 'Indeed', IDENTITY_CONFIDENCE: 'HIGH' },
    { COMPANY: c[2], TITLE: c[3], LOCATION: c[8], SOURCE_URL: pa2.replace('Bbb222', 'Ccc333'), SOURCE_PROVIDER: 'Indeed', IDENTITY_CONFIDENCE: 'HIGH' }
  ], rules, { run: { SCOUT_RUN_ID: 'RUN-PA-1', GROSS_FOUND: 2 }, now: '2026-10-11T19:00:00.000Z', nowET: '2026-10-11 15:00 ET' });
  ok(p2.ok, 'pagead plan ok');
  ok(p2.results[0].result === 'SCOUT_INTAKE_WRITTEN', 'a new sponsored Indeed job is admitted, not held against the pagead-sourced row (' + p2.results[0].result + '/' + p2.results[0].outcome + ')');
  ok(p2.results[1].result !== 'SCOUT_INTAKE_WRITTEN', 'the same employer+title+location via another pagead link still dedupes (' + p2.results[1].result + '/' + p2.results[1].outcome + ')');
}

console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASS'); process.exit(fails ? 1 : 0);
