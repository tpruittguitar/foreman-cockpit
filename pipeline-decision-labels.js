/* Shared Pipeline Explorer decision labels (GUI spec, P2 phone/desktop parity).
   Visible words only. Each control keeps the Writer write it has on main. */
(function (root) {
  'use strict';
  var DECISION = [
    { key: 'pursue', label: 'Pursue' },
    { key: 'research', label: 'Research' },
    { key: 'decline', label: 'Decline' }
  ];
  var MARK_APPLIED = 'Mark applied';
  var SNOOZE = 'Snooze 3 days (this device)';
  var TOAST = { pursue: 'Pursue', research: 'Research', decline: 'Decline', applied: 'Mark applied' };
  var FORBIDDEN = ['Applied', 'Hold', 'Later'];
  function labels() {
    return { pursue: 'Pursue', research: 'Research', decline: 'Decline', markApplied: MARK_APPLIED, snooze: SNOOZE };
  }
  function toast(kind) { return (TOAST[kind] || kind) + ' queued'; }
  function forbiddenIn(text) {
    var s = String(text || '');
    return FORBIDDEN.filter(function (w) { return s === w || new RegExp('(^|[\\s>])' + w + '([\\s<]|$)').test(s); });
  }
  var api = { DECISION: DECISION, MARK_APPLIED: MARK_APPLIED, SNOOZE: SNOOZE, TOAST: TOAST, FORBIDDEN: FORBIDDEN, labels: labels, toast: toast, forbiddenIn: forbiddenIn };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PipelineDecisionLabels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
