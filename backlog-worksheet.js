/* Navigation only. Never probe loopback, read credentials, or submit decisions. */
(function (root) {
  'use strict';
  function isMobileDevice(nav) {
    nav = nav || {};
    return /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '') ||
      !!(nav.userAgentData && nav.userAgentData.mobile) ||
      (Number(nav.maxTouchPoints) > 1 && /Mac/.test(nav.platform || ''));
  }
  if (typeof module === 'object' && module.exports) module.exports = { isMobileDevice: isMobileDevice };
  if (!root.document) return;
  var mobile = isMobileDevice(root.navigator);
  root.document.getElementById('local-worksheet').hidden = mobile;
  root.document.getElementById('mobile-unavailable').hidden = !mobile;
})(typeof window === 'object' ? window : globalThis);
