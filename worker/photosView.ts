// The in-chat photo gallery: an MCP App (https://github.com/modelcontextprotocol/ext-apps).
// Claude's apps don't display image blocks returned by tools, so `show_photos` also
// points at this page; hosts that support MCP Apps render it inline in the chat and
// hand it the tool result (captions + images) over postMessage.

export const PHOTOS_URI = 'ui://life/photos';
export const MCP_APP_MIME = 'text/html;profile=mcp-app';

export const PHOTOS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --tile: #efefed; --text: #1c1d20; --muted: #6b6c72; }
  @media (prefers-color-scheme: dark) { :root { --tile: #2a2b30; --text: #ececee; --muted: #9a9ba2; } }
  :root[data-theme='light'] { --tile: #efefed; --text: #1c1d20; --muted: #6b6c72; }
  :root[data-theme='dark'] { --tile: #2a2b30; --text: #ececee; --muted: #9a9ba2; }
  * { box-sizing: border-box; }
  /* No color-scheme: a mismatch with the host page would give the frame an opaque background. */
  body { margin: 0; padding: 8px; font: 14px/1.3 system-ui, -apple-system, sans-serif; color: var(--text); background: transparent; }
  ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 14px 10px; margin: 0; padding: 0; list-style: none; }
  figure { margin: 0; }
  button.pick { display: block; width: 100%; min-height: 44px; margin: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  button.pick:disabled { cursor: default; }
  button.pick:enabled:active img { opacity: 0.7; }
  button.pick:focus-visible { outline: 2px solid var(--muted); outline-offset: 2px; border-radius: 14px; }
  img { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: contain; border-radius: 14px; background: var(--tile); }
  figcaption { margin-top: 6px; text-align: center; font-size: 13px; overflow-wrap: anywhere; }
  .note { margin: 6px 2px 0; color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
<ul id="grid"></ul>
<p class="note" id="note">Loading photos…</p>
<script>
(function () {
  var nextId = 1;
  var canPick = false; // only once the host confirms it can take a message from the view
  var picks = {};      // ui/message request id -> caption, to report how the host answered
  function send(msg) { window.parent.postMessage(msg, '*'); }

  function pick(button, id, caption) {
    var name = caption.split(' · from')[0];
    var reqId = nextId++;
    picks[reqId] = name;
    button.disabled = true;
    send({ jsonrpc: '2.0', id: reqId, method: 'ui/message', params: {
      role: 'user',
      content: [{ type: 'text', text: 'I meant the ' + name + (id ? ' (item id: ' + id + ')' : '') + '.' }]
    } });
  }

  function add(grid, id, caption, mimeType, data) {
    var li = document.createElement('li');
    var fig = document.createElement('figure');
    var img = document.createElement('img');
    img.alt = caption;
    img.src = 'data:' + mimeType + ';base64,' + data;
    var cap = document.createElement('figcaption');
    cap.textContent = caption;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'pick';
    button.setAttribute('aria-label', 'Pick ' + caption);
    button.disabled = !canPick;
    button.addEventListener('click', function () { pick(button, id, caption); });
    button.appendChild(img); button.appendChild(cap);
    fig.appendChild(button); li.appendChild(fig); grid.appendChild(li);
  }

  function render(result) {
    var grid = document.getElementById('grid');
    var note = document.getElementById('note');
    grid.textContent = '';
    var content = (result && result.content) || [];
    var shown = 0;
    // Preferred: structuredContent.photos (meant for this view). Fallback: caption + image blocks in content.
    var photos = result && result.structuredContent && result.structuredContent.photos;
    if (photos && photos.length) {
      photos.forEach(function (p) { add(grid, p.id, p.caption, p.mimeType, p.data); shown++; });
    } else {
      var caption = '';
      for (var i = 1; i < content.length; i++) {
        var block = content[i];
        if (block.type === 'text') { caption = block.text; continue; }
        if (block.type === 'image') { add(grid, '', caption, block.mimeType, block.data); caption = ''; shown++; }
      }
    }
    var summary = content[0] && content[0].type === 'text' ? content[0].text.split('\\nOpen in the app')[0] : '';
    var extra = (result && result.structuredContent && result.structuredContent.note) || summary.replace(/^Showing \\d+ photos?\\.?\\s*/, '');
    if (shown === 0) {
      // Say what arrived, so a miss can be diagnosed from a screenshot.
      var kinds = content.map(function (c) { return c.type; }).join(', ') || 'nothing';
      var keys = result ? Object.keys(result).join(', ') : 'nothing';
      note.textContent = (summary || 'No photos to show.') + ' [received: ' + kinds + ' | fields: ' + keys + ']';
    } else {
      note.textContent = [extra, canPick ? 'Tap a photo to pick it.' : ''].filter(Boolean).join(' ');
    }
    note.hidden = !note.textContent;
    reportSize();
  }

  function status(text) {
    var note = document.getElementById('note');
    note.textContent = text;
    note.hidden = false;
    reportSize();
  }

  function reportSize() {
    send({ jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } });
  }

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.jsonrpc !== '2.0') return;
    if (msg.id !== undefined && picks[msg.id] !== undefined && !msg.method) { // answer to a ui/message
      var name = picks[msg.id];
      delete picks[msg.id];
      if (msg.error) { // the host can't take it after all: stop offering it, replying by text still works
        canPick = false;
        Array.prototype.forEach.call(document.querySelectorAll('button.pick'), function (b) { b.disabled = true; });
        status('Couldn’t send that. Tell Claude which one you meant.');
      } else {
        status('Sent: ' + name);
      }
    } else if (msg.id === 1 && msg.error) { // the host rejected ui/initialize: say so instead of staying blank
      status('Couldn’t connect to the chat app: ' + (msg.error.message || 'rejected'));
    } else if (msg.id === 1 && msg.result) { // reply to ui/initialize
      var theme = msg.result.hostContext && msg.result.hostContext.theme;
      var caps = msg.result.hostCapabilities;
      canPick = !!(caps && caps.message);
      if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
      status('Waiting for the photos…');
      send({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} });
    } else if (msg.method === 'ui/notifications/tool-result') {
      render(msg.params);
    } else if (msg.method === 'ui/notifications/host-context-changed' && msg.params && msg.params.theme) {
      document.documentElement.setAttribute('data-theme', msg.params.theme);
    } else if (msg.method === 'ui/resource-teardown' && msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, result: {} });
    }
  });

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(reportSize).observe(document.body);
  // Field names as in the ext-apps SDK (McpUiInitializeRequest): appInfo, appCapabilities, protocolVersion.
  send({ jsonrpc: '2.0', id: nextId++, method: 'ui/initialize', params: {
    appInfo: { name: 'Life photos', version: '1.0.0' },
    appCapabilities: { availableDisplayModes: ['inline'] },
    protocolVersion: '2026-01-26'
  } });
})();
</script>
</body>
</html>`;
