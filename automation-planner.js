/* Pure schedule calculations. Unsupported rules fail closed; UTC instants keep DST correct. */
(function(root){'use strict';
const MIN=60000;
function field(spec,value,min,max){
 if(!/^[\d*,/\-]+$/.test(spec))throw Error('Unsupported cron field: '+spec);
 return spec.split(',').some(part=>{const [base,stepText]=part.split('/'),step=stepText===undefined?1:Number(stepText);if(!Number.isInteger(step)||step<1)throw Error('Invalid cron step');let lo,hi;if(base==='*'){lo=min;hi=max;}else{const b=base.split('-').map(Number);lo=b[0];hi=b.length===2?b[1]:stepText===undefined?lo:max;}if(lo<min||hi>max||lo>hi)throw Error('Invalid cron bounds');return value>=lo&&value<=hi&&(value-lo)%step===0;});
}
function cronMatch(cron,date){const p=cron.trim().split(/\s+/);if(p.length!==5)throw Error('Unsupported cron');const dom=field(p[2],date.getUTCDate(),1,31),dow=field(p[4],date.getUTCDay(),0,7)||date.getUTCDay()===0&&field(p[4],7,0,7);return field(p[0],date.getUTCMinutes(),0,59)&&field(p[1],date.getUTCHours(),0,23)&&field(p[3],date.getUTCMonth()+1,1,12)&&(p[2]==='*'?dow:p[4]==='*'?dom:dom||dow);}
function ruleMatch(rule,date,zone){
 const line=String(rule).split('\n').find(x=>x.startsWith('RRULE:'))||String(rule);
 const r=Object.fromEntries(line.replace(/^RRULE:/,'').split(';').map(x=>x.split('=')));
 if(!['HOURLY','DAILY','WEEKLY'].includes(r.FREQ)||Object.keys(r).some(k=>!['FREQ','BYHOUR','BYMINUTE','BYSECOND','BYDAY','INTERVAL'].includes(k))||(r.INTERVAL&&r.INTERVAL!=='1')||(r.BYSECOND&&r.BYSECOND!=='0'))throw Error('Unsupported recurrence');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',hour:'2-digit',minute:'2-digit',weekday:'short'}).formatToParts(date).map(x=>[x.type,x.value]));
 if(!r.BYMINUTE||r.FREQ!=='HOURLY'&&!r.BYHOUR||r.FREQ==='WEEKLY'&&!r.BYDAY)throw Error('Recurrence lacks explicit time');
 for(const [key,max] of [['BYHOUR',23],['BYMINUTE',59]])if(r[key]&&(!/^\d+(,\d+)*$/.test(r[key])||r[key].split(',').some(v=>+v>max)))throw Error('Invalid recurrence time');
 if(r.BYDAY&&!/^(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$/.test(r.BYDAY))throw Error('Unsupported recurrence day');
 const matches=(s,v)=>!s||s.split(',').some(x=>typeof v==='number'?Number(x)===v:x===v);
 return matches(r.BYHOUR,+parts.hour)&&matches(r.BYMINUTE,+parts.minute)&&matches(r.BYDAY,parts.weekday.slice(0,2).toUpperCase());
}
function occurrences(task,start,end){const out=[];for(let t=Math.ceil(start/MIN)*MIN;t<end;t+=MIN){const d=new Date(t);if(task.crons?task.crons.some(c=>cronMatch(c,d)):ruleMatch(task.rrule,d,task.timezone||'America/New_York'))out.push(t);}return out;}
function windows(tasks,now,durationMinutes,horizonHours=24){
 const duration=durationMinutes*MIN,blocks=[];
 for(const t of tasks){if(t.status!=='ACTIVE')continue;if(!(t.durationMinutes>0))throw Error('Duration missing: '+t.name);for(const at of occurrences(t,now-t.durationMinutes*MIN,now+horizonHours*60*MIN))blocks.push({start:at-2*MIN,end:at+(t.durationMinutes+2)*MIN,name:t.name});}
 blocks.sort((a,b)=>a.start-b.start);const merged=[];for(const b of blocks){const last=merged[merged.length-1];if(last&&b.start<=last.end)last.end=Math.max(last.end,b.end);else merged.push({...b});}
 const result=[];let cursor=now;for(const b of merged){if(b.start-cursor>=duration)result.push({start:cursor,end:b.start});cursor=Math.max(cursor,b.end);}const end=now+horizonHours*60*MIN;if(end-cursor>=duration)result.push({start:cursor,end});return result;
}
function workflow(text,file,repo){
 const crons=[...text.matchAll(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/gm)].map(x=>x[1]);
 const name=(text.match(/^name:\s*(.+)$/m)||[])[1]||file;
 const minutes=[...text.matchAll(/^\s*timeout-minutes:\s*(\d+)/gm)].map(x=>+x[1]);
 const jobs=(text.split(/^jobs:\s*$/m)[1]||'').match(/^  [\w-]+:\s*$/gm)||[];
 const group=(text.match(/^\s*group:\s*(.+)$/m)||[])[1]||'No workflow concurrency group';
 return {name:name.replace(/^['"]|['"]$/g,''),file,repo,crons,status:'ACTIVE',manual:/^\s*workflow_dispatch\s*:/m.test(text),durationMinutes:minutes.reduce((a,b)=>a+b,0)+Math.max(0,jobs.length-minutes.length)*360||360,durationBasis:'sum of job timeouts; unspecified jobs reserve the GitHub default six hours',group,cancels:/cancel-in-progress:\s*true/.test(text),inputs:/^\s+inputs:\s*$/m.test(text)};
}
function native(task,readback){const schedule=task.rrule||(/^Hourly :(\d{2})/.test(task.schedule||'')?'RRULE:FREQ=HOURLY;BYMINUTE='+Number(task.schedule.match(/:(\d{2})/)[1])+';BYSECOND=0':null);return {...task,name:task.name||task.taskKey,rrule:schedule,timezone:task.timezone||readback.timezone||'America/New_York',observedAt:task.observedAt||readback.at,durationMinutes:null};}
function fresh(at,now,maxHours=24){const age=now-Date.parse(at);return Number.isFinite(age)&&age>=-5*MIN&&age<=maxHours*60*MIN;}
const api={field,cronMatch,ruleMatch,occurrences,windows,workflow,native,fresh};if(typeof module==='object'&&module.exports)module.exports=api;else root.AutomationPlanner=api;
})(typeof self!=='undefined'?self:this);
