const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const s=fs.readFileSync(path.join(__dirname,'..','pipeline.html'),'utf8');
// Tim 2026-11-03: a job that repeats a role he already applied to, was rejected from, or declined stays visible with that history
// (forge-coordination tools/applied-duplicates stamps PRIOR_APPLICATION). The label shows under the title and in the job header.
test('list title cell shows the PRIOR_APPLICATION label with its evidence as the tooltip',()=>{assert.match(s,/else if\(c==='TITLE'\)\{var pa=\(r\.payload\|\|\{\}\)\.PRIOR_APPLICATION;v=esc\(v\)\+\(pa\?'<span class="write-tag prior-tag"/);assert.match(s,/PRIOR_APPLICATION_EVIDENCE\|\|''\)\+'">'\+esc\(pa\)/)});
test('job header repeats the label for the open job',()=>{assert.match(s,/\(r\.payload\.PRIOR_APPLICATION\?' · <span class="write-tag prior-tag" style="display:inline"/)});
test('label text is always escaped',()=>{assert.doesNotMatch(s,/\+pa\+|\+r\.payload\.PRIOR_APPLICATION\+/)});
