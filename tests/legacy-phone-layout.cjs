/* Test helper (mobile shell Stage 2, Tim 2026-11-02). Harness only: nothing here ships.
   JOB: keep test coverage of the OLD phone layout, which is
     (a) permanent for touch tablets 768-980 px wide (they keep the old layout until the tablet follow-up), and
     (b) TEMPORARY at phone sizes (<= 767 px): only until the mobile shell's own checks replace it (Stage 3: Decide
         cards and score colours; Stage 4: Jobs fields and table). Each phone test using this names its retiring stage.
   HOW: mobile (isMobile) browser contexts receive pipeline.html without the mobile shell; desktop contexts load the real
   page unchanged, so every desktop check still runs against the shipped page. The new phone layout is covered by
   tests/mobile-shell.browser.js. */
const fs=require('fs'),path=require('path');
const pw=require(process.env.PIPELINE_PLAYWRIGHT_MODULE||'playwright');
const repo=path.resolve(__dirname,'..');
function legacyHtml(){
  const html=fs.readFileSync(path.join(repo,'pipeline.html'),'utf8')
    .replace('<script src="pipeline-mobile.js"></script>','')
    .replace(/\(function\(\)\{try\{var d=document\.documentElement;if\(!d\.classList\.contains\('force-desktop'\)&&matchMedia\([^\n]*\n/,'\n');
  if(html.includes('src="pipeline-mobile.js"')||html.includes("d.classList.add('m-shell')"))throw Error('legacy-phone-layout: could not remove the mobile shell from pipeline.html');
  return html;
}
const launch=pw.chromium.launch;
pw.chromium.launch=async function(){const b=await launch.apply(this,arguments),ctx=b.newContext.bind(b);
  b.newContext=async function(o){const c=await ctx(o);if(o&&o.isMobile){const html=legacyHtml();await c.route('**/pipeline.html*',r=>r.fulfill({contentType:'text/html',body:html}))}return c};
  return b};
