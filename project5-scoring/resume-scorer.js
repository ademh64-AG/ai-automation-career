// Resume scorer: evaluates each resume against a vacancy description via LLM,
// produces score 1-10, strengths, gaps, verdict. Saves CSV + HTML report,
// optionally sends top candidates to Telegram.
// Usage: node resume-scorer.js [--send]
const fs = require('fs');
const path = require('path');
const { ENV } = require('../shared-secrets/env.js');

const DIR = __dirname;
const VACANCY = path.join(DIR, 'vacancy.txt');
const RESUMES_DIR = path.join(DIR, 'resumes');
const OUT_DIR = path.join(DIR, 'reports');
const LOG = path.join(DIR, 'scoring-log.ndjson');

const GROQ_KEY = process.env.GROQ_API_KEY || ENV.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || ENV.GEMINI_API_KEY || '';
const LLM = process.env.LLM || (GROQ_KEY ? 'groq' : 'gemini');
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GEMINI_MODEL = 'gemini-3.5-flash';
const BOT_TOKEN = '8871127080:AAGmUx1lt_6BVvSLK1xDFivIf7l_iA3fTOA';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8644795194';
const SEND = process.argv.includes('--send');

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

async function scoreOne(name, resumeText, vacancyText) {
  const prompt =
    'Ти — HR-аналітик. Оціни резюме кандидата на відповідність вакансії. ' +
    'Поверни ТІЛЬКИ JSON: {"score": (ціле число 1–10), "verdict": "yes"|"maybe"|"no", ' +
    '"strengths": [3–4 рядки], "gaps": [2–3 рядки], "comment": "1 речення підсумку"}. ' +
    'Оцінюй чесно: score 7+ = "yes", 4–6 = "maybe", 1–3 = "no".\n\n' +
    '===== ВАКАНСІЯ =====\n' + vacancyText + '\n\n' +
    '===== РЕЗЮМЕ КАНДИДАТА =====\n' + resumeText;
  return callLLM(prompt);
}

(async () => {
  const vacancyText = fs.readFileSync(VACANCY, 'utf8');
  const files = fs.readdirSync(RESUMES_DIR).filter(f => /\.(txt|md)$/.test(f)).sort();
  const results = [];

  for (const f of files) {
    const text = fs.readFileSync(path.join(RESUMES_DIR, f), 'utf8');
    let parsed = null, error = null;
    try {
      parsed = await scoreOne(f, text, vacancyText);
    } catch (e) { error = e.message; }
    results.push({ file: f, parsed, error });
    console.log('✔ ' + f + (error ? ' ПОМИЛКА: ' + error : ' → score ' + (parsed?.score ?? '-') + '/' + (parsed?.verdict ?? '')));
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const csvPath = path.join(OUT_DIR, `scoring-${stamp}.csv`);
  const csvLines = ['file,score,verdict,comment,strengths,gaps'];
  for (const r of results) {
    csvLines.push([r.file, r.parsed?.score ?? '', r.parsed?.verdict ?? '', r.parsed?.comment ?? '', (r.parsed?.strengths || []).join('; '), (r.parsed?.gaps || []).join('; ')].map(esc).join(','));
  }
  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n');

  const sorted = [...results].sort((a, b) => (b.parsed?.score ?? -1) - (a.parsed?.score ?? -1));
  const rowsHtml = sorted.map(r => {
    const p = r.parsed || {};
    return `<tr><td>${r.file}</td><td><b>${p.score ?? '-'}</b>/10</td><td>${p.verdict ?? '-'}</td><td>${p.comment ?? (r.error || '')}</td><td>${(p.strengths || []).join('<br>')}</td><td>${(p.gaps || []).join('<br>')}</td></tr>`;
  }).join('\n');

  const html = `<!doctype html><html lang="uk"><meta charset="utf-8"><title>Скоринг резюме ${stamp}</title>
<body style="font-family:sans-serif;max-width:1000px;margin:2rem auto">
<h1>🧠 Скоринг резюме кандидатів — ${stamp}</h1>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>Файл</th><th>Бал</th><th>Вердикт</th><th>Коментар</th><th>Сильні сторони</th><th>Прогалини</th></tr>
${rowsHtml}
</table>
</body></html>`;
  const htmlPath = path.join(OUT_DIR, `scoring-${stamp}.html`);
  fs.writeFileSync(htmlPath, html);

  const ev = { at: new Date().toISOString(), date: stamp, candidates: results.length, avg: (results.reduce((s, r) => s + (r.parsed?.score || 0), 0) / results.length).toFixed(1), report: path.basename(htmlPath), telegram_sent: false };
  fs.appendFileSync(LOG, JSON.stringify(ev) + '\n');

  if (SEND) {
    const lines = sorted.slice(0, 3).map(r => `• ${r.file.replace(/\.txt$/, '')}: ${r.parsed?.score}/10 (${r.parsed?.verdict}) — ${r.parsed?.comment}`);
    const text = `🧠 Скоринг резюме (${stamp})\nТоп-3:\n${lines.join('\n')}`;
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
