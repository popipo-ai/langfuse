// Chat Preview — intercept blob: opens and redirect to /chat-preview.html
(function() {
  'use strict';

  function isSessionPage() {
    return /\/project\/[^/]+\/sessions\/[^/]+/.test(location.pathname)
      && !/\/chat-preview/.test(location.pathname);
  }

  function getSessionId() {
    var m = location.pathname.match(/\/sessions\/([^/?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function getProjectId() {
    var m = location.pathname.match(/\/project\/([^/]+)/);
    return m ? m[1] : null;
  }

  function buildUrl() {
    var projectId = getProjectId();
    var sessionId = getSessionId();
    if (!projectId || !sessionId) return null;
    return '/chat-preview.html?projectId=' + encodeURIComponent(projectId) + '&sessionId=' + encodeURIComponent(sessionId);
  }

  // Intercept window.open — redirect blob: URLs on session pages to new preview
  var _origOpen = window.open;
  window.open = function(url) {
    if (isSessionPage() && typeof url === 'string' && url.indexOf('blob:') === 0) {
      var newUrl = buildUrl();
      if (newUrl) {
        try { URL.revokeObjectURL(url); } catch(e) {}
        return _origOpen.call(window, newUrl, '_blank');
      }
    }
    return _origOpen.apply(window, arguments);
  };
})();
