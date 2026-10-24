// Content autopublisher: turns raw source notes into Telegram-ready posts via LLM,
// publishes them (optional), tracks published state.
// Usage:
//   node content-autopublisher.js --draft      — show generated post without publishing
//   node content-autopublisher.js --publish    — generate and publish to Telegram
//   node content-autopublisher.js --list       — list published/unpublished sources
const fs = require('fs');
const path = require('path');
const { ENV } = require('../shared-secrets/env.js');

const DIR = __dirname;
const SOURCES = path.join(DIR, 'sources');
const STATE = path.join(DIR, 'published.json');
const LOG = path.join(DIR, 'content-log.ndjson');

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
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.6 })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (data.error?.message || ''));
    return data.choices?.[0]?.message?.content || '';
  }
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (data.error?.message || ''));
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function loadState() {
  if (fs.existsSync(STATE)) return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  return [];
}

function saveState(st) { fs.writeFileSync(STATE, JSON.stringify(st, null, 2)); }

async function makePost(sourceText) {
  const prompt =
    'Ти — SMM-менеджер зоомагазину. За сирим матеріалом створи пост для Telegram: ' +
    'емоційний заголовок (1 речення), далі 3–5 речень корисного/цікавого тексту, ' +
    'наприкінці 2–3 хэштеги (#зоомагазин #зоотовари …). Максимум 900 символів. ' +
    'Українською. Не вигадуй факти, яких немає в матеріалі.\n\nМАТЕРІАЛ:\n' + sourceText;
  return callLLM(prompt);
}

(async () => {
  const mode = process.argv.includes('--publish') ? 'publish' : process.argv.includes('--list') ? 'list' : 'draft';
  const files = fs.readdirSync(SOURCES).filter(f => /\.txt$/.test(f)).sort();
  const state = loadState();
  const publishedIds = new Set(state.map(s => s.file));

  if (mode === 'list') {
    for (const f of files) console.log((publishedIds.has(f) ? '[опубліковано]' : '[у черзі]      ') + ' ' + f);
    return;
  }

  // pick first unpublished source
  const next = files.find(f => !publishedIds.has(f));
  if (!next) {
    console.log('Всі джерела вже опубліковано. Додайте нові у sources/.');
    return;
  }

  const raw = fs.readFileSync(path.join(SOURCES, next), 'utf8');
  const post = await makePost(raw);

  const ev = { at: new Date().toISOString(), file: next, mode, post: post.slice(0, 900), published: false };
  fs.appendFileSync(LOG, JSON.stringify(ev) + '\n');

  if (mode === 'publish') {
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: post.slice(0, 900) })
    });
    const d = await resp.json();
    if (d.ok) {
      state.push({ file: next, published_at: new Date().toISOString() });
      saveState(state);
      ev.published = true;
    } else {
      ev.telegram_error = d.description;
    }
  }

  console.log('Файл: ' + next);
  console.log('Режим: ' + mode);
  console.log('--- ПОСТ ---');
  console.log(post);
  console.log('---');
  console.log(JSON.stringify({ published: ev.published, saved: ev.published, telegram_error: ev.telegram_error || null }, null, 2));
})();
