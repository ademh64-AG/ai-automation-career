// Price Radar: compares our wholesale prices vs competitors and point retail margins,
// computes deltas/trends, writes HTML report, optionally sends Telegram alert.
// Usage: node price-radar.js [--send]
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('../project6-deadlines/csv-parse.js');
const { ENV } = require('../shared-secrets/env.js');

const DIR = __dirname;
const SKU = path.join(DIR, 'sku.csv');
const OURS = path.join(DIR, 'price-ours.csv');
const COMP = path.join(DIR, 'price-competitors.csv');
const POINTS = path.join(DIR, 'points-retail.csv');
const OUT_DIR = path.join(DIR, 'reports');
const LOG = path.join(DIR, 'radar-log.ndjson');

const GROQ_KEY = process.env.GROQ_API_KEY || ENV.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || ENV.GEMINI_API_KEY || '';
const LLM = process.env.LLM || (GROQ_KEY ? 'groq' : 'gemini');
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GEMINI_MODEL = 'gemini-3.5-flash';
const BOT_TOKEN = '8871127080:AAGmUx1lt_6BVvSLK1xDFivIf7l_iA3fTOA';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8644795194';
const SEND = process.argv.includes('--send');

function money(n) { return Math.round(n).toLocaleString('uk-UA') + ' грн'; }
function pct(a, b) { return b ? ((a - b) / b) * 100 : 0; }

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
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (data.error?.message || ''));
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

(async () => {
  const sku = parseCsv(fs.readFileSync(SKU, 'utf8'));
  const ours = parseCsv(fs.readFileSync(OURS, 'utf8'));
  const comp = parseCsv(fs.readFileSync(COMP, 'utf8'));
  const points = parseCsv(fs.readFileSync(POINTS, 'utf8'));

  const skuMap = new Map(sku.map(s => [s.art, s]));
  const oursMap = new Map(ours.map(o => [o.art, o]));

  // latest competitor price per art (and previous for trend)
  const compLatest = new Map();
  const compPrev = new Map();
  const byArt = {};
  for (const c of comp) {
    if (!byArt[c.art]) byArt[c.art] = [];
    byArt[c.art].push(c);
  }
  for (const [art, list] of Object.entries(byArt)) {
    const dates = [...new Set(list.map(x => x.date))].sort();
    const lastDate = dates[dates.length - 1];
    const lastRows = list.filter(x => x.date === lastDate);
    const minLast = Math.min(...lastRows.map(x => parseFloat(x.price)));
    const minLastRow = lastRows.find(x => parseFloat(x.price) === minLast);
    compLatest.set(art, { price: minLast, competitor: minLastRow.competitor, date: lastDate });
    if (dates.length > 1) {
      const prevDate = dates[dates.length - 2];
      const prevRows = list.filter(x => x.date === prevDate);
      const minPrev = Math.min(...prevRows.map(x => parseFloat(x.price)));
      compPrev.set(art, { price: minPrev, date: prevDate });
    }
  }

  const rows = [];
  for (const s of sku) {
    const our = oursMap.get(s.art);
    if (!our) continue;
    const wholesale = parseFloat(our.wholesale_price) || 0;
    const compC = compLatest.get(s.art);
    const minComp = compC ? compC.price : null;

    // trend: latest vs previous min competitor price
    let trend = null;
    if (compC && compPrev.has(s.art)) {
      const prev = compPrev.get(s.art).price;
      trend = pct(compC.price, prev); // negative = competitor dropped
    }

    // point margins
    const pointRows = points.filter(p => p.art === s.art);
    let minMargin = null;
    let marginPoints = [];
    for (const p of pointRows) {
      const m = pct(parseFloat(p.price), wholesale);
      if (minMargin === null || m < minMargin) minMargin = m;
      marginPoints.push({ point: p.point, price: parseFloat(p.price), margin: m });
    }

    const deltaComp = minComp !== null ? pct(minComp, wholesale) : null; // negative = competitor cheaper
    rows.push({
      art: s.art,
      name: s.name,
      category: s.category,
      wholesale,
      minComp,
      deltaComp,
      trend,
      minMargin,
      marginPoints,
      compDate: compC ? compC.date : null
    });
  }

  // flags
  const risks = rows.filter(r => r.deltaComp !== null && r.deltaComp < 0);
  const lowMargin = rows.filter(r => r.minMargin !== null && r.minMargin < 15);

  // LLM summary
  const riskLines = risks.map(r => `  - ${r.name}: конкурент ${money(r.minComp)} проти наших ${money(r.wholesale)} (${r.deltaComp.toFixed(1)}%)`).join('\n');
  const prompt =
    'Ти — аналітик з ціноутворення дистриб’ютора алкоголю. Дай коротку рекомендацію (4–6 речень, українською) ' +
    'та 4 пункти-дії: де знизити ціну, де утримати, які точки потребують уваги (низька маржа).\n' +
    'ФАКТИ:\n' +
    '- Позицій, де конкурент дешевший за нас: ' + risks.length + '\n' +
    riskLines + '\n' +
    '- Точок з маржею нижче 15%: ' + lowMargin.length + '\n' +
    lowMargin.map(r => `  - ${r.name} (${r.category}) — маржа ${r.minMargin.toFixed(1)}%`).join('\n');

  let llm = '';
  try { llm = await callLLM(prompt); } catch (e) { llm = '(LLM недоступний: ' + e.message + ')'; }

  // HTML report
  const stamp = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rowsHtml = rows.map(r => {
    const trendTxt = r.trend === null ? '—' : (r.trend < 0 ? `↓ ${Math.abs(r.trend).toFixed(1)}%` : `↑ ${r.trend.toFixed(1)}%`);
    const deltaTxt = r.deltaComp === null ? '—' : (r.deltaComp < 0 ? `<b style="color:red">${r.deltaComp.toFixed(1)}%</b>` : `<b style="color:green">+${r.deltaComp.toFixed(1)}%</b>`);
    return `<tr><td>${r.art}</td><td>${r.name}</td><td>${r.category}</td><td>${money(r.wholesale)}</td><td>${r.minComp ? money(r.minComp) : '—'}</td><td>${deltaTxt}</td><td>${trendTxt}</td><td>${r.minMargin === null ? '—' : r.minMargin.toFixed(1) + '%'}</td></tr>`;
  }).join('\n');

  const html = `<!doctype html><html lang="uk"><meta charset="utf-8"><title>Радар цін ${stamp}</title>
<body style="font-family:sans-serif;max-width:900px;margin:2rem auto">
<h1>🛰 Радар цін — ${stamp}</h1>
<p><b>Позицій з ризиком (конкурент дешевший):</b> ${risks.length}</p>
<p><b>Точок з маржею &lt;15%:</b> ${lowMargin.length}</p>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>Артикул</th><th>Назва</th><th>Категорія</th><th>Наш опт</th><th>Мін. конкурент</th><th>Дельта</th><th>Тренд</th><th>Мін. маржа точки</th></tr>
${rowsHtml}
</table>
<h2>Рекомендації (LLM)</h2>
<p style="white-space:pre-line">${llm.replace(/</g, '&lt;')}</p>
</body></html>`;
  const outHtml = path.join(OUT_DIR, `radar-${stamp}.html`);
  fs.writeFileSync(outHtml, html);

  const ev = { at: new Date().toISOString(), date: stamp, sku_total: rows.length, risks: risks.length, low_margin: lowMargin.length, report: path.basename(outHtml), llm_chars: llm.length, telegram_sent: false };
  fs.appendFileSync(LOG, JSON.stringify(ev) + '\n');

  if (SEND && llm && !llm.startsWith('(LLM')) {
    const text =
      `🛰 Радар цін (${stamp})\n\n` +
      `⚠️ Конкурент дешевший: ${risks.length} поз.\n` +
      risks.slice(0, 4).map(r => ` • ${r.name}: ${money(r.minComp)} vs ${money(r.wholesale)} (${r.deltaComp.toFixed(1)}%)`).join('\n') + '\n' +
      `\n📉 Точки з маржею <15%: ${lowMargin.length}\n` +
      lowMargin.slice(0, 3).map(r => ` • ${r.name}: ${r.minMargin.toFixed(1)}%`).join('\n') + '\n' +
      `\n💡 ${llm.slice(0, 1100)}`;
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
