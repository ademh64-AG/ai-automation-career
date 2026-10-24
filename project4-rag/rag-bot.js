// RAG chatbot MVP: keyword retrieval over chunks + LLM generation grounded on context.
// Usage:
//   node rag-bot.js "питання"                 — one answer to stdout
//   node rag-bot.js --test                     — run test-questions.csv, show retrieval accuracy
//   node rag-bot.js "питання" --telegram       — also send answer to Telegram
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('../project6-deadlines/csv-parse.js');
const { ENV } = require('../shared-secrets/env.js');

const DIR = __dirname;
const CHUNKS = path.join(DIR, 'chunks.json');
const TESTS = path.join(DIR, 'test-questions.csv');
const LOG = path.join(DIR, 'rag-log.ndjson');

const GROQ_KEY = process.env.GROQ_API_KEY || ENV.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || ENV.GEMINI_API_KEY || '';
const LLM = process.env.LLM || (GROQ_KEY ? 'groq' : 'gemini');
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GEMINI_MODEL = 'gemini-3.5-flash';
const EMB_MODEL = 'gemini-embedding-001';
const CACHE = path.join(DIR, 'chunks-embeddings.json');
const BOT_TOKEN = '8871127080:AAGmUx1lt_6BVvSLK1xDFivIf7l_iA3fTOA';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8644795194';

async function embedGemini(texts) {
  const out = [];
  for (const t of texts) {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMB_MODEL}:embedContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      body: JSON.stringify({ model: EMB_MODEL, content: { parts: [{ text: t }] } })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error('Embed HTTP ' + resp.status + ': ' + (data.error?.message || ''));
    out.push(data.embedding?.values || []);
  }
  return out;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function ensureEmbeddings(chunks) {
  if (fs.existsSync(CACHE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (cached.length === chunks.length) return cached;
  }
  console.log('Обчислюю ембеддинги для ' + chunks.length + ' чанків...');
  const vecs = await embedGemini(chunks.map(c => (c.heading + '\n' + c.text).slice(0, 1900)));
  const rows = chunks.map((c, i) => ({ ...c, vec: vecs[i] }));
  fs.writeFileSync(CACHE, JSON.stringify(rows));
  return rows;
}

function retrieveVec(query, rows, topN = 3) {
  return new Promise(async (resolve) => {
    try {
      const [qv] = await embedGemini([query]);
      const scored = rows.map(r => ({ chunk: r, score: cosine(qv, r.vec) }))
        .sort((a, b) => b.score - a.score);
      resolve(scored.slice(0, topN).map(x => x.chunk));
    } catch (e) {
      console.error('embedding error: ' + e.message);
      resolve([]);
    }
  });
}

const STOPWORDS = new Set(['який', 'яка', 'яке', 'які', 'де', 'коли', 'хто', 'що', 'чи', 'як', 'та', 'і', 'й', 'в', 'у', 'на', 'до', 'з', 'від', 'для', 'за', 'про', 'по', 'при', 'чиє', 'можна', 'бути', 'є', 'це', 'то', 'не', 'ні', 'б', 'ж', 'о', 'під']);

function tokenize(s) {
  return String(s).toLowerCase().replace(/[«»"',.!?;:()]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function retrieve(query, chunks, topN = 3) {
  const qWords = tokenize(query);
  if (!qWords.length) return [];
  const scored = chunks.map(c => {
    const cText = (c.heading + ' ' + c.text).toLowerCase();
    let score = 0;
    for (const w of qWords) {
      if (cText.includes(w)) score += 2; // simple substring hit
      if (c.text.toLowerCase().includes(w)) score += 1; // body hit
    }
    // bonus if query words appear together in heading
    const heading = c.heading.toLowerCase();
    if (qWords.every(w => heading.includes(w))) score += 3;
    return { chunk: c, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map(x => x.chunk);
}

async function callLLM(prompt) {
  if (LLM === 'groq' && GROQ_KEY) {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.2 })
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

async function answer(question, rows) {
  const hits = await retrieveVec(question, rows);
  const context = hits.map((h, i) => `[Документ ${i + 1}: ${h.file} — ${h.heading}]\n${h.text}`).join('\n\n');
  const prompt =
    'Ти — бот підтримки дистриб’ютора алкогольної продукції. Відповідай на основі фактів із контексту. ' +
    'Якщо в контексті є інформація, що стосується питання — використай її і дай конкретну відповідь. ' +
    'Відмовляйся («На жаль, я не маю цієї інформації. Зверніться до менеджера: +38 056 700 00 00») ' +
    'лише тоді, коли контекст порожній або зовсім не стосується питання. ' +
    'Коротко, по-діловому, українською. Не вигадуй цифри та умови, яких немає в контексті.\n\n' +
    'КОНТЕКСТ:\n' + (context || '(порожньо)') + '\n\n' +
    'ПИТАННЯ КЛІЄНТА:\n' + question;
  const text = await callLLM(prompt);
  return { answer: text, hits };
}

(async () => {
  const chunks = JSON.parse(fs.readFileSync(CHUNKS, 'utf8'));
  const rows = await ensureEmbeddings(chunks);

  if (process.argv.includes('--test')) {
    const tests = parseCsv(fs.readFileSync(TESTS, 'utf8'));
    let correctFile = 0, correctHeading = 0;
    const lines = [];
    for (const t of tests) {
      const hits = await retrieveVec(t.question, rows);
      const topFile = hits[0] ? hits[0].file : null;
      const topHeading = hits[0] ? hits[0].heading : null;
      const okFile = topFile === t.expected_file;
      const okHeading = topHeading === t.expected_heading;
      if (okFile) correctFile++;
      if (okHeading) correctHeading++;
      lines.push(`${t.id}|${t.question}|${okFile ? 'OK' : 'MISS'}|${topFile}|${t.expected_file}|${topHeading}|${t.expected_heading}`);
      console.log(lines[lines.length - 1]);
    }
    const total = tests.length;
    console.log('\nRETRIEVAL_FILE_ACCURACY=' + (correctFile / total).toFixed(3));
    console.log('RETRIEVAL_HEADING_ACCURACY=' + (correctHeading / total).toFixed(3));
    return;
  }

  const question = process.argv[2];
  if (!question) { console.error('Usage: node rag-bot.js "питання" [--telegram] | --test'); process.exit(1); }

  const { answer: text, hits } = await answer(question, rows);
  console.log('ПИТАННЯ: ' + question);
  console.log('---');
  console.log('ВІДПОВІДЬ:');
  console.log(text);
  console.log('\n--- Знайдені джерела ---');
  for (const h of hits) console.log(`• ${h.file} → «${h.heading}»`);

  const ev = { at: new Date().toISOString(), question, answer: text, sources: hits.map(h => h.file + ' / ' + h.heading), llm: LLM };
  fs.appendFileSync(LOG, JSON.stringify(ev) + '\n');

  if (process.argv.includes('--telegram')) {
    const msg = `🤖 Питання: ${question}\n\n${text}`;
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg })
    });
    const d = await resp.json();
    console.log('\nTelegram: ' + (d.ok ? 'надіслано' : d.description));
  }
})();
