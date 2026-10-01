/**
 * One-time AMD59 stranded-intake recovery worker.
 *
 * PURPOSE
 * - Runs inside the same Google Apps Script project as Code.gs, under Tim's Google account.
 * - Does NOT use the HTTP endpoint and does NOT require/expose PASSPHRASE.
 * - Reads the already-filed recovery transport artifact from AI_Coordination.
 * - Replays ONLY E1/E2/E3 intake records through the existing, tested applyIntakeToMaster_().
 * - Leaves U-01..U-04 application-history upserts and H-01 Oatey untouched.
 * - Writes a plain-text receipt into AI_Coordination with writer outcomes and master readback.
 *
 * DELETE/RETAIN
 * Keep for audit until the recovery is complete. Do not wire this function to a recurring trigger.
 */

var AMD59_RECOVERY_REQUEST_ID = '1CvCnuEiZAg2tR1A-9R29DK8jyc8L8rUb';
var AMD59_AI_COORDINATION_FOLDER_ID = '1DhaxVZSTRNQfJlWSMilmBomx__VUjmO7';
var AMD59_E3_RECOVERY_RUN_ID = 'RECOVERY-AMD59-20261001-E3';

function recoverAmd59StrandedIntake20261001() {
  var requestText = DriveApp.getFileById(AMD59_RECOVERY_REQUEST_ID).getBlob().getDataAsString('UTF-8');
  if (!requestText || requestText.indexOf('FOREMAN AMD59 STRANDED INTAKE') < 0) {
    throw new Error('Recovery request missing or wrong file: ' + AMD59_RECOVERY_REQUEST_ID);
  }

  var parsed = parseAmd59Recovery_(requestText);
  if (parsed.E1.length !== 15 || parsed.E2.length !== 16 || parsed.E3.length !== 7) {
    throw new Error(
      'Recovery parse count mismatch. Expected E1=15 E2=16 E3=7; got E1=' +
      parsed.E1.length + ' E2=' + parsed.E2.length + ' E3=' + parsed.E3.length
    );
  }

  var masterBefore = readMaster_();
  var beforeCounts = findMasterLine_(masterBefore.text, /^COUNTS:/);
  var beforeEnd = findMasterLine_(masterBefore.text, /^END V2_CURRENT_POPULATION_MASTER/);

  var envelopes = [
    {
      name: 'E1',
      run: {
        SCOUT_RUN_ID: 'GROK07-20261001-0612ET-07089bfe',
        GROSS_FOUND: 15,
        NOTE: 'AMD59 stranded-intake recovery replay from Drive request ' + AMD59_RECOVERY_REQUEST_ID
      },
      records: parsed.E1
    },
    {
      name: 'E2',
      run: {
        SCOUT_RUN_ID: 'GROK07-20261001-1707ET-07089bfe',
        GROSS_FOUND: 16,
        PRIOR_RUN_ID: 'GROK07-20261001-0612ET-07089bfe',
        NOTE: 'AMD59 stranded-intake recovery replay from Drive request ' + AMD59_RECOVERY_REQUEST_ID
      },
      records: parsed.E2
    },
    {
      name: 'E3',
      run: {
        SCOUT_RUN_ID: AMD59_E3_RECOVERY_RUN_ID,
        GROSS_FOUND: 7,
        ORIGINAL_SCOUT_RUN_ID: 'NOT PROVIDED',
        ORIGINAL_RETURN_DRIVE_ID: '1QGhgKp5d5bfevXoRy9O6mDfSc63frTKMIxGCKbFu3Fk',
        NOTE: 'Recovery-specific run id. Original run id was not provided and was not fabricated.'
      },
      records: parsed.E3
    }
  ];

  var results = [];
  for (var i = 0; i < envelopes.length; i++) {
    var env = envelopes[i];
    var out = applyIntakeToMaster_({
      action: 'intake',
      run: env.run,
      records: env.records
    });
    results.push({ envelope: env.name, output: out });
    if (!out || !out.ok) {
      writeAmd59RecoveryReceipt_(masterBefore, null, results, 'FAILED', 'Envelope ' + env.name + ' failed');
      throw new Error('AMD59 recovery failed in ' + env.name + ': ' + JSON.stringify(out));
    }
  }

  var masterAfter = readMaster_();
  var afterCounts = findMasterLine_(masterAfter.text, /^COUNTS:/);
  var afterEnd = findMasterLine_(masterAfter.text, /^END V2_CURRENT_POPULATION_MASTER/);

  var terminal = allIntakeOutputsVerified_(results) ? 'VERIFIED' : 'FAILED';
  writeAmd59RecoveryReceipt_(masterBefore, masterAfter, results, terminal, '');

  if (terminal !== 'VERIFIED') {
    throw new Error('Recovery completed writes but verification contract did not pass. Inspect receipt.');
  }

  return {
    ok: true,
    status: 'MASTER_WRITE=VERIFIED',
    requestId: AMD59_RECOVERY_REQUEST_ID,
    intakeRecords: 38,
    applicationUpsertsDeferred: 4,
    holdDeferred: 1,
    masterModifiedBefore: masterBefore.modifiedTime,
    masterModifiedAfter: masterAfter.modifiedTime,
    countsBefore: beforeCounts,
    countsAfter: afterCounts,
    endBefore: beforeEnd,
    endAfter: afterEnd,
    envelopes: results
  };
}

function parseAmd59Recovery_(text) {
  var out = { E1: [], E2: [], E3: [] };
  var re = /---\s+(E[123]-\d+)(?:[^\n]*)---\s*\n([\s\S]*?)(?=\n---\s+E[123]-\d+|\n={20,}|\nAPPLICATION-HISTORY UPSERTS|\nHOLD — NO REQUEST PREPARED|$)/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var id = m[1];
    var rec = parseKeyValueBlock_(m[2]);
    rec.RECOVERY_RECORD_ID = id;

    // Translate handoff names to the existing intake contract.
    if (rec.PROPOSED_STATE && !rec.PROPOSED_BUCKET) {
      var b = String(rec.PROPOSED_STATE).toUpperCase();
      if (b.indexOf('SCOUT_INTAKE') >= 0) rec.PROPOSED_BUCKET = 'SCOUT_INTAKE';
      else if (b.indexOf('DISCOVERY_LEAD') >= 0) rec.PROPOSED_BUCKET = 'DISCOVERY_LEAD';
    }
    if (rec.COMP && !rec.PAY_POSTED) rec.PAY_POSTED = rec.COMP;
    if (rec.FLEX && !rec.FLEX_HINT) rec.FLEX_HINT = rec.FLEX;
    if (rec.EVIDENCE && !rec.SCOUT_NOTES) rec.SCOUT_NOTES = rec.EVIDENCE;
    if (rec.POSSIBLE_MATCHES && !isNotProvided_(rec.POSSIBLE_MATCHES)) {
      rec.SCOUT_NOTES = (rec.SCOUT_NOTES ? rec.SCOUT_NOTES + ' | ' : '') + 'CLAUDE_POSSIBLE_MATCHES=' + rec.POSSIBLE_MATCHES;
    }
    if (rec.CLAUDE_IDENTITY_FLAG && !isNotProvided_(rec.CLAUDE_IDENTITY_FLAG)) {
      rec.SCOUT_NOTES = (rec.SCOUT_NOTES ? rec.SCOUT_NOTES + ' | ' : '') + 'CLAUDE_IDENTITY_FLAG=' + rec.CLAUDE_IDENTITY_FLAG;
    }
    if (rec.EXCLUSION_REASON && !rec.NEVER_CONSIDER_REASON) rec.NEVER_CONSIDER_REASON = rec.EXCLUSION_REASON;

    // Preserve source identity without inventing facts.
    if (isNotProvided_(rec.REQ_ID)) delete rec.REQ_ID;
    if (isNotProvided_(rec.SOURCE_URL)) delete rec.SOURCE_URL;
    if (isNotProvided_(rec.DISCOVERED_AT_ET)) delete rec.DISCOVERED_AT_ET;
    if (isNotProvided_(rec.IDENTITY_CONFIDENCE)) delete rec.IDENTITY_CONFIDENCE;
    if (isNotProvided_(rec.LOCATION)) delete rec.LOCATION;

    // Hand-off explicitly says all INTAKE_KEY values are absent. Let writer generate deterministic keys.
    delete rec.INTAKE_KEY;

    var env = id.slice(0, 2);
    out[env].push(rec);
  }
  return out;
}

function parseKeyValueBlock_(block) {
  var rec = {};
  var lines = String(block || '').replace(/\r/g, '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var eq = line.indexOf('=');
    if (eq <= 0) continue;
    var k = line.slice(0, eq).trim();
    var v = line.slice(eq + 1).trim();
    if (!k) continue;
    rec[k] = v;
  }
  return rec;
}

function isNotProvided_(v) {
  if (v === undefined || v === null) return true;
  var s = String(v).trim().toUpperCase();
  return !s || s === 'NOT PROVIDED' || s === 'UNKNOWN' || s === 'NOT_STATED' || s.indexOf('NOT PROVIDED') === 0 || s.indexOf('UNKNOWN') === 0;
}

function findMasterLine_(text, re) {
  var lines = String(text || '').replace(/\r/g, '').split('\n');
  for (var i = 0; i < lines.length; i++) if (re.test(lines[i])) return lines[i];
  return '';
}

function allIntakeOutputsVerified_(results) {
  for (var i = 0; i < results.length; i++) {
    var o = results[i].output || {};
    if (!o.ok) return false;
    if (o.WRITE_VERIFIED === false) return false;
    if (o.COMPLETION_STATUS && o.COMPLETION_STATUS !== 'COMPLETE') return false;
  }
  return true;
}

function writeAmd59RecoveryReceipt_(before, after, results, terminal, reason) {
  var folder = DriveApp.getFolderById(AMD59_AI_COORDINATION_FOLDER_ID);
  var stamp = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd_HHmmss');
  var name = (terminal === 'VERIFIED' ? 'MASTER_CHANGE_APPLIED_' : 'MASTER_WRITER_FAILURE_') +
    'AMD59_STRANDED_INTAKE_RECOVERY_' + stamp + '.txt';

  var summary = summarizeAmd59Results_(results);
  var lines = [
    'SOURCE_REQUEST_ID=' + AMD59_RECOVERY_REQUEST_ID,
    'TARGET_MASTER_ID=' + MASTER_ID,
    'RECOVERY_SCOPE=E1+E2+E3 intake only',
    'INPUT_INTAKE_RECORDS=38',
    'APPLICATION_UPSERTS_DEFERRED=4',
    'OATEY_HOLD_DEFERRED=1',
    'MASTER_WRITE=' + terminal,
    'REASON=' + (reason || 'NONE'),
    'MASTER_MODIFIED_BEFORE=' + (before ? before.modifiedTime : 'NOT_READ'),
    'MASTER_MODIFIED_AFTER=' + (after ? after.modifiedTime : 'NOT_READ'),
    'COUNTS_BEFORE=' + (before ? findMasterLine_(before.text, /^COUNTS:/) : 'NOT_READ'),
    'COUNTS_AFTER=' + (after ? findMasterLine_(after.text, /^COUNTS:/) : 'NOT_READ'),
    'END_BEFORE=' + (before ? findMasterLine_(before.text, /^END V2_CURRENT_POPULATION_MASTER/) : 'NOT_READ'),
    'END_AFTER=' + (after ? findMasterLine_(after.text, /^END V2_CURRENT_POPULATION_MASTER/) : 'NOT_READ'),
    'SCOUT_INTAKE_WRITTEN=' + summary.SCOUT_INTAKE_WRITTEN,
    'DISCOVERY_LEAD_WRITTEN=' + summary.DISCOVERY_LEAD_WRITTEN,
    'EXISTING_MATCH=' + summary.EXISTING_MATCH,
    'NEVER_CONSIDER_EXCLUDED=' + summary.NEVER_CONSIDER_EXCLUDED,
    'WRITE_FAILED=' + summary.WRITE_FAILED,
    'READBACK_VERIFIED=' + (terminal === 'VERIFIED' ? 'YES' : 'NO'),
    '',
    'PER_ENVELOPE:',
    JSON.stringify(results, null, 2)
  ];

  folder.createFile(name, lines.join('\n'), MimeType.PLAIN_TEXT);
}

function summarizeAmd59Results_(results) {
  var s = {
    SCOUT_INTAKE_WRITTEN: 0,
    DISCOVERY_LEAD_WRITTEN: 0,
    EXISTING_MATCH: 0,
    NEVER_CONSIDER_EXCLUDED: 0,
    WRITE_FAILED: 0
  };
  for (var i = 0; i < results.length; i++) {
    var o = results[i].output || {};
    var src = (o.receipt && o.receipt.COUNTERS) || o.summary || o;
    Object.keys(s).forEach(function (k) {
      if (src[k] !== undefined && src[k] !== null && !isNaN(Number(src[k]))) s[k] += Number(src[k]);
    });
  }
  return s;
}
