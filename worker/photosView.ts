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
  body { margin: 0; padding: 4px 2px 8px; font: 14px/1.3 system-ui, -apple-system, sans-serif; color: var(--text); background: transparent; }
  ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 14px 10px; margin: 0; padding: 0; list-style: none; }
  figure { margin: 0; }
  img { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: contain; border-radius: 14px; background: var(--tile); }
  figcaption { margin-top: 6px; text-align: center; font-size: 13px; overflow-wrap: anywhere; }
  .note { margin: 6px 2px 0; color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
<ul id="grid"></ul>
<p class="note" id="note" hidden></p>
<script>
(function () {
  var nextId = 1;
  function send(msg) { window.parent.postMessage(msg, '*'); }

  function render(result) {
    var grid = document.getElementById('grid');
    var note = document.getElementById('note');
    grid.textContent = '';
    var content = (result && result.content) || [];
    var caption = '';
    var shown = 0;
    for (var i = 1; i < content.length; i++) { // content[0] is the summary
      var block = content[i];
      if (block.type === 'text') { caption = block.text; continue; }
      if (block.type === 'image') {
        var li = document.createElement('li');
        var fig = document.createElement('figure');
        var img = document.createElement('img');
        img.alt = caption;
        img.src = 'data:' + block.mimeType + ';base64,' + block.data;
        var cap = document.createElement('figcaption');
        cap.textContent = caption;
        fig.appendChild(img); fig.appendChild(cap); li.appendChild(fig); grid.appendChild(li);
        caption = ''; shown++;
      }
    }
    var summary = content[0] && content[0].type === 'text' ? content[0].text.split('\\nOpen in the app')[0] : '';
    var extra = summary.replace(/^Showing \\d+ photos?\\.?\\s*/, '');
    note.textContent = shown === 0 ? summary : extra;
    note.hidden = !note.textContent;
    reportSize();
  }

  function reportSize() {
    send({ jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } });
  }

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.jsonrpc !== '2.0') return;
    if (msg.id === 1 && msg.result) { // reply to ui/initialize
      var theme = msg.result.hostContext && msg.result.hostContext.theme;
      if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
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
  send({ jsonrpc: '2.0', id: nextId++, method: 'ui/initialize', params: {
    appCapabilities: { availableDisplayModes: ['inline'] },
    capabilities: {},
    clientInfo: { name: 'Life photos', version: '1.0.0' },
    protocolVersion: '2026-01-26'
  } });
})();
</script>
</body>
</html>`;
