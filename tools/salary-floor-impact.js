#!/usr/bin/env node
/* SALARY RULE impact report (Tim 2026-10-19 01:52 ET: "Report how many live rows change before deploy").
   Read-only. Scores every master row with the OLD modules (main) and the NEW ones (this branch) and reports what changes:
   the derived floor check (FLOOR_STATUS) and the pursuit decision (PURSUIT_STATUS), split by posted vs estimate-only pay.
   Nothing is written anywhere. Usage:
     node tools/salary-floor-impact.js --old <dir with main's pipeline-scoring.js, pipeline-policy.js, pipeline-evidence.js>
          [--master FILE] [--rules FILE] [--model FILE]
   Without --master the live master is read from the Writer (action=master, URL/key from pipeline-connection.js); without
   --rules / --model the published policy is read from tpruittguitar/forge-policy main. In GitHub Actions the summary is printed
   as ::notice annotations (the check-run annotations are the readable channel). */
const fs = require('fs'), path = require('path'), https = require('https'), vm = require('vm');
const repo = path.resolve(__dirname, '..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const get = url => new Promise((res, rej) => {
  const go = (u, n) => https.get(u, r => { if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && n < 5) { r.resume(); return go(new URL(r.headers.location, u).toString(), n + 1); }
    let b = ''; r.setEncoding('utf8'); r.on('data', d => b += d); r.on('end', () => r.statusCode === 200 ? res(b) : rej(new Error(u.split('?')[0] + ' -> HTTP ' + r.statusCode))); }).on('error', rej);
  go(url, 0);
});
const GH = process.env.GITHUB_ACTIONS === 'true';
const note = (title, msg) => { if (GH) console.log('::notice title=' + title + '::' + String(msg).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A')); console.log('== ' + title + '\n' + msg); };

(async () => {
  const oldDir = arg('--old'); if (!oldDir) throw new Error('--old <dir> is required');
  const conn = (() => { const c = {}; vm.runInNewContext(fs.readFileSync(path.join(repo, 'pipeline-connection.js'), 'utf8').replace(/^var /m, 'this.'), c); return c.PipelineConnection; })();
  let text;
  if (arg('--master')) text = fs.readFileSync(arg('--master'), 'utf8');
  else { const j = JSON.parse(await get(conn.url + '?action=master&key=' + encodeURIComponent(conn.key))); if (!j.ok) throw new Error('Writer master read: ' + (j.error || 'not ok')); text = j.text; }
  const RAW = 'https://raw.githubusercontent.com/tpruittguitar/forge-policy/main/';
  const rulesText = arg('--rules') ? fs.readFileSync(arg('--rules'), 'utf8') : await get(RAW + 'rules/TIM_PIPELINE_RULES_CANONICAL.txt');
  const model = JSON.parse(arg('--model') ? fs.readFileSync(arg('--model'), 'utf8') : await get(RAW + 'scoring/PIPELINE_SCORING_MODEL.json'));
  const Parser = require(path.join(repo, 'pipeline-parser.js')), Rules = require(path.join(repo, 'pipeline-rules.js'));
  const NEW = { S: require(path.join(repo, 'pipeline-scoring.js')), P: require(path.join(repo, 'pipeline-policy.js')), E: require(path.join(repo, 'pipeline-evidence.js')) };
  const OLD = { S: require(path.resolve(oldDir, 'pipeline-scoring.js')), P: require(path.resolve(oldDir, 'pipeline-policy.js')) };
  const cfgFor = M => { const flex = M.P.normalizeFlexPolicy(Rules.flexPolicy(rulesText)); return Object.assign({}, M.S.normalize(model.model || model), { flexPolicy: flex, targetCompanies: M.S.targetCompaniesFromRules ? M.S.targetCompaniesFromRules(rulesText) : [] }); };
  const cNew = cfgFor(NEW), cOld = cfgFor(OLD);
  const parsed = Parser.parse(text), rows = parsed.rows || [], FINAL = ['APPLIED', 'REJECTED_BY_EMPLOYER', 'DECLINED_BY_TIM', 'DUPLICATE', 'CLOSED_DEAD', 'INVALID_DISCOVERY'];   // terminal buckets (READY_TO_PURSUE stays live)
  const live = r => FINAL.indexOf(String(r.BUCKET || '').toUpperCase()) < 0;
  const isPosted = p => { const s = NEW.E.salary(p).source; return s === 'SALARY_BASE_POSTED' || s === 'PAY_POSTED' || s === 'SALARY_POSTED'; };
  const t = { rows: rows.length, live: 0, figure: 0, estimateOnly: 0, posted: 0, none: 0, agentFloor: 0, derived: {}, change: {}, changeEst: 0, changePosted: 0, changeNone: 0 }, list = [];
  rows.forEach(r => {
    if (!live(r)) return; t.live++;
    const p = r.payload || {}, fig = NEW.E.salary(p).mid != null;
    if (fig) { t.figure++; if (isPosted(p)) t.posted++; else t.estimateOnly++; } else t.none++;
    const a = OLD.S.scoreRow(r, cOld).assessment.decision, nScore = NEW.S.scoreRow(r, cNew), b = nScore.assessment.decision, f = nScore.floor || {};
    if (!f.derived && f.status) t.agentFloor++;
    if (f.derived && f.status) t.derived[f.status.split('_')[0]] = (t.derived[f.status.split('_')[0]] || 0) + 1;
    if (a !== b) { const key = a + ' -> ' + b; t.change[key] = (t.change[key] || 0) + 1; if (!fig) t.changeNone++; else if (isPosted(p)) t.changePosted++; else t.changeEst++;
      list.push([r.PRIMARY_ID || '', r.COMPANY, r.TITLE, r.LOCATION, a + ' -> ' + b, f.status || '', (f.basis || '').replace(/^WRITER_DERIVED · /, '')].join(' | ')); }
  });
  const nChange = Object.values(t.change).reduce((x, y) => x + y, 0);
  note('Salary rule impact · rows', 'master rows ' + t.rows + ' · live (not terminal) ' + t.live + ' · with a salary figure ' + t.figure + ' (posted ' + t.posted + ', estimate-only ' + t.estimateOnly + ') · no figure ' + t.none +
    '\nfloor check: agent-written FLOOR_STATUS kept on ' + t.agentFloor + ' · Writer-derived ' + JSON.stringify(t.derived) +
    '\nPURSUIT_STATUS changes on ' + nChange + ' live rows (estimate-only ' + t.changeEst + ', posted ' + t.changePosted + ', no figure ' + t.changeNone + ')');
  note('Salary rule impact · transitions', Object.keys(t.change).sort((x, y) => t.change[y] - t.change[x]).map(k => t.change[k] + '  ' + k).join('\n') || 'none');
  for (let i = 0; i < list.length && i < 6 * 25; i += 25) note('Salary rule impact · changed rows ' + (i + 1) + '-' + Math.min(list.length, i + 25), list.slice(i, i + 25).join('\n'));
  if (list.length > 150) note('Salary rule impact · more', (list.length - 150) + ' more changed rows not listed');
  if (arg('--out')) fs.writeFileSync(arg('--out'), JSON.stringify({ totals: t, changed: list }, null, 1));
})().catch(e => { console.error(e.stack || e); if (GH) console.log('::error title=Salary rule impact::' + String(e.message || e)); process.exit(1); });
