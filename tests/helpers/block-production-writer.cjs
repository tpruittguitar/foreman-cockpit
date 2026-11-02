/* Every browser test loads this before launching Chromium. No page may reach the production Writer
   (Google Apps Script). Reads and writes in tests go to the local fixture server. A context route aborts
   the hosts at context creation, before any page script runs. The CI guard (ci-net-guard.cjs) does the
   same again when the compare workflow loads it; registering twice is safe. */
const pw = require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const BLOCKED = /(^|\.)script\.google\.com$|(^|\.)script\.googleusercontent\.com$|(^|\.)script\.googleapis\.com$/i;
function blocked(u) { try { return BLOCKED.test(u.hostname); } catch (e) { return false; } }
if (pw.chromium && !pw.chromium.__blockWriter) {
  const launch = pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch = async function (o) {
    const b = await launch(o);
    const nc = b.newContext.bind(b), np = b.newPage.bind(b);
    const guard = async c => { await c.route(blocked, r => r.abort()); return c; };
    b.newContext = async function (o2) { return guard(await nc(o2)); };
    b.newPage = async function (o2) { const p = await np(o2); await guard(p.context()); return p; };
    return b;
  };
  pw.chromium.__blockWriter = true;
}
