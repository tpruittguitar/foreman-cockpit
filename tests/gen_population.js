// Synthetic master generator for tests. Size is a parameter; tests must never assume a specific population.
const crypto = require('crypto');
const BUCKETS = ['READY_TO_PURSUE', 'DECLINED_BY_TIM', 'MANUAL_RESEARCH', 'BLOCKED', 'APPLIED', 'REJECTED_BY_EMPLOYER', 'DUPLICATE', 'CLOSED_DEAD'];
const WEIGHTS = [24, 300, 18, 3, 39, 7, 54, 118];
function pick(rnd) { let t = WEIGHTS.reduce((a, b) => a + b, 0), x = rnd() * t; for (let i = 0; i < BUCKETS.length; i++) { x -= WEIGHTS[i]; if (x < 0) return BUCKETS[i]; } return BUCKETS[0]; }
function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function generate(n, seed) {
  const rnd = mulberry(seed || 42); const lines = [];
  lines.push('V2_CURRENT_POPULATION_SYNTHETIC (generated for tests). CURRENT AUTHORITATIVE POPULATION FOR ALL SCOUT/GROK RUNS.');
  lines.push('BUCKET_AUTHORITY: row BUCKET is authoritative; section placement may lag.');
  // Company 3 always posts 'Director of Quality' at several locations: a deliberate ambiguous-identity case.
  const rows = [], counts = {};
  for (let i = 1; i <= n; i++) {
    const b = pick(rnd); counts[b] = (counts[b] || 0) + 1;
    const id = 'V2F-' + crypto.createHash('md5').update('row' + i + seed).digest('hex').slice(0, 12).toUpperCase();
    const req = (i % 3 === 0) ? 'LI-' + (4400000000 + i * 7919) : (i % 3 === 1 ? 'GH-' + (5000000000 + i * 104729) : 'UNCAPTURED');
    const url = (i % 4 === 0) ? 'https://www.linkedin.com/jobs/view/' + (4400000000 + i * 7919) : (i % 4 === 1 ? 'https://job-boards.greenhouse.io/company' + i + '/jobs/' + (5000000000 + i * 104729) : '');
    const payload = ['PACKET_SUPPORT_ONLY', 'DATE_ADDED=2026-09-' + (10 + (i % 19)).toString().padStart(2, '0'), 'NOTIFICATION_SOURCE=LinkedIn', 'FLEX=' + ['YES', 'NO', 'SOFT'][i % 3], 'SALARY_BASE_EST=$' + (150 + i % 100) + 'K-$' + (200 + i % 100) + 'K'];
    if (url) payload.push('SOURCE=' + url);
    if (i % 17 === 0) payload.push('SALARY_ANCHORS=n2 bands: A $180k-$220k https://example.invalid/a' + i + ' | B $170k-$210k https://example.invalid/b' + i);
    rows.push({ b, line: [i, id, 'Company ' + (i % 137) + (i % 137 === 0 ? ' Inc.' : ''), (i % 137 === 3 ? 'Director of Quality' : ['Director of Manufacturing', 'Plant Manager', 'VP Operations', 'Director of Quality', 'Head of Production'][i % 5] + (i % 11 === 0 ? ' - Site ' + i : '')), b, 'RESOLVED/' + b, i % 9 === 0 ? 'NEW_2026-09-30' : '-', req, ['Huntsville, AL', 'Austin, TX', 'Chattanooga, TN', 'NOT_STATED', 'Atlanta, GA'][(i * 7 + (i % 3)) % 5], payload.join('; ')].join(' | ') });
  }
  const order = ['READY_TO_PURSUE', 'DECLINED_BY_TIM', 'MANUAL_RESEARCH', 'BLOCKED', 'TIM_DECISION_REQUIRED', 'APPLIED', 'REJECTED_BY_EMPLOYER', 'DUPLICATE', 'CLOSED_DEAD'];
  lines.push('COUNTS: TOTAL=' + n + ' ' + order.map(k => k + '=' + (counts[k] || 0)).join(' ') + ' UNACCOUNTED=0');
  lines.push('COLUMNS: INV | PRIMARY_ID | COMPANY | TITLE | BUCKET | DISPOSITION/RULE_OUTCOME | TAGS | REQ | LOCATION | SCOUT_ACTION');
  lines.push('================================================================');
  for (const b of order) { const rs = rows.filter(r => r.b === b); if (!rs.length) continue; lines.push(''); lines.push('=== ' + b + ' (' + rs.length + ') ==='); rs.forEach(r => lines.push(r.line)); }
  lines.push('END V2_CURRENT_POPULATION_MASTER (' + n + ' rows)');
  return lines.join('\n');
}
module.exports = { generate };
if (require.main === module) process.stdout.write(generate(+process.argv[2] || 600, +process.argv[3] || 42));
