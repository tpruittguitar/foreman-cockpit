/* Scoring preview: what would change if the draft scoring model were published.
 * Pure: takes rows, the scorer, and two configurations; reads nothing and writes nothing. The Explorer calls it before Publish. */
(function(root){'use strict';
var RANKED_BUCKETS=['READY_TO_PURSUE','SCOUT_INTAKE','DISCOVERY_LEAD','MANUAL_RESEARCH','TIM_DECISION_REQUIRED','BLOCKED'];
function num(v){var n=Number(v);return isFinite(n)?n:null}
function scoreOf(scoreRow,cfg,r){try{var s=scoreRow(r,cfg);return {overall:s&&s.overall!=null?s.overall:null,band:(s&&s.band)||''}}catch(e){return {overall:null,band:'',error:true}}}
function ranks(items,key){
  var rated=items.filter(function(x){return x[key].overall!=null}).sort(function(a,b){return b[key].overall-a[key].overall||(a.id<b.id?-1:a.id>b.id?1:0)});
  rated.forEach(function(x,i){x[key].rank=i+1});return rated;
}
function brief(x,key){return {id:x.id,company:x.company,title:x.title,rating:x[key].overall,rank:x[key].rank==null?null:x[key].rank,band:x[key].band}}

function compare(rows,scoreRow,beforeCfg,afterCfg,opts){
  opts=opts||{};var buckets=opts.buckets||RANKED_BUCKETS,topN=opts.topN||10,moverN=opts.movers||8;
  var items=(rows||[]).filter(function(r){return buckets.indexOf(r.BUCKET)>=0}).map(function(r){
    return {id:r.id,company:r.COMPANY||'',title:r.TITLE||'',before:scoreOf(scoreRow,beforeCfg,r),after:scoreOf(scoreRow,afterCfg,r)}});
  var errors=items.filter(function(x){return x.before.error||x.after.error}).length;
  var rb=ranks(items,'before'),ra=ranks(items,'after');
  var both=items.filter(function(x){return x.before.overall!=null&&x.after.overall!=null});
  var out={population:items.length,ratedBefore:rb.length,ratedAfter:ra.length,errors:errors,
    ratingUp:0,ratingDown:0,ratingSame:0,rankUp:0,rankDown:0,rankSame:0,bandChanges:0,avgDelta:0,maxUp:null,maxDown:null,
    newlyRated:items.filter(function(x){return x.before.overall==null&&x.after.overall!=null}).length,
    newlyUnrated:items.filter(function(x){return x.before.overall!=null&&x.after.overall==null}).length};
  var sum=0;
  both.forEach(function(x){var d=x.after.overall-x.before.overall,rd=x.before.rank-x.after.rank;x.delta=d;x.rankDelta=rd;sum+=d;
    if(d>0)out.ratingUp++;else if(d<0)out.ratingDown++;else out.ratingSame++;
    if(rd>0)out.rankUp++;else if(rd<0)out.rankDown++;else out.rankSame++;
    if(x.before.band!==x.after.band)out.bandChanges++;
    if(!out.maxUp||d>out.maxUp.delta)out.maxUp={id:x.id,company:x.company,title:x.title,delta:d,before:x.before.overall,after:x.after.overall};
    if(!out.maxDown||d<out.maxDown.delta)out.maxDown={id:x.id,company:x.company,title:x.title,delta:d,before:x.before.overall,after:x.after.overall}});
  out.avgDelta=both.length?Math.round(sum/both.length*10)/10:0;
  if(out.maxUp&&out.maxUp.delta<=0)out.maxUp=null;if(out.maxDown&&out.maxDown.delta>=0)out.maxDown=null;
  out.movers=both.filter(function(x){return x.rankDelta!==0}).sort(function(a,b){return Math.abs(b.rankDelta)-Math.abs(a.rankDelta)||(a.id<b.id?-1:1)}).slice(0,moverN)
    .map(function(x){return {id:x.id,company:x.company,title:x.title,before:brief(x,'before'),after:brief(x,'after'),rankDelta:x.rankDelta}});
  var tb=rb.slice(0,topN),ta=ra.slice(0,topN),idsB={},idsA={};tb.forEach(function(x){idsB[x.id]=1});ta.forEach(function(x){idsA[x.id]=1});
  out.top={before:tb.map(function(x){return brief(x,'before')}),after:ta.map(function(x){return brief(x,'after')}),
    entered:ta.filter(function(x){return !idsB[x.id]}).map(function(x){return brief(x,'after')}),left:tb.filter(function(x){return !idsA[x.id]}).map(function(x){return brief(x,'before')})};
  out.identical=out.errors===0&&out.ratingUp===0&&out.ratingDown===0&&out.newlyRated===0&&out.newlyUnrated===0&&out.rankUp===0&&out.rankDown===0;
  return out;
}

/* Plain-language list of what differs between two model configurations. */
function describeChanges(before,after){
  before=before||{};after=after||{};var out=[];
  var bw=before.weights||{},aw=after.weights||{};
  Object.keys(Object.assign({},bw,aw)).forEach(function(k){var b=num(bw[k]),a=num(aw[k]);if(b!==a)out.push('Weight '+k.replace(/_/g,' ')+': '+(b==null?'—':b)+' → '+(a==null?'—':a))});
  var bs=before.salary||{},as=after.salary||{};
  ['floor','target','ceiling'].forEach(function(k){if(num(bs[k])!==num(as[k]))out.push('Salary '+k+': '+(num(bs[k])==null?'—':'$'+num(bs[k]).toLocaleString('en-US'))+' → '+(num(as[k])==null?'—':'$'+num(as[k]).toLocaleString('en-US')))});
  var bsf=bs.stateFactors||{},asf=as.stateFactors||{};
  Object.keys(Object.assign({},bsf,asf)).forEach(function(k){if(num(bsf[k])!==num(asf[k]))out.push('State pay factor '+k+': '+(bsf[k]==null?'—':bsf[k])+' → '+(asf[k]==null?'—':asf[k]))});
  var bg=before.geo||{},ag=after.geo||{};
  if(num(bg.power)!==num(ag.power))out.push('Geo interpolation power: '+(bg.power==null?'—':bg.power)+' → '+(ag.power==null?'—':ag.power));
  var bp={},ap={};(bg.controlPoints||[]).forEach(function(p){bp[String(p.name||'').toLowerCase()]=p});(ag.controlPoints||[]).forEach(function(p){ap[String(p.name||'').toLowerCase()]=p});
  Object.keys(ap).forEach(function(k){var p=ap[k],o=bp[k];if(!o)out.push('Location point added: '+p.name+' (score '+p.score+(p.hard?', hard':'')+')');
    else if(num(o.score)!==num(p.score)||!!o.hard!==!!p.hard||num(o.lat)!==num(p.lat)||num(o.lon)!==num(p.lon))out.push('Location point '+p.name+': score '+o.score+(o.hard?' (hard)':'')+' → '+p.score+(p.hard?' (hard)':''))});
  Object.keys(bp).forEach(function(k){if(!ap[k])out.push('Location point removed: '+bp[k].name)});
  if(String(before.resumeKeywords||'').trim()!==String(after.resumeKeywords||'').trim())out.push('Resume / ATS keywords changed');
  return out;
}

var api={RANKED_BUCKETS:RANKED_BUCKETS,compare:compare,describeChanges:describeChanges};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PipelineScoringPreview=api;
})(typeof window!=='undefined'?window:globalThis);
