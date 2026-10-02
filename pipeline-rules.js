(function(root){
  'use strict';
  // Parse only the display outline. Preserve the original text and offsets for editing.
  function outline(text){text=String(text||'');var sections=[],current=null,offset=0;
    text.split(/\n/).forEach(function(line){var clean=line.replace(/\r$/,''),m=clean.match(/^\s*(?:SECTION\s*=\s*(.+)|#{1,4}\s+(.+)|\[([^\]]+)\])\s*$/);
      if(m){current={title:m[1]||m[2]||m[3],offset:offset,lines:[]};sections.push(current)}
      else {if(!current){current={title:'Ruleset overview',offset:0,lines:[]};sections.push(current)}current.lines.push(clean)}offset+=line.length+1;
    });return sections.filter(function(s){return s.lines.some(function(l){return l.trim()})||s.title!=='Ruleset overview'}).map(function(s,i){s.id='rule-section-'+i;return s});
  }
  var api={outline:outline};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PipelineRules=api;
})(typeof window!=='undefined'?window:globalThis);
