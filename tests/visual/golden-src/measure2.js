(function(){var o=[];[].slice.call(document.querySelectorAll('.top > *')).forEach(function(e){var r=e.getBoundingClientRect();o.push('HDR '+e.className+' x '+r.left.toFixed(0)+' w '+r.width.toFixed(0)+' sw '+e.scrollWidth)});
[].slice.call(document.querySelectorAll('.hdr-meta .seg-t')).forEach(function(e){o.push('SEG '+e.textContent+' w '+e.getBoundingClientRect().width.toFixed(0))});
var pre=document.getElementById('out')||document.createElement('pre');pre.id='out';pre.textContent=(pre.textContent||'')+'\n'+o.join('\n');document.body.appendChild(pre)})();
