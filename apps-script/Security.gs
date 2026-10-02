/** Account-owner activation. Deploy current Code.gs first, preserving the old PASSPHRASE until activation.
 * Then run securePipelineAccess once from the Apps Script editor. Never expose the returned key in source.
 * This changes sharing/authentication, never the master text or job states.
 */
function securePipelineAccess() {
  var file=DriveApp.getFileById(MASTER_ID);
  file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
  if(file.getSharingAccess()!==DriveApp.Access.PRIVATE)throw new Error('Master sharing did not become private; credential not rotated');
  var secret=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  PropertiesService.getScriptProperties().setProperty('PIPELINE_WRITER_SECRET',secret);
  Logger.log('Master is restricted. New writer credential (save privately; update Explorer devices and HTTP workers): '+secret);
  return {masterSharing:'PRIVATE',writerCredential:secret};
}
