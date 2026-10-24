// Inbox prioritizer: classifies incoming mail via LLM, applies deterministic
// routing rules, writes a report, sends Telegram alerts for high-priority items.
// Usage: node inbox-prioritizer.js [--send]
const fs = require('fs');
const path = require('path');
const { ENV } = require('../shared-secrets/env.js');

const DIR = __dirname;
const INBOX = path.join(DIR, 'inbox');
const OUT_DIR = path.join(DIR, 'reports');
const LOG = path.join(DIR, 'mailbox-log.ndjson');

const GROQ_KEY = process.env.GROQ_API_KEY || ENV.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || ENV.GEMINI_API_KEY || '';
const LLM = process.env.LLM || (GROQ_KEY ? 'groq' : 'gemini');
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GEMINI_MODEL = 'gemini-3.5-flash';
const BOT_TOKEN = '8871127080:AAGmUx1lt_6BVvSLK1xDFivIf7l_iA3fTOA';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8644795194';
const SEND = process.argv.includes('--send');

function parseMail(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const m = { from: '', subject: '', date: '', body: '' };
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.toLowerCase().startsWith('from:')) m.from = l.slice(5).trim();
    else if (l.toLowerCase().startsWith('subject:')) m.subject = l.slice(8).trim();
    else if (l.toLowerCase().startsWith('date:')) m.date = l.slice(5).trim();
    else if (l.trim() === '' && i > 0) { i++; break; }
    i++;
  }
  m.body = lines.slice(i).join(' ').trim().slice(0, 1500);
  return m;
}

async function callLLM(prompt) {
  if (LLM === 'groq' && GROQ_KEY) {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (data.error?.message || ''));
    const raw = data.choices?.[0]?.message?.content || '';
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    return JSON.parse(raw.slice(a, b + 1));
  }
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (data.error?.message || ''));
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  return JSON.parse(raw.slice(a, b + 1));
}

async function classify(mail) {
  const prompt =
    'Ти — цифровий помічник дистриб’ютора алкоголю. Класифікуй вхідний лист. ' +
    'Поверни ТІЛЬКИ JSON: {"category": "customer|invoice|spam|newsletter|internal|partner|claim|other", ' +
    '"priority": "high|normal|low", "summary": "одне речення", "action": "що зробити (коротко)"}.\n' +
    'Правила: термінові клієнтські питання/рекламації → priority=high. ' +
    'Рахунки → category=invoice. Реклама/спам → spam. Розсилки → newsletter.\n\n' +
    'ЛИСТ:\nFROM: ' + mail.from + '\nSUBJECT: ' + mail.subject + '\n' + mail.body;
  return callLLM(prompt);
}

(async () => {
  const files = fs.readdirSync(INBOX).filter(f => /\.txt$/.test(f)).sort();
  const results = [];

  for (const f of files) {
    const mail = parseMail(fs.readFileSync(path.join(INBOX, f), 'utf8'));
    let cls = null, error = null;
    try { cls = await classify(mail); } catch (e) { error = e.message; }
    results.push({ file: f, mail, cls, error });
    console.log('✔ ' + f + (error ? ' ПОМИЛКА: ' + error : ' → ' + (cls?.category ?? '') + '/' + (cls?.priority ?? '')));
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const csvPath = path.join(OUT_DIR, `mailbox-${stamp}.csv`);
  const csvLines = ['file,from,subject,category,priority,summary,action'];
  for (const r of results) {
    csvLines.push([r.file, r.mail.from, r.mail.subject, r.cls?.category ?? '', r.cls?.priority ?? '', r.cls?.summary ?? (r.error || ''), r.cls?.action ?? ''].map(esc).join(','));
  }
  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n');

  const rowsHtml = results.map(r => {
    const c = r.cls || {};
    const color = c.priority === 'high' ? 'style="background:#ffe0e0"' : c.priority === 'low' ? 'style="background:#e0ffe0"' : '';
    return `<tr ${color}><td>${r.file}</td><td>${r.mail.from}</td><td>${r.mail.subject}</td><td>${c.category ?? '-'}</td><td>${c.priority ?? '-'}</td><td>${c.summary ?? (r.error || '')}</td><td>${c.action ?? ''}</td></tr>`;
  }).join('\n');

  const html = `<!doctype html><html lang="uk"><meta charset="utf-8"><title>Приоритизація пошти ${stamp}</title>
<body style="font-family:sans-serif;max-width:1100px;margin:2rem auto">
<h1>📥 Приоритизація вхідної пошти — ${stamp}</h1>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>Файл</th><th>Відправник</th><th>Тема</th><th>Категорія</th><th>Пріоритет</th><th>Резюме</th><th>Дія</th></tr>
${rowsHtml}
</table>
</body></html>`;
  const htmlPath = path.join(OUT_DIR, `mailbox-${stamp}.html`);
  fs.writeFileSync(htmlPath, html);

  const counts = {};
  for (const r of results) {
    const c = r.cls?.category || 'error';
    counts[c] = (counts[c] || 0) + 1;
  }
  const ev = { at: new Date().toISOString(), date: stamp, total: results.length, counts, report: path.basename(htmlPath), telegram_sent: false };
  fs.appendFileSync(LOG, JSON.stringify(ev) + '\n');

  if (SEND) {
    const high = results.filter(r => r.cls?.priority === 'high' && r.cls?.category !== 'spam');
    const lines = high.map(r => `🚨 ${r.mail.from}: «${r.mail.subject}» → ${r.cls?.category} (${r.cls?.summary})`);
    const text = `📥 Приоритизація пошти (${stamp})\nПеревірено: ${results.length} листів\n\n${lines.length ? lines.join('\n') : 'Термінових листів немає.'}`;
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text })
    });
    const d = await resp.json();
    ev.telegram_sent = d.ok === true;
    if (!d.ok) ev.telegram_error = d.description;
  }

  console.log(JSON.stringify(ev, null, 2));
})();
