'use strict';
// Explicit test-runner preload only. Production Code.gs has no synthetic/default configuration.
const properties = Object.freeze({
  WRITER_CONFIG_VERSION: '1', WRITER_PASSPHRASE: 'synthetic-test-key',
  WRITER_MASTER_ID: 'synthetic_master_id', WRITER_FROZEN_MASTER_ID: 'synthetic_frozen_master_id',
  WRITER_CANONICAL_RULES_DOC_ID: 'synthetic_canonical_rules_doc_id', WRITER_DOCS_ROOT_ID: 'synthetic_docs_root_id',
  WRITER_RESUMES_FOLDER_ID: 'synthetic_resumes_folder_id', WRITER_COVER_LETTERS_FOLDER_ID: 'synthetic_cover_letters_folder_id',
  WRITER_SUPPORTING_DOCS_FOLDER_ID: 'synthetic_supporting_docs_folder_id', WRITER_TIM_VOICE_FOLDER_ID: 'synthetic_tim_voice_folder_id',
  WRITER_INTERVIEW_NOTES_FOLDER_ID: 'synthetic_interview_notes_folder_id'
});
const service = (extra = {}) => ({ getScriptProperties: () => ({ getProperties: () => ({ ...properties, ...extra }) }) });
if (!global.PropertiesService) global.PropertiesService = service();
module.exports = { properties, service };
