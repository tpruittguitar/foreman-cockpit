/* Headless Chrome check for the Office (no playwright needed: raw CDP over the chrome debugging port).
   node tools/office-collision-check.cjs dump   -> writes tests/fixtures/office-layout.json from the live office.html?demo=1 layout
   node tools/office-collision-check.cjs [secs]  -> samples every bot position for `secs` (default 60) and reports any bot inside a non-viewerOnly box
   Idle activity speed is sped up by sampling in real time only; the page runs the normal demo. */
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const repo = path.resolve(__dirname, '..');
const MIME = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2' };
const mode = process.argv[2] === 'dump' ? 'dump' : 'sample', secs = +(process.argv[mode === 'dump' ? 3 : 2]) || 60;
(async () => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost'), f = path.join(repo, decodeURIComponent(u.pathname));
    if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, r));
  const port = 9300 + Math.floor(Math.random() * 500), prof = fs.mkdtempSync('/tmp/office-chk-');
  const chrome = cp.spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
  let targets; for (let k = 0; k < 60; k++) { try { targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); if (targets.find(t => t.type === 'page')) break; } catch (e) { /* not up yet */ } await new Promise(r => setTimeout(r, 250)); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params) => new Promise(r => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
  await send('Page.navigate', { url: 'http://localhost:' + server.address().port + '/office.html?demo=1' });
  for (let k = 0; k < 120; k++) { if (await ev('!!(window.__office && window.__office.ready && window.__office.layout && window.__office.info().chars > 0)').catch(() => false)) break; await new Promise(r => setTimeout(r, 500)); }
  let code = 0;
  if (mode === 'dump') {
    const lay = await ev('JSON.stringify(window.__office.layout())');
    fs.writeFileSync(path.join(repo, 'tests/fixtures/office-layout.json'), JSON.stringify(JSON.parse(lay)) + '\n'); console.log('wrote tests/fixtures/office-layout.json');
  } else {
    const lay = JSON.parse(await ev('JSON.stringify(window.__office.layout())')), real = lay.obstacles.filter(o => !o.viewerOnly);
    const bad = new Map(), badSeat = new Map(), badPair = new Map(), SEATED = ['sit', 'type', 'game', 'meet', 'deskSleep', 'nap', 'lounge', 'bike', 'wave'];
    /* a bot may stand inside its own chair base (it sits / stands up from it): its own desk chair, or any chair it is within 0.45 m of the centre of */
    const ownChair = (n, b, x, z) => { const d = lay.desks.find(q => q.name === n); if (d && b.tag === 'desk:' + n && Math.hypot(x - d.seat.x, z - d.seat.z) < 0.5) return true; return b.tag === 'chair' && Math.hypot(x - (b.x0 + b.x1) / 2, z - (b.z0 + b.z1) / 2) < 0.45; }; let samples = 0, moved = 0, last = null;
    const t0 = Date.now();
    while (Date.now() - t0 < secs * 1000) {
      const pos = await ev('window.__office.info().positions'); samples++;
      for (const [n, x, z, pose] of pos) { const o = real.find(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && !ownChair(n, b, x, z));
        if (o && !['sit', 'type', 'game', 'meet', 'deskSleep', 'nap', 'lounge', 'bike'].includes(pose)) bad.set(n + '@' + x + ',' + z + ' in ' + (o.tag || [o.x0, o.x1, o.z0, o.z1].join(',')) + ' pose=' + pose, 1);
        if (last) { const p = last.find(q => q[0] === n); if (p && Math.hypot(p[1] - x, p[2] - z) > 0.01) moved++; } }
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) { // bot-bot: keep radius sum apart; a walker pressing into a seated bot is the failure Tim saw
        const a = pos[i], b = pos[j], gap = Math.hypot(a[1] - b[1], a[2] - b[2]) - (a[4] + b[4]), as = SEATED.includes(a[3]), bs = SEATED.includes(b[3]);
        if (as && bs) continue; if (gap < -0.12) { const k = a[0] + '/' + b[0] + (as || bs ? ' (vs seated)' : ''); (as || bs ? badSeat : badPair).set(k, Math.min(gap, badSeat.get(k) || badPair.get(k) || 0)); } }
      last = pos; await new Promise(r => setTimeout(r, 250));
    }
    const walkers = last.filter(p => p[3] === 'walk').length;
    console.log('RESULT: ' + last.length + ' bots, ' + samples + ' samples over ' + secs + ' s, ' + moved + ' moves seen, ' + bad.size + ' standing/walking samples inside a non-viewerOnly box (chair bases included), ' + badSeat.size + ' walker-vs-seated and ' + badPair.size + ' walker-vs-walker pairs closer than the radius sum by > 0.12 m' + (badSeat.size ? ' [' + [...badSeat].slice(0, 5).map(([k, v]) => k + ' ' + v.toFixed(2)).join('; ') + ']' : '') + (bad.size ? ': ' + [...bad.keys()].slice(0, 8).join('; ') : ''));
    if (bad.size || badSeat.size) code = 1;
  }
  ws.close(); chrome.kill(); server.close(); setTimeout(() => process.exit(code), 200);
})().catch(e => { console.error(e); process.exit(2); });
