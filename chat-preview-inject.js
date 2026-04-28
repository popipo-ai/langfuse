// Chat Preview button injector — opens the standalone React chat preview page
(function() {
  'use strict';

  var CHAT_PREVIEW_BTN_ID = 'chat-preview-btn';
  var CHECK_INTERVAL = 2000;

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

  var SVG_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/></svg>';

  function openChatPreviewPage() {
    var projectId = getProjectId();
    var sessionId = getSessionId();
    if (!projectId || !sessionId) return;
    window.open(
      '/chat-preview.html?projectId=' + encodeURIComponent(projectId) + '&sessionId=' + encodeURIComponent(sessionId),
      '_blank'
    );
  }

  function injectButton() {
    if (!isSessionPage()) return;
    if (document.getElementById(CHAT_PREVIEW_BTN_ID)) return;

    var downloadBtn = document.querySelector('button[title="Download session as JSON"]');
    if (!downloadBtn) return;

    var btn = document.createElement('button');
    btn.id = CHAT_PREVIEW_BTN_ID;
    btn.title = 'Chat Preview';
    btn.innerHTML = SVG_ICON;
    btn.className = downloadBtn.className;
    btn.style.cssText = downloadBtn.style.cssText;
    btn.onclick = openChatPreviewPage;

    downloadBtn.parentNode.insertBefore(btn, downloadBtn);
  }

  setInterval(injectButton, CHECK_INTERVAL);
  injectButton();
  window.addEventListener('popstate', function() { setTimeout(injectButton, 500); });

  var observer = new MutationObserver(function() {
    if (isSessionPage() && !document.getElementById(CHAT_PREVIEW_BTN_ID)) {
      injectButton();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
