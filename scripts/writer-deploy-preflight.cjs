'use strict';
const fs = require('node:fs');
const PRIVATE_PROPERTY = 'WRITER_PASSPHRASE';
function validate({source, liveSource, key, propertyVerified}) {
  if (propertyVerified !== '1') throw new Error('Verify the private WRITER_PASSPHRASE Script Property independently, then set WRITER_PRIVATE_PROPERTY_VERIFIED=1; this flag is an operator attestation, not an API verification.');
  if (typeof key !== 'string' || !key || key === 'CHANGE-ME') throw new Error('Supply the unchanged Writer credential privately through WRITER_PASSPHRASE in the process environment.');
  if (/\bPASSPHRASE\s*=\s*['"`]/.test(source)) throw new Error('Refusing deployment: repository source contains a literal passphrase assignment.');
  if (!source.includes(PRIVATE_PROPERTY) || !source.includes('getScriptProperties')) throw new Error('Repository source does not use the private Writer Script Property.');
  const legacy = liveSource.match(/^var PASSPHRASE\s*=\s*(['"])([^\r\n]*?)\1\s*;/m);
  if (legacy) {
    // Fail closed on escaped/ambiguous literals rather than interpreting source code.
    if (legacy[2].includes('\\') || legacy[2] !== key) throw new Error('Private credential does not match the unambiguous existing live credential; aborting without changes.');
    return 'transition';
  }
  if (!liveSource.includes(PRIVATE_PROPERTY) || !liveSource.includes('getScriptProperties')) throw new Error('Unrecognized live credential configuration; aborting without changes.');
  return 'private-property';
}
if (require.main === module) {
  try {
    const mode = validate({source:fs.readFileSync(process.argv[2], 'utf8'), liveSource:fs.readFileSync(process.argv[3], 'utf8'), key:process.env.WRITER_PASSPHRASE, propertyVerified:process.env.WRITER_PRIVATE_PROPERTY_VERIFIED});
    console.log('Writer credential preflight passed (' + mode + '); private-property presence was independently attested.');
  } catch (e) { console.error('Writer credential preflight: ' + e.message); process.exitCode = 1; }
}
module.exports = { validate };
