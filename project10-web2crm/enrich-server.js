// Lead enrichment service: takes a raw lead, LLM-extracts meaning,
// sets priority, drafts manager reply, posts notification to Telegram.
//   POST /enrich  {lead: {id, name, phone, store, city, message}}
//   GET  /health
const http = require('http');
const path = require('path');
const { ENV } = require('../shared-secrets/env.js');

const PORT = 8794;
const GROQ_KEY = process.env.GROQ_API_KEY || ENV.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || ENV.GEMINI_API_KEY || '';
const LLM = process.env.LLM || (GROQ_KEY ? 'groq' : 'gemini');
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GEMINI_MODEL = 'gemini-3.5-flash';
const BOT_TOKEN = '8871127080:AAGmUx1lt_6BVvSLK1xDFivIf7l_iA3fTOA';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8644795194';

async function callLLM(prompt) {
  if (LLM === 'groq' && GROQ_KEY) {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
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

async function enrich(lead) {
  const prompt =
    'Ти — CRM-асистент дистриб’ютора оптових поставок. За заявкою клієнта:\n' +
    '1) зрозумій намір (intent): "buy" (хоче купити), "partner" (хоче співпрацю), "info" (просить інформацію), "other";\n' +
    '2) визнач пріоритет (priority): "high" (готова купівля/терміново), "normal", "low";\n' +
    '3) склади коротке резюме (summary, 1 речення);\n' +
    '4) згенеруй чернетку відповіді клієнту (draft, 2–3 речення, ввічливо).\n' +
    'Поверни ТІЛЬКИ JSON: {"intent": "...", "priority": "...", "summary": "...", "draft": "..."}.\n\n' +
    'ЗАЯВКА:\n' + JSON.stringify(lead, null, 2);
  return callLLM(prompt);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
  const sendJson = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  if (url.pathname === '/health') return sendJson(200, { ok: true });

  if (url.pathname === '/enrich' && req.method === 'POST') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', async () => {
      try {
        const { lead } = JSON.parse(body);
        if (!lead) return sendJson(400, { ok: false, error: 'lead required' });
        const enriched = await enrich(lead);
        const msg = `🆕 Нова заявка ${lead.id}\n👤 ${lead.name} (${lead.phone})\n🏪 ${lead.store || '—'} / ${lead.city || '—'}\n📝 ${lead.message}\n🎯 Намір: ${enriched.intent} · Пріоритет: ${enriched.priority}\n📌 ${enriched.summary}\n\n📄 Чернетка відповіді:\n${enriched.draft}`;
        const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: CHAT_ID, text: msg.slice(0, 2000) })
        });
        const d = await r.json();
        sendJson(200, { ok: true, ...enriched, telegram_ok: d.ok === true, telegram_error: d.ok ? undefined : d.description });
      } catch (e) {
        sendJson(500, { ok: false, error: e.message });
      }
    });
    return;
  }

  sendJson(404, { ok: false, error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('enrich-server listening on http://127.0.0.1:' + PORT);
});
