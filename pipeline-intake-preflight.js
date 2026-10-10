'use strict';
/* Pure, provider-neutral preflight. No writes, no networking, no silent candidate removal. */
const crypto = require('node:crypto');

function validate(request) {
  const errors = [];
  const body = request && (request.body || request);
  if (!body || body.action !== 'intake' || !Array.isArray(body.records))
    return {ok:false,errors:['INTAKE_SCHEMA: action=intake and records array required']};
  const run=body.run||{};
  const ids=new Set();
  body.records.forEach((r,i)=>{
    if (!r || typeof r!=='object') {errors.push('INVALID_RECORD:'+i);return;}
    const id=String(r.INTAKE_KEY||'').trim();
    if (!id) errors.push('MISSING_INTAKE_KEY:'+i);
    if (id && ids.has(id)) errors.push('DUPLICATE_INTAKE_KEY:'+id);
    ids.add(id);
    if (!r.COMPANY || !r.TITLE) errors.push('MISSING_IDENTITY:'+i);
    if (!r.INITIATING_URL && !r.SOURCE_URL) errors.push('MISSING_SOURCE_URL:'+i);
  });
  if (!body.requestId && !run.SCOUT_RUN_ID) errors.push('MISSING_STABLE_REQUEST_ID');
  const ledger=run.DISPOSITION_LEDGER;
  const gross=Number(run.GROSS_FOUND);
  if (!Number.isSafeInteger(gross)||gross<0) errors.push('GROSS_FOUND_NOT_INTEGER');
  if (!Array.isArray(ledger)) errors.push('DISPOSITION_LEDGER_REQUIRED');
  else {
    const dispositions=new Set(['SUBMITTED','EXISTING','NEVER_CONSIDER','OFF_TARGET_PRE_GROSS','IDENTITY_HOLD','UNRESOLVED','CARRY_FORWARD']);
    const seen=new Set();let grossLedger=0,submitted=0;
    ledger.forEach((x,i)=>{
      const key=String(x && x.candidateId||'');
      if (!key || seen.has(key)) errors.push('LEDGER_ID_INVALID_OR_DUPLICATE:'+i);
      seen.add(key);
      if (!x || !dispositions.has(x.disposition)) errors.push('LEDGER_DISPOSITION_INVALID:'+i);
      if (!x || !x.sourceMessageId || !x.initiatingUrl) errors.push('LEDGER_SOURCE_MISSING:'+i);
      if (x && x.disposition!=='OFF_TARGET_PRE_GROSS') grossLedger++;
      if (x && x.disposition==='SUBMITTED') submitted++;
    });
    if (grossLedger!==gross) errors.push('GROSS_LEDGER_MISMATCH:'+gross+'/'+grossLedger);
    if (submitted!==body.records.length) errors.push('SUBMITTED_LEDGER_MISMATCH:'+body.records.length+'/'+submitted);
  }
  const wire=JSON.stringify(body),roundTrip=JSON.parse(wire);
  if (roundTrip.records.length!==body.records.length) errors.push('ROUNDTRIP_RECORD_MISMATCH');
  return {ok:errors.length===0,errors,stats:{gross,records:body.records.length,ledger:Array.isArray(ledger)?ledger.length:0},byteLength:Buffer.byteLength(wire,'utf8'),sha256:crypto.createHash('sha256').update(wire).digest('hex'),wire};
}
module.exports={validate};
