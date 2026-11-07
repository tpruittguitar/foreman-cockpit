const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {isMobileDevice}=require('../backlog-worksheet');
test('worksheet loopback launch is hidden on phones and iPad desktop-mode Safari',()=>{
 for(const nav of [{userAgent:'Mozilla iPhone Safari'},{userAgent:'Mozilla iPad Safari'},{userAgent:'Android Chrome'},{userAgent:'Mozilla Macintosh Safari',platform:'MacIntel',maxTouchPoints:5},{userAgentData:{mobile:true}}])a.equal(isMobileDevice(nav),true);
 for(const nav of [{userAgent:'Mozilla Windows NT 10.0 Chrome',platform:'Win32',maxTouchPoints:10},{userAgent:'Mozilla Macintosh Safari',platform:'MacIntel',maxTouchPoints:0}])a.equal(isMobileDevice(nav),false);
});
test('launcher shows exactly one availability state and never makes a network request',()=>{
 for(const mobile of [true,false]){const els={'local-worksheet':{hidden:true},'mobile-unavailable':{hidden:true}};
 const window={navigator:{userAgent:mobile?'iPhone Safari':'Windows Chrome'},document:{getElementById:id=>els[id]},fetch(){throw Error('Unexpected network request')}};
 vm.runInNewContext(fs.readFileSync('backlog-worksheet.js','utf8'),{window});a.equal(els['local-worksheet'].hidden,mobile);a.equal(els['mobile-unavailable'].hidden,!mobile);}
});
test('desktop and mobile app links resolve to a guarded, honest launcher',()=>{
 const html=fs.readFileSync('backlog-worksheet.html','utf8'),app=fs.readFileSync('pipeline.html','utf8'),phone=fs.readFileSync('pipeline-mobile.js','utf8');
 a.match(app,/class="backlog-worksheet-link" href="backlog-worksheet.html"/);a.match(phone,/class="m-worksheet-link" href="backlog-worksheet.html"/);
 a.match(html,/href="http:\/\/127\.0\.0\.1:51415\/" target="_blank" rel="noopener noreferrer" hidden/);
 a.match(html,/Not available in mobile Safari/);a.match(html,/More → Discovery backlog/);a.match(html,/does not start or check the service/);
 a.doesNotMatch(fs.readFileSync('backlog-worksheet.js','utf8'),/fetch\(|XMLHttpRequest|localStorage|sessionStorage|sendBeacon/);
});
