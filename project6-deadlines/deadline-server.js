// Deadline check service for n8n schedule trigger.
// Listens on 127.0.0.1:8792
//   GET /health
//   GET /check?send=1   — run check; send=1 sends Telegram reminders
const http = require('http');
const { execFile } = require('child_process');
const path = require('path');

const CHECKER = path.join(__dirname, 'deadline-checker.js');
const PORT = 8792;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
  const sendJson = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  if (url.pathname === '/health') return sendJson(200, { ok: true });

  if (url.pathname === '/check') {
    const args = [CHECKER];
    if (url.searchParams.get('send') === '1') args.push('--send');
    execFile(process.execPath, args, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) return sendJson(500, { ok: false, error: err.message, stderr: String(stderr) });
      try {
        const parsed = JSON.parse(stdout);
        sendJson(200, { ok: true, ...parsed });
      } catch (e) {
        sendJson(200, { ok: true, raw: stdout });
      }
    });
    return;
  }

  sendJson(404, { ok: false, error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('deadline-server listening on http://127.0.0.1:' + PORT);
});
