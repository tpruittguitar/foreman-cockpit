/* Desired schedules are distinct from native provider observations. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelineScheduler=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var DAYS=['SU','MO','TU','WE','TH','FR','SA'];
  function empty(){return {schema:1,revision:0,updatedAt:'',tasks:[],history:[]};}
  function validate(t){
    if(!t.key||!t.provider||!t.owner||typeof t.enabled!=='boolean')throw new Error('SCHEDULE_IDENTITY_REQUIRED');
    try{new Intl.DateTimeFormat('en',{timeZone:t.timezone}).format();}catch(e){throw new Error('INVALID_TIMEZONE');}
    if(!/^\d\d:\d\d$/.test(t.time)||+t.time.slice(0,2)>23||+t.time.slice(3)>59)throw new Error('INVALID_CLOCK');
    if(!Array.isArray(t.days)||!t.days.length||t.days.some(function(d){return DAYS.indexOf(d)<0;}))throw new Error('INVALID_WEEKDAYS');
    if(t.expiresAt&&!Number.isFinite(Date.parse(t.expiresAt)))throw new Error('INVALID_EXPIRATION');
    if(t.effectiveAt&&!Number.isFinite(Date.parse(t.effectiveAt)))throw new Error('INVALID_START');
    if(t.lane==='freeze'&&(t.time!=='07:00'||t.timezone!=='America/New_York'))throw new Error('FREEZE_0700_ET_PROTECTED');
    if(t.key.toLowerCase().indexOf('relay')>=0||String(t.lane).toLowerCase().indexOf('relay')>=0)throw new Error('RECOVERY_RELAY_DEFERRED');
    return t;
  }
  function edit(manifest,task,revision,at){
    if(revision!==manifest.revision)throw new Error('REVISION_CONFLICT');validate(task);
    var out=JSON.parse(JSON.stringify(manifest)),old=out.tasks.find(function(t){return t.key===task.key;});
    if(old&&old.enabled===false&&task.enabled)throw new Error('PAUSED_TASK_REACTIVATION_REQUIRES_EXPLICIT_APPROVAL');
    if(task.lane==='freeze'&&task.enabled&&out.tasks.some(function(t){return t.key!==task.key&&t.lane==='freeze'&&t.enabled;}))throw new Error('DUPLICATE_FREEZE_OWNER');
    (task.dependencies||[]).forEach(function(key){if(key===task.key||!out.tasks.some(function(t){return t.key===key;}))throw new Error('DEPENDENCY_MISSING_OR_SELF');});
    var proposed=Object.assign({},task,{status:'PENDING_MANUAL',approvedRevision:0,actual:old&&old.actual||null});
    out.tasks=out.tasks.filter(function(t){return t.key!==task.key;}).concat([proposed]);out.history.push({at:at,key:task.key,before:old||null,after:proposed});out.revision++;out.updatedAt=at;return out;
  }
  function status(t,now){
    if(t.expiresAt&&Date.parse(t.expiresAt)<=now)return 'EXPIRED';
    if(!t.actual||!t.actual.readbackAt||!t.actual.providerEvidence)return t.status==='UNSUPPORTED'?'UNSUPPORTED':'PENDING_MANUAL';
    var a=t.actual;return t.enabled===a.enabled&&t.time===a.time&&t.timezone===a.timezone&&JSON.stringify(t.days)===JSON.stringify(a.days)&&t.approvedRevision>0?'VERIFIED_SYNC':'DRIFT';
  }
  function upcoming(t,now,count){
    validate(t);var fmt=new Intl.DateTimeFormat('en-CA',{timeZone:t.timezone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    function parts(ms){var p={};fmt.formatToParts(new Date(ms)).forEach(function(x){p[x.type]=x.value;});return p;}
    var out=[],today=parts(now),base=Date.UTC(+today.year,+today.month-1,+today.day),map={Sun:'SU',Mon:'MO',Tue:'TU',Wed:'WE',Thu:'TH',Fri:'FR',Sat:'SA'};
    for(var day=0;day<40&&out.length<(count||5);day++){
      var date=new Date(base+day*86400000),wanted=date.toISOString().slice(0,10),guess=Date.parse(wanted+'T'+t.time+':00Z');
      for(var n=0;n<3;n++){var p=parts(guess),local=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute),target=Date.parse(wanted+'T'+t.time+':00Z');guess+=target-local;}
      var final=parts(guess);
      // Nonexistent spring-forward clock has no occurrence; fall-back uses the earliest matching clock.
      var candidates=[guess-3600000,guess,guess+3600000].filter(function(ms){var p=parts(ms);return [p.year,p.month,p.day].join('-')===wanted&&p.hour+':'+p.minute===t.time;}).sort(function(a,b){return a-b;});
      var at=candidates[0];
      if(at!=null&&at>now&&t.enabled&&t.days.indexOf(map[final.weekday])>=0&&(!t.effectiveAt||at>=Date.parse(t.effectiveAt))&&(!t.expiresAt||at<Date.parse(t.expiresAt)))out.push(new Date(at).toISOString());
    }
    return out;
  }
  function warnings(manifest,now){var out=[];manifest.tasks.forEach(function(t){(t.dependencies||[]).forEach(function(key){var d=manifest.tasks.find(function(x){return x.key===key;});if(!d||!d.enabled)out.push(t.key+': dependency '+key+' unavailable');else{var a=upcoming(t,now,1)[0],b=upcoming(d,now,1)[0];if(a&&b&&a<=b)out.push(t.key+': next run precedes dependency '+key);}});});return out;}
  return {empty:empty,validate:validate,edit:edit,status:status,upcoming:upcoming,warnings:warnings};
});
