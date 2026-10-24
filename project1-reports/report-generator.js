// Report generator: aggregates sales CSV, writes a human-friendly summary via LLM,
// saves report as HTML/MD, optionally sends to Telegram.
// Usage: node report-generator.js [--send]
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('../project6-deadlines/csv-parse.js');
const { ENV } = require('../shared-secrets/env.js');

const DIR = __dirname;
const DATA = path.join(DIR, 'sales-data.csv');
const OUT_DIR = path.join(DIR, 'reports');
const LOG = path.join(DIR, 'reports-log.ndjson');

const GROQ_KEY = process.env.GROQ_API_KEY || ENV.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || ENV.GEMINI_API_KEY || '';
const LLM = process.env.LLM || (GROQ_KEY ? 'groq' : 'gemini');
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GEMINI_MODEL = 'gemini-3.5-flash';
const BOT_TOKEN = '8871127080:AAGmUx1lt_6BVvSLK1xDFivIf7l_iA3fTOA';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8644795194';
const SEND = process.argv.includes('--send');

function money(n) { return n.toLocaleString('uk-UA', { style: 'currency', currency: 'UAH', maximumFractionDigits: 0 }); }

async function callLLM(prompt) {
  if (LLM === 'groq' && GROQ_KEY) {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.4 })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (data.error?.message || ''));
    return data.choices?.[0]?.message?.content || '';
  }
  // default: Gemini
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );
  const data = await resp.json();
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (data.error?.message || ''));
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

(async () => {
  const rows = parseCsv(fs.readFileSync(DATA, 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const byCategory = {};
  let total = 0, units = 0;
  for (const r of rows) {
    const a = parseFloat(r.amount) || 0;
    const q = parseInt(r.quantity, 10) || 0;
    total += a; units += q;
    byCategory[r.category] = (byCategory[r.category] || 0) + a;
  }
  const top = Object.entries(byCategory).sort((x, y) => y[1] - x[1]);
  const dateMin = rows[0].date, dateMax = rows[rows.length - 1].date;

  const prompt =
    'Ти — бізнес-аналітик. Склади короткий звіт про продажі зоомагазину за період ' +
    dateMin + ' … ' + dateMax + '.\n' +
    'Факти (перевір, не вигадуй):\n' +
    '- Загальний оборот: ' + money(total) + ', продано одиниць: ' + units + '\n' +
    '- Продажі за категоріями: ' + top.map(([c, v]) => c + ' — ' + money(v)).join('; ') + '\n' +
    'Формат: 5–7 речень, українською, розділ «Підсумок» з 3–4 пунктами, без зайвого тексту.';

  let llmText = '';
  try { llmText = await callLLM(prompt); } catch (e) { llmText = '(LLM недоступний: ' + e.message + ')'; }

  const stamp = new Date().toISOString().slice(0, 10);
  const html = `<!doctype html><html lang="uk"><meta charset="utf-8"><title>Звіт про продажі ${stamp}</title>
<body style="font-family:sans-serif;max-width:760px;margin:2rem auto">
<h1>Звіт про продажі зоомагазину</h1>
<p><b>Період:</b> ${dateMin} — ${dateMax}</p>
<ul><li><b>Оборот:</b> ${money(total)}</li><li><b>Одиниць продано:</b> ${units}</li></ul>
<h2>За категоріями</h2>
<table border="1" cellpadding="6" cellspacing="0"><tr><th>Категорія</th><th>Сума</th></tr>
${top.map(([c, v]) => `<tr><td>${c}</td><td>${money(v)}</td></tr>`).join('\n')}
</table>
<h2>Підсумок (LLM)</h2>
<p style="white-space:pre-line">${llmText.replace(/</g, '&lt;')}</p>
</body></html>`;

  const md = `# Звіт про продажі ${stamp}\n\n- **Період:** ${dateMin} — ${dateMax}\n- **Оборот:** ${money(total)}\n- **Одиниць:** ${units}\n\n## Підсумок (LLM)\n\n${llmText}\n`;

  const outHtml = path.join(OUT_DIR, `report-${stamp}.html`);
  const outMd = path.join(OUT_DIR, `report-${stamp}.md`);
  fs.writeFileSync(outHtml, html);
  fs.writeFileSync(outMd, md);

  const ev = { at: new Date().toISOString(), date: stamp, total, units, top: top.map(([c, v]) => c + ':' + v), report_html: path.basename(outHtml), llm_chars: llmText.length, telegram_sent: false };
  fs.appendFileSync(LOG, JSON.stringify(ev) + '\n');

  if (SEND && llmText && !llmText.startsWith('(LLM')) {
    const text = `📊 Звіт про продажі (${dateMin} — ${dateMax})\n\n📈 Оборот: ${money(total)}, одиниць: ${units}\n\n${llmText.slice(0, 2000)}`;
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text })
    });
    const data = await resp.json();
    ev.telegram_sent = data.ok === true;
    if (!data.ok) ev.telegram_error = data.description;
  }

  console.log(JSON.stringify(ev, null, 2));
})();
