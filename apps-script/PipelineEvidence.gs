/* Read-time compatibility for current and legacy pipeline evidence. Never mutates canonical rows. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.PipelineEvidence=factory();
}(typeof self!=='undefined'?self:this,function(){
  'use strict';
  function present(v){return v!==undefined&&v!==null&&String(v).trim()!==''&&!/^(UNKNOWN|NOT_STATED|NOT STATED|TBD|—|-)$/i.test(String(v).trim())}
  function score(v){if(!present(v))return null;var n=parseFloat(String(v).replace(/[%,$\s]/g,''));if(!isFinite(n))return null;if(n>=0&&n<=1)n*=100;return n>=0&&n<=100?n:null}
  function moneyNumbers(v){
    if(!present(v))return[];
    return (String(v).replace(/https?:\/\/\S+/gi,' ').replace(/,/g,'').match(/\$?\s*\d+(?:\.\d+)?\s*[kK]?/g)||[]).map(function(t){
      var m=t.match(/(\d+(?:\.\d+)?)\s*([kK])?/),n=m?parseFloat(m[1]):NaN;
      if(!isFinite(n))return null;if(m[2])n*=1000;else if(n<1000)n*=1000;
      return n>=50000&&n<=2000000?n:null;
    }).filter(function(n){return n!=null});
  }
  function midpoint(v){var a=moneyNumbers(v);return a.length?(Math.min.apply(null,a)+Math.max.apply(null,a))/2:null}
  var FIT_KEYS=['SCOPE_FIT_RAW','GROK_SCOPE_FIT_RAW','RAW_FIT','EXPERIENCE_FIT_SCORE','EXPERIENCE_FIT','FIT_SCORE','FIT_PCT','WORK_CONTENT_FIT','FIT'];
  function fit(p){
    p=p||{};
    var keys=FIT_KEYS;
    for(var i=0;i<keys.length;i++){var n=score(p[keys[i]]);if(n!=null)return{value:n,source:keys[i],legacy:keys[i]!=='SCOPE_FIT_RAW'}}
    return{value:null,source:'',legacy:false};
  }
  function salary(p){
    p=p||{};var direct=['SALARY_BASE_POSTED','PAY_POSTED','SALARY_BASE_EST'];
    function range(v,source,legacy){var a=moneyNumbers(v);if(!a.length)return null;var lo=Math.min.apply(null,a),hi=Math.max.apply(null,a);return{low:lo,high:hi,mid:(lo+hi)/2,scorePoint:lo+0.75*(hi-lo),source:source,legacy:legacy}}
    var canonicalLow=moneyNumbers(p.SALARY_BASE_LOW),canonicalHigh=moneyNumbers(p.SALARY_BASE_HIGH);
    if(/^(EMPLOYER_POSTED|FORGE-ESTIMATE|THIRD_PARTY_ESTIMATE)$/.test(p.SALARY_BASIS||'')&&canonicalLow.length&&canonicalHigh.length&&canonicalHigh[0]>=canonicalLow[0])return{low:canonicalLow[0],high:canonicalHigh[0],mid:(canonicalLow[0]+canonicalHigh[0])/2,scorePoint:canonicalLow[0]+0.75*(canonicalHigh[0]-canonicalLow[0]),source:'SALARY_BASE_LOW/HIGH',legacy:false};
    for(var i=0;i<direct.length;i++){var out=range(p[direct[i]],direct[i],false);if(out)return out}
    var lo=moneyNumbers(p.SALARY_BASE_LOW),hi=moneyNumbers(p.SALARY_BASE_HIGH);
    if(lo.length&&hi.length&&hi[0]>=lo[0])return{low:lo[0],high:hi[0],mid:(lo[0]+hi[0])/2,scorePoint:lo[0]+0.75*(hi[0]-lo[0]),source:'SALARY_BASE_LOW/HIGH',legacy:true};
    var mid=midpoint(p.SALARY_MIDPOINT);if(mid!=null)return{mid:mid,scorePoint:mid,source:'SALARY_MIDPOINT',legacy:true};
    var legacy=['GROK_SALARY','SALARY_POSTED','PAY','SALARY_ESTIMATED','SALARY_RECRUITER_RANGE','SALARY_AGGREGATOR_RANGE'];
    for(var j=0;j<legacy.length;j++){var x=range(p[legacy[j]],legacy[j],true);if(x)return x}
    return{mid:null,source:'',legacy:false};
  }
  return{present:present,score:score,fit:fit,salary:salary,moneyNumbers:moneyNumbers,FIT_KEYS:FIT_KEYS};
}));
