/* Dependency-free SVG charts. Null measurements remain unknown. */
(function(root){
  'use strict';
  var colors=['#e3e6e4','#a6ada9','#747c77','#c9ceca','#8e9690','#59625c','#d6dad6','#b3bab4','#676f69','#959d96','#c1c7c0','#7f8780'];
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function number(v){return Number(v).toLocaleString('en-US',{maximumFractionDigits:1})}
  function data(items){return items.map(function(x,i){return {label:String(x.label),value:x.value==null||!Number.isFinite(Number(x.value))?null:Math.max(0,Number(x.value)),color:x.color||colors[i%colors.length],filter:x.filter}})}
  function action(x){return x.filter?' data-chart-filter="'+esc(JSON.stringify(x.filter))+'" tabindex="0" role="button" aria-label="Filter table: '+esc(x.label)+'"':''}
  function svg(title,body,w,h){return '<svg class="chart-svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(title)+'"><title>'+esc(title)+'</title>'+body+'</svg>'}
  function bars(title,items,opts){opts=opts||{};items=data(items);var w=opts.compact?350:520,left=opts.compact?120:174,track=opts.compact?180:275,h=Math.max(90,items.length*31+12),max=opts.max||Math.max.apply(null,[1].concat(items.map(function(x){return x.value||0}))),unit=opts.unit||'',b='';
    if(!items.length)return svg(title,'<text x="260" y="60" text-anchor="middle" fill="#939b94" font-size="14">No recorded data</text>',w,120);
    items.forEach(function(x,i){var y=i*31+10,limit=opts.compact?17:24,label=x.label.length>limit?x.label.slice(0,limit-1)+'…':x.label;
      b+='<g'+action(x)+'><rect x="0" y="'+(y-3)+'" width="'+w+'" height="26" fill="transparent"/><title>'+esc(x.label)+': '+(x.value==null?'Unknown':number(x.value)+unit)+'</title><text x="0" y="'+(y+12)+'" fill="#c6ccc7" font-size="12">'+esc(label)+'</text><rect x="'+left+'" y="'+y+'" width="'+track+'" height="17" rx="0" fill="#202421"/>';
      if(x.value!=null)b+='<rect x="'+left+'" y="'+y+'" width="'+Math.min(track,track*x.value/max).toFixed(2)+'" height="17" rx="0" fill="'+x.color+'"/>';
      b+='<text x="'+(w-5)+'" y="'+(y+13)+'" text-anchor="end" fill="'+x.color+'" font-size="12">'+(x.value==null?'—':number(x.value)+unit)+'</text></g>';
    });return svg(title,b,w,h);
  }
  function donut(title,items,opts){opts=opts||{};items=data(items);var compact=!!opts.compact,cx=compact?60:90,cy=compact?65:90,r=compact?44:64,legendX=compact?130:195,labelX=compact?145:213,valueX=compact?345:493;
    var total=items.reduce(function(n,x){return n+(x.value||0)},0),offset=0,circ=2*Math.PI*r,b='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="#202421" stroke-width="23"/>';
    items.forEach(function(x){if(!x.value||!total)return;var len=x.value/total*circ;b+='<circle'+action(x)+' cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+x.color+'" stroke-width="23" stroke-dasharray="'+len.toFixed(3)+' '+(circ-len).toFixed(3)+'" stroke-dashoffset="'+(-offset).toFixed(3)+'" transform="rotate(-90 '+cx+' '+cy+')"><title>'+esc(x.label)+': '+number(x.value)+' ('+number(x.value/total*100)+'%)</title></circle>';offset+=len});
    b+='<text x="'+cx+'" y="'+(cy-1)+'" text-anchor="middle" fill="#fff" font-size="30" font-weight="700">'+number(total)+'</text><text x="'+cx+'" y="'+(cy+20)+'" text-anchor="middle" fill="#939b94" font-size="11">'+esc(opts.unit||'rows')+'</text>';
    var h=compact?Math.max(125,items.length*24+8):Math.max(180,items.length*24+8);items.forEach(function(x,i){var y=i*24+16;b+='<g'+action(x)+'><rect x="'+legendX+'" y="'+(y-15)+'" width="'+(valueX-legendX+10)+'" height="24" fill="transparent"/><rect x="'+legendX+'" y="'+(y-9)+'" width="9" height="9" rx="0" fill="'+x.color+'"/><text x="'+labelX+'" y="'+y+'" fill="#c6ccc7" font-size="12">'+esc(x.label)+'</text><text x="'+valueX+'" y="'+y+'" text-anchor="end" fill="'+x.color+'" font-size="12">'+(x.value==null?'—':number(x.value))+'</text></g>'});
    if(!total)b+='<text x="'+cx+'" y="'+(cy+55)+'" text-anchor="middle" fill="#939b94" font-size="11">No recorded data</text>';
    return svg(title,b,compact?350:505,h);
  }
  function columns(title,items){items=data(items);var w=520,h=210,max=Math.max.apply(null,[1].concat(items.map(function(x){return x.value||0}))),step=460/Math.max(1,items.length),b='';
    if(!items.length)return svg(title,'<text x="260" y="100" text-anchor="middle" fill="#939b94" font-size="14">No recorded data</text>',w,h);
    [0,.5,1].forEach(function(f){var y=168-f*133;b+='<line x1="38" x2="510" y1="'+y+'" y2="'+y+'" stroke="#323833"/><text x="30" y="'+(y+4)+'" text-anchor="end" fill="#858e86" font-size="11">'+number(max*f)+'</text>'});
    items.forEach(function(x,i){var x0=42+i*step,bh=x.value==null?0:133*x.value/max;b+='<g'+action(x)+'><rect x="'+(x0-4)+'" y="22" width="'+step+'" height="178" fill="transparent"/><title>'+esc(x.label)+': '+(x.value==null?'Unknown':number(x.value))+'</title><rect x="'+x0+'" y="'+(168-bh)+'" width="'+Math.max(2,step*.66)+'" height="'+bh+'" rx="0" fill="'+x.color+'"/><text x="'+(x0+step*.33)+'" y="'+(160-bh)+'" text-anchor="middle" fill="'+x.color+'" font-size="11">'+(x.value==null?'—':number(x.value))+'</text><text x="'+(x0+step*.33)+'" y="188" text-anchor="middle" fill="#adb5ad" font-size="10">'+esc(x.label.length>12?x.label.slice(0,11)+'…':x.label)+'</text></g>'});
    return svg(title,b,w,h);
  }
  var api={colors:colors,bars:bars,donut:donut,columns:columns,data:data};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PipelineCharts=api;
})(typeof window!=='undefined'?window:globalThis);
