// Client data cleaning: normalize phones (rules), structure addresses (LLM),
// deduplicate by phone and by normalized address. Emits clean CSV + HTML report.
// Usage: node data-cleaner.js [--send]
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('../project6-deadlines/csv-parse.js');
const { ENV } = require('../shared-secrets/env.js');

const DIR = __dirname;
const RAW = path.join(DIR, 'clients-raw.csv');
const CLEAN = path.join(DIR, 'clients-clean.csv');
const OUT_DIR = path.join(DIR, 'reports');
const LOG = path.join(DIR, 'clean-log.ndjson');

const GROQ_KEY = process.env.GROQ_API_KEY || ENV.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || ENV.GEMINI_API_KEY || '';
const LLM = process.env.LLM || (GROQ_KEY ? 'groq' : 'gemini');
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GEMINI_MODEL = 'gemini-3.5-flash';
const BOT_TOKEN = '8871127080:AAGmUx1lt_6BVvSLK1xDFivIf7l_iA3fTOA';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8644795194';
const SEND = process.argv.includes('--send');

// ---- phone normalization (deterministic) ----
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.startsWith('0')) return '+38' + digits;
  if (digits.length === 12 && digits.startsWith('380')) return '+' + digits;
  if (digits.length === 11 && digits.startsWith('8')) return '+38' + digits.slice(1);
  if (digits.length === 12 && digits.startsWith('38')) return '+' + digits;
  return digits.length >= 10 ? '+' + digits.slice(-12) : digits;
}

function normName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
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

async function structureAddress(rawAddr) {
  const prompt =
    'Ти — асистент з нормалізації адрес. З довільного тексту адреси витягни структурований JSON: ' +
    '{"city": "місто (без слова м./г.)", "street": "вулиця без типу (вул./пр.)", "street_type": "вулиця|проспект|провулок|шосе|б-р", "building": "номер будинку", "apt": "квартира або порожній рядок"}. ' +
    'Якщо частини немає — порожній рядок. Не вигадуй.\n\nАдреса: ' + rawAddr;
  return callLLM(prompt);
}

(async () => {
  const rows = parseCsv(fs.readFileSync(RAW, 'utf8'));
  const cleaned = [];
  let phoneFixed = 0, addrStructured = 0, dupRemoved = 0;

  const seenByPhone = new Set();
  const seenByAddr = new Set();

  for (const r of rows) {
    const phone = normalizePhone(r.phone);
    if (phone && phone !== String(r.phone || '').replace(/\s+/g, '')) phoneFixed++;

    let city = '', street = '', building = '', apt = '', addrKey = '';
    try {
      const a = await structureAddress(r.address);
      city = (a.city || '').trim();
      street = (a.street || '').trim();
      building = (a.building || '').trim();
      apt = (a.apt || '').trim();
      if (city || street || building) {
        addrStructured++;
        addrKey = normName(city + '|' + street + '|' + building);
      }
    } catch (e) {
      // fallback: leave raw, no structured fields
      addrKey = normName(r.address);
    }

    // dedup by phone (prefer first/earlier row)
    const phoneKey = phone;
    if (phoneKey && seenByPhone.has(phoneKey)) { dupRemoved++; continue; }
    if (addrKey && seenByAddr.has(addrKey)) { dupRemoved++; continue; }
    if (phoneKey) seenByPhone.add(phoneKey);
    if (addrKey) seenByAddr.add(addrKey);

    cleaned.push({
      id: r.id,
      name: r.name.trim(),
      phone,
      city,
      street,
      building,
      apt,
      address_raw: r.address.trim(),
      comment: r.comment.trim()
    });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const header = 'id,name,phone,city,street,building,apt,comment';
  const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const lines = cleaned.map(c => [c.id, c.name, c.phone, c.city, c.street, c.building, c.apt, c.comment].map(esc).join(','));
  fs.writeFileSync(CLEAN, header + '\n' + lines.join('\n') + '\n');

  const stamp = new Date().toISOString().slice(0, 10);
  const rowsHtml = cleaned.map(c => `<tr><td>${c.id}</td><td>${c.name}</td><td>${c.phone}</td><td>${c.city} ${c.street} ${c.building}${c.apt ? ' кв ' + c.apt : ''}</td><td>${c.comment}</td></tr>`).join('\n');
  const html = `<!doctype html><html lang="uk"><meta charset="utf-8"><title>Очистка даних ${stamp}</title>
<body style="font-family:sans-serif;max-width:1000px;margin:2rem auto">
<h1>🧹 Очистка даних клієнтів — ${stamp}</h1>
<p>Вхідних записів: <b>${rows.length}</b> → після очистки: <b>${cleaned.length}</b></p>
<ul><li>Нормалізовано телефонів: ${phoneFixed}</li><li>Структуровано адрес: ${addrStructured}</li><li>Удалено дублів: ${dupRemoved}</li></ul>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>ID</th><th>Ім'я</th><th>Телефон</th><th>Адреса (норм.)</th><th>Коментар</th></tr>
${rowsHtml}
</table></body></html>`;
  const htmlPath = path.join(OUT_DIR, `clean-${stamp}.html`);
  fs.writeFileSync(htmlPath, html);

  const ev = { at: new Date().toISOString(), date: stamp, input: rows.length, output: cleaned.length, phone_fixed: phoneFixed, addresses_structured: addrStructured, duplicates_removed: dupRemoved, report: path.basename(htmlPath), telegram_sent: false };
  fs.appendFileSync(LOG, JSON.stringify(ev) + '\n');

  if (SEND) {
    const text = `🧹 Очистка даних (${stamp})\nВхід: ${rows.length} → після: ${cleaned.length}\nТелефонів нормалізовано: ${phoneFixed}\nАдрес структуровано: ${addrStructured}\nДублів видалено: ${dupRemoved}`;
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
  console.log('\nПерші 3 очищені записи:');
  console.log(cleaned.slice(0, 3).map(c => JSON.stringify(c)).join('\n'));
})();
