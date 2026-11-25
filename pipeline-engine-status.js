/* Engine status (forge.engine-status.v1): pure logic, no DOM. Card cs-32ab60a7 PR 1.
   Separate from PipelineControlRoom.constraint (process-flow rule) and from PipelineDataAge.DATA_STALE_MS (1 h). */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelineEngineStatus=factory();})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var SCHEMA='forge.engine-status.v1';
  var STALE_MS=90*60000;
  var EXPIRED_MS=24*3600000;
  var STAGES=['DISCOVERY','INTAKE','ENRICHMENT'];
  var STATES=['ok','degraded','missed','failed','idle'];
  var COPY={
    error:'Engine status not available',
    empty:'No steps reported yet',
    expiredTitle:'No engine status'
  };
  var fmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true});

  function num(v){return typeof v==='number'&&Number.isFinite(v);}
  function str(v){return typeof v==='string'&&v.trim()!=='';}
  function isoMs(v){if(typeof v!=='string'||!v.trim())return NaN;return Date.parse(v);}
  function nowMs(now){
    if(now==null)return Date.now();
    var t=now instanceof Date?now.getTime():now;
    return num(t)?t:NaN;
  }
  /* "Nov 23, 1:40 PM" in America/New_York, built from parts so the space before AM/PM is always a plain space. */
  function boardTime(ms){
    var p={};fmt.formatToParts(new Date(ms)).forEach(function(x){p[x.type]=x.value;});
    return p.month+' '+p.day+', '+p.hour+':'+p.minute+' '+String(p.dayPeriod||'').toUpperCase();
  }

  function stepProblems(s){
    var out=[];
    if(!s||typeof s!=='object'||Array.isArray(s))return ['step'];
    if(!str(s.id))out.push('id');
    if(!(num(s.n)&&Number.isInteger(s.n)&&s.n>=1))out.push('n');
    if(!str(s.name))out.push('name');
    if(STAGES.indexOf(s.stage)<0)out.push('stage');
    if(!str(s.method))out.push('method');
    if(!str(s.runsAs))out.push('runsAs');
    if(!str(s.schedule))out.push('schedule');
    if(!(num(s.rateIn)&&s.rateIn>=0))out.push('rateIn');
    if(!(num(s.rateOut)&&s.rateOut>=0))out.push('rateOut');
    if(!(num(s.queue)&&s.queue>=0))out.push('queue');
    if(!num(s.queueDeltaPerHour))out.push('queueDeltaPerHour');
    /* lastRunAt / nextRunAt may be absent (a step that has never run, or has no next run); if given they must parse. */
    if(s.lastRunAt!=null&&!Number.isFinite(isoMs(s.lastRunAt)))out.push('lastRunAt');
    if(s.nextRunAt!=null&&!Number.isFinite(isoMs(s.nextRunAt)))out.push('nextRunAt');
    if(typeof s.result!=='string')out.push('result');
    if(STATES.indexOf(s.state)<0)out.push('state');
    return out;
  }

  function annotate(steps){
    var list=steps.map(function(s){
      var problems=stepProblems(s),unknown=problems.length>0,base=(s&&typeof s==='object'&&!Array.isArray(s))?s:{};
      var a={};Object.keys(base).forEach(function(k){a[k]=base[k];});
      a.unknown=unknown;
      a.problems=problems;
      a.queueTrend=unknown?'UNKNOWN':(s.queueDeltaPerHour>0?'GROWING':'STEADY');
      a.isConstraint=false;
      return a;
    });
    var constraint=null;
    for(var i=0;i<list.length&&!constraint;i++){
      var s=list[i];
      if(s.unknown)continue;
      if(i>0&&list[i-1].unknown)continue;
      if(s.rateOut<s.rateIn){s.isConstraint=true;constraint=s;}
    }
    return {steps:list,constraint:constraint,growingQueues:list.filter(function(s){return s.queueTrend==='GROWING';})};
  }

  function writerOf(w){
    if(!w||typeof w!=='object'||Array.isArray(w))return null;
    var t=isoMs(w.lastWriteAt);
    return {queue:num(w.queue)?w.queue:null,ratePerHour:num(w.ratePerHour)?w.ratePerHour:null,lastWriteAt:Number.isFinite(t)?new Date(t).toISOString():null};
  }
  function readyOf(r){
    if(!r||typeof r!=='object'||Array.isArray(r))return null;
    return {count:num(r.count)?r.count:null,applied:num(r.applied)?r.applied:null,declined:num(r.declined)?r.declined:null};
  }

  function result(status,fields){
    var r={status:status,copy:null,copyDetail:null,asOf:null,asOfLabel:null,ageMs:null,steps:[],constraint:null,growingQueues:[],writer:null,readyForDecision:null};
    Object.keys(fields||{}).forEach(function(k){r[k]=fields[k];});
    return r;
  }

  function evaluate(envelope,now){
    var env=envelope;
    if(typeof env==='string'){try{env=JSON.parse(env);}catch(e){env=null;}}
    var t=nowMs(now);
    if(!env||typeof env!=='object'||Array.isArray(env)||env.schema!==SCHEMA||!Array.isArray(env.steps)||!Number.isFinite(t))return result('error',{copy:COPY.error});
    var at=isoMs(env.at);
    if(!Number.isFinite(at))return result('error',{copy:COPY.error});
    var age=t-at,label=boardTime(at),base={asOf:new Date(at).toISOString(),asOfLabel:label,ageMs:age};
    if(age>=EXPIRED_MS){
      base.copy=COPY.expiredTitle;
      base.copyDetail='Last update over 24 h ago (as of '+label+'). Steps are unknown.';
      return result('expired',base);
    }
    base.writer=writerOf(env.writer);
    base.readyForDecision=readyOf(env.readyForDecision);
    if(!env.steps.length){base.copy=COPY.empty;return result('empty',base);}
    var a=annotate(env.steps);
    base.steps=a.steps;base.constraint=a.constraint;base.growingQueues=a.growingQueues;
    if(age>=STALE_MS){base.copy='STALE · as of '+label+' ET';return result('stale',base);}
    return result('ok',base);
  }

  return {SCHEMA:SCHEMA,STALE_MS:STALE_MS,EXPIRED_MS:EXPIRED_MS,evaluate:evaluate,boardTime:boardTime};
});
