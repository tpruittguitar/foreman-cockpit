/* Shared helpers for golden-frame pages. Data comes only from the fixture (L-2). */
var G = (function () {
  function getJSON(url) { var x = new XMLHttpRequest(); x.open('GET', url, false); x.send(null); return JSON.parse(x.responseText); }
  var fx = getJSON('../fixture/fixture.json');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var BAND = { TOP: ['▲', 'b-top', 'TOP 10%'], UPPER: ['◆', 'b-upper', 'UPPER 25%'], MID: ['●', 'b-mid', 'MID 45%'], LOW: ['▽', 'b-low', 'LOW 20%'], HOLD: ['⊘', 'b-hold', 'HOLD'] };
  function sel() { return fx.rows.find(function (r) { return r.id === fx.selectedId; }); }
  return { fx: fx, esc: esc, BAND: BAND, sel: sel, getJSON: getJSON };
}());
