/* List multi-select for the job table (Tim 2026-10-25).
   Ctrl/Cmd toggles one row. Shift selects the visible range from the anchor.
   A checkbox click without Shift keeps the other selected rows and takes that box's checked state.
   Plain row clicks do not come through here; the table still opens the row and only moves the anchor. */
(function (root) {
  'use strict';
  function copy(checked) {
    var out = {};
    Object.keys(checked || {}).forEach(function (k) { if (checked[k]) out[k] = true; });
    return out;
  }
  function apply(state, ids, id, mods) {
    mods = mods || {};
    state = state || {};
    ids = ids || [];
    var checked, anchor = state.anchor, i, lo, hi, a, b;
    if (!id || ids.indexOf(id) < 0) return { checked: copy(state.checked), anchor: anchor };
    if (mods.shift) {
      a = ids.indexOf(anchor);
      b = ids.indexOf(id);
      if (a < 0) a = b;
      lo = Math.min(a, b);
      hi = Math.max(a, b);
      checked = mods.toggle ? copy(state.checked) : {};
      for (i = lo; i <= hi; i++) checked[ids[i]] = true;
      return { checked: checked, anchor: anchor == null ? id : anchor };
    }
    if (mods.toggle) {
      checked = copy(state.checked);
      if (mods.box === true) checked[id] = true;
      else if (mods.box === false) delete checked[id];
      else if (checked[id]) delete checked[id];
      else checked[id] = true;
      return { checked: checked, anchor: id };
    }
    checked = {};
    checked[id] = true;
    return { checked: checked, anchor: id };
  }
  var api = { apply: apply };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PipelineListSelect = api;
})(typeof self !== 'undefined' ? self : this);
