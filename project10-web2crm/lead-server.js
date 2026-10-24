// Lead intake server: emulates the site widget backend.
//   POST /lead  {name, phone, store, city, message} -> enriches, appends to leads.csv
//   GET  /health
// Enrichment is offloaded to the orchestrator (n8n) or done inline here if LLM_JOB=inline.
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const CSV = path.join(DIR, 'leads.csv');
const PORT = 8793;

if (!fs.existsSync(CSV)) {
  fs.writeFileSync(CSV, 'id,received_at,name,phone,store,city,message,status,manager\n');
}

function esc(v) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
  const sendJson = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  if (url.pathname === '/health') return sendJson(200, { ok: true });

  if (url.pathname === '/lead' && req.method === 'POST') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        if (!d.name || !d.phone) return sendJson(400, { ok: false, error: 'name i phone обов’язкові' });
        const id = 'LEAD-' + Date.now();
        const row = [
          id,
          new Date().toISOString(),
          d.name,
          d.phone,
          d.store || '',
          d.city || '',
          (d.message || '').slice(0, 2000),
          'new',
          'manager'
        ].map(esc).join(',') + '\n';
        fs.appendFileSync(CSV, row);
        sendJson(200, { ok: true, id });
      } catch (e) {
        sendJson(400, { ok: false, error: e.message });
      }
    });
    return;
  }

  sendJson(404, { ok: false, error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('lead-server listening on http://127.0.0.1:' + PORT);
});
