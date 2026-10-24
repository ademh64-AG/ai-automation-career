// Local journal bridge service (no external accounts).
// - POST /journal   {id, created_at, category, urgency, object, summary, status, draft}
// - GET  /approve?id=X                 -> HTML page with Approve/Reject buttons
// - GET  /decide?id=X&decision=approve|reject -> updates status, rewrites CSV
// - GET  /health
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.env.USERPROFILE || 'C:/Users/Administrator', 'ai-automation-career', 'project');
const NDJSON = path.join(DIR, 'journal.ndjson');
const CSV = path.join(DIR, 'journal.csv');
const CSV_HEADER = '"id","created_at","category","urgency","object","summary","status","draft"\n';

fs.mkdirSync(DIR, { recursive: true });

let state = [];
if (fs.existsSync(NDJSON)) {
  try {
    for (const line of fs.readFileSync(NDJSON, 'utf8').split('\n')) {
      if (line.trim()) state.push(JSON.parse(line));
    }
  } catch (e) { /* ignore corrupt lines */ }
}

function writeCsv() {
  let out = CSV_HEADER;
  for (const item of state) {
    out += [
      item.id, item.created_at, item.category, item.urgency,
      item.object, item.summary, item.status || 'нова', item.draft || ''
    ].map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',') + '\n';
  }
  fs.writeFileSync(CSV, out);
}

function appendEvent(entry) {
  fs.appendFileSync(NDJSON, JSON.stringify(entry) + '\n');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8790');
  const pathname = url.pathname;

  const sendJson = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  const sendHtml = (code, html) => {
    res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  };

  if (pathname === '/health') return sendJson(200, { ok: true });

  if (pathname === '/journal' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const item = JSON.parse(body);
        if (!item || !item.id) throw new Error('missing id');
        item.status = item.status || 'нова';
        item.draft = item.draft || '';
        state.push(item);
        appendEvent(item);
        writeCsv();
        sendJson(200, { ok: true, saved: true, id: item.id });
      } catch (e) {
        sendJson(400, { ok: false, error: e.message });
      }
    });
    return;
  }

  if (pathname === '/approve') {
    const id = url.searchParams.get('id');
    if (!id) return sendHtml(400, '<p>missing id</p>');
    const item = state.find((s) => s.id === id);
    if (!item) return sendHtml(404, '<p>заявку не знайдено</p>');
    return sendHtml(200, `
      <!doctype html><html lang="uk"><meta charset="utf-8"><title>Підтвердження</title>
      <body style="font-family:sans-serif;padding:2rem">
        <h2>Заявка ${id}</h2>
        <p><b>Категорія:</b> ${item.category} &nbsp; <b>Терміновість:</b> ${item.urgency}</p>
        <p><b>Об'єкт:</b> ${item.object}</p>
        <p><b>Суть:</b> ${item.summary}</p>
        <p><b>Чернетка відповіді:</b></p>
        <blockquote>${item.draft}</blockquote>
        <p><a href="/decide?id=${id}&decision=approve"><button>Підтвердити</button></a>
           <a href="/decide?id=${id}&decision=reject"><button>Відхилити</button></a></p>
      </body></html>`);
  }

  if (pathname === '/decide') {
    const id = url.searchParams.get('id');
    const decision = url.searchParams.get('decision');
    const item = state.find((s) => s.id === id);
    if (!item) return sendHtml(404, '<p>заявку не знайдено</p>');
    if (decision === 'reject') {
      item.status = 'відхилено';
      appendEvent({ id, action: 'decide', decision, at: new Date().toISOString() });
    } else {
      item.status = 'відправлено (демо)';
      item.sent_at = new Date().toISOString();
      appendEvent({ id, action: 'sent', at: item.sent_at });
    }
    writeCsv();
    return sendHtml(200, `<p>Заявку ${id}: статус «${item.status}»</p>`);
  }

  sendJson(404, { ok: false, error: 'not found' });
});

server.listen(8790, '127.0.0.1', () => {
  console.log('journal-server v2 listening on http://127.0.0.1:8790');
});
