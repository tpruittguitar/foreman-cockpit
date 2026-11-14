/* Snapshot age for Explorer. The clock is structuredMeta.generatedAt only — never fetchedAt
   (pipeline.html structuredTextFromPagedJobs_ stamps fetchedAt onto modifiedTime when generatedAt is missing). */
(function (root) {
  'use strict';
  var DATA_STALE_MS = 3600000;
  function from(generatedAt, now) {
    var t = typeof generatedAt === 'string' || typeof generatedAt === 'number' ? Date.parse(generatedAt) : NaN;
    if (!Number.isFinite(t)) return { stale: true, unknown: true, asOf: null };
    var at = now == null ? Date.now() : +new Date(now);
    return { stale: at - t >= DATA_STALE_MS, unknown: false, asOf: new Date(t) };
  }
  function clock(date) {
    var h = date.getHours(), m = date.getMinutes(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (!h) h = 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }
  function words(age) {
    if (!age || !age.stale) return null;
    if (age.unknown || !age.asOf) return { word: '? DATA AGE UNKNOWN', aria: 'Data age unknown' };
    var hm = clock(age.asOf);
    return { word: 'DATA AS OF ' + hm, aria: 'Data may be out of date, as of ' + hm };
  }
  root.PipelineDataAge = { DATA_STALE_MS: DATA_STALE_MS, from: from, words: words, clock: clock };
})(typeof window !== 'undefined' ? window : globalThis);
