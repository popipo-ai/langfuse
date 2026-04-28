// Chat Preview — hijack old blob-based buttons + inject new button to open /chat-preview.html
(function() {
  'use strict';

  var CHAT_PREVIEW_BTN_ID = 'chat-preview-btn';
  var HIJACKED_ATTR = 'data-cp-hijacked';
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

  function buildUrl() {
    var projectId = getProjectId();
    var sessionId = getSessionId();
    if (!projectId || !sessionId) return null;
    return '/chat-preview.html?projectId=' + encodeURIComponent(projectId) + '&sessionId=' + encodeURIComponent(sessionId);
  }

  function openChatPreviewPage(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    var url = buildUrl();
    if (url) window.open(url, '_blank');
  }

  // Hijack any existing "Chat Preview" buttons (from the old built-in blob version)
  function hijackOldButtons() {
    if (!isSessionPage()) return;
    var buttons = document.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (btn.getAttribute(HIJACKED_ATTR)) continue;
      var text = (btn.textContent || '').trim();
      var title = (btn.getAttribute('title') || '').trim();
      if (text === 'Chat Preview' || title === 'Chat Preview' ||
          text.indexOf('Chat Preview') !== -1 || title.indexOf('Chat Preview') !== -1) {
        if (btn.id === CHAT_PREVIEW_BTN_ID) continue;
        btn.setAttribute(HIJACKED_ATTR, '1');
        btn.addEventListener('click', openChatPreviewPage, true);
      }
    }
    // Also hijack links/anchors that open blob: URLs for chat preview
    var links = document.querySelectorAll('a[href*="chat-preview"], a[href^="blob:"]');
    for (var j = 0; j < links.length; j++) {
      var link = links[j];
      if (link.getAttribute(HIJACKED_ATTR)) continue;
      link.setAttribute(HIJACKED_ATTR, '1');
      link.addEventListener('click', openChatPreviewPage, true);
    }
  }

  var SVG_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/></svg>';

  function injectButton() {
    if (!isSessionPage()) return;
    if (document.getElementById(CHAT_PREVIEW_BTN_ID)) return;

    var downloadBtn = document.querySelector('button[title="Download session as JSON"]');
    if (!downloadBtn) return;

    var btn = document.createElement('button');
    btn.id = CHAT_PREVIEW_BTN_ID;
    btn.title = 'Chat Preview (new)';
    btn.innerHTML = SVG_ICON;
    btn.className = downloadBtn.className;
    btn.style.cssText = downloadBtn.style.cssText;
    btn.onclick = openChatPreviewPage;

    downloadBtn.parentNode.insertBefore(btn, downloadBtn);
  }

  function run() {
    if (!isSessionPage()) return;
    hijackOldButtons();
    injectButton();
  }

  setInterval(run, CHECK_INTERVAL);
  run();
  window.addEventListener('popstate', function() { setTimeout(run, 500); });

  var observer = new MutationObserver(function() {
    if (isSessionPage()) run();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
