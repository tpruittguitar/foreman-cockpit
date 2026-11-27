/* Pipeline Explorer Writer-off gate (Card P2, desktop parity with the phone banner).
   While the Writer is off on this device, show the phone's banner text and disable every decision button and field
   (disabled + aria-disabled + a title saying why). Buttons come back exactly as they were when the Writer is back. */
(function (root) {
  'use strict';
  var LABEL = 'Writer off';
  var BANNER = 'Writer not connected · decisions can’t be sent from this device. Save a connection in Settings.';
  var TITLE = 'Writer off: decisions can’t be sent from this device. Save a Writer connection in Settings.';
  var SELECTOR = '[data-decide-key],#save-decision,#undo-decision,#edit-state,#edit-reason,#edit-dup,#edit-note,[data-m-do],[data-m-retry]';
  var MARK = 'data-writer-off-title';
  function gate(buttons, off) {
    var n = 0;
    Array.prototype.forEach.call(buttons || [], function (b) {
      if (off) {
        if (!b.hasAttribute(MARK)) b.setAttribute(MARK, b.getAttribute('title') || '');
        b.disabled = true; b.setAttribute('aria-disabled', 'true'); b.setAttribute('title', TITLE); n++;
      } else if (b.hasAttribute(MARK)) {
        var t = b.getAttribute(MARK);
        b.disabled = false; b.removeAttribute('aria-disabled'); b.removeAttribute(MARK);
        if (t) b.setAttribute('title', t); else b.removeAttribute('title'); n++;
      }
    });
    return n;
  }
  function apply(doc, off) { return doc && doc.querySelectorAll ? gate(doc.querySelectorAll(SELECTOR), !!off) : 0; }
  function bannerHtml() { return '<span class="lvl">' + LABEL + '</span><span class="msg">' + BANNER + '</span>'; }
  var api = { LABEL: LABEL, BANNER: BANNER, TITLE: TITLE, SELECTOR: SELECTOR, gate: gate, apply: apply, bannerHtml: bannerHtml };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PipelineWriterOff = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
