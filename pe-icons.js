/* Pipeline Explorer glyph icons. Grok Bot R-7 (2026-10-18): glyphs that Inter / IBM Plex Mono do not cover ship as
   inline SVG so Windows and iPhone draw the same shape. One glyph = one meaning; the word always travels with it.
   PEIcons.svg(name) returns markup; PEIcons.apply(root) replaces the listed characters inside text nodes. */
var PEIcons = (function () {
  var S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var P = {
    clock:   '<circle cx="12" cy="12" r="8.5" ' + S + '/><path d="M12 12V5.5M12 12H5.5" ' + S + '/>',                 // ◷ waiting for Writer lock
    stale:   '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="2.2 2.9"/>', // ◌ stale stored evidence
    writing: '<path d="M19 12a7 7 0 1 1-2.05-4.95" ' + S + '/><path d="M19.5 4.5v4h-4" ' + S + '/>',                     // ⟳ write in flight
    close:   '<path d="M6 6l12 12M18 6L6 18" ' + S + '/>',                                                               // ✕ close
    attn:    '<path d="M8 5.5l9 6.5-9 6.5z" fill="currentColor"/>',                                                       // ▸ attention / action
    mail:    '<rect x="3.5" y="6" width="17" height="12" rx="1" ' + S + '/><path d="M4 7l8 6 8-6" ' + S + '/>',          // ✉ email
    lock:    '<circle cx="12" cy="12" r="8" ' + S + '/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',          // ◉ selected / lock-on
    expand:  '<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" ' + S + '/>',                                          // ⤢ fullscreen
    caret:   '<path d="M7 9.5h10L12 15z" fill="currentColor"/>',                                                          // ▾ dropdown
    search:  '<circle cx="10.5" cy="10.5" r="6" ' + S + '/><path d="M15 15l5 5" ' + S + '/>',                          // ⌕ search
    menu:    '<path d="M4 7h16M4 12h16M4 17h16" ' + S + '/>',                                                            // ☰ menu
    pipeline:'<rect x="4" y="4" width="16" height="16" rx="1" ' + S + '/><path d="M4 9h16M4 14h16" ' + S + '/>',       // ▤ Pipeline
    intake:  '<path d="M6 6l11 11M17 9v8H9" ' + S + '/><path d="M20 20H13" ' + S + '/>',                                 // ⇲ Intake
    system:  '<circle cx="12" cy="12" r="3.2" ' + S + '/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" ' + S + '/>', // ⚙ System
    settings:'<path d="M4 6h6M14 6h6M4 12h6M14 12h6M4 18h6M14 18h6" ' + S + '/>',                                       // ☷ Settings
    bell:    '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" ' + S + '/><path d="M10 20a2 2 0 0 0 4 0" ' + S + '/>',    // needs you (Grok Bot P01)
    hold:    '<rect x="6.5" y="5" width="3.6" height="14" fill="currentColor"/><rect x="13.9" y="5" width="3.6" height="14" fill="currentColor"/>' // Hold (V-02)
  };
  var CHAR = { '◷': 'clock', '◌': 'stale', '⟳': 'writing', '✕': 'close', '▸': 'attn', '✉': 'mail', '◉': 'lock', '⤢': 'expand', '▾': 'caret', '⌕': 'search', '☰': 'menu', '▤': 'pipeline', '⇲': 'intake', '⚙': 'system', '☷': 'settings' };
  function svg(name, extraClass) { return '<svg class="pe-ic' + (extraClass ? ' ' + extraClass : '') + '" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">' + P[name] + '</svg>'; }
  var RE = new RegExp('[' + Object.keys(CHAR).join('') + ']');
  function apply(root) {
    var w = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT), list = [], n;
    while ((n = w.nextNode())) if (RE.test(n.nodeValue) && !(n.parentNode && n.parentNode.closest && n.parentNode.closest('svg'))) list.push(n);
    list.forEach(function (t) {
      var frag = document.createDocumentFragment(), s = t.nodeValue, buf = '';
      for (var i = 0; i < s.length; i++) {
        var name = CHAR[s[i]];
        if (!name) { buf += s[i]; continue; }
        if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ''; }
        var span = document.createElement('span'); span.className = 'pe-icw'; span.setAttribute('data-glyph', s[i]); span.innerHTML = svg(name); frag.appendChild(span);
      }
      if (buf) frag.appendChild(document.createTextNode(buf));
      t.parentNode.replaceChild(frag, t);
    });
  }
  return { svg: svg, apply: apply, CHAR: CHAR };
}());
if (typeof module === 'object' && module.exports) module.exports = PEIcons;
