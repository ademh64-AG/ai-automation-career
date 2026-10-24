// PDF invoice extractor: reads an uncompressed PDF, extracts text lines,
// asks LLM to build structured JSON, appends to invoices.csv.
// Usage: node pdf-extractor.js <file.pdf> [--send]
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('../project6-deadlines/csv-parse.js');
const { ENV } = require('../shared-secrets/env.js');

const DIR = __dirname;
const INVOICES_CSV = path.join(DIR, 'invoices.csv');
const LOG = path.join(DIR, 'extract-log.ndjson');

const GROQ_KEY = process.env.GROQ_API_KEY || ENV.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || ENV.GEMINI_API_KEY || '';
const LLM = process.env.LLM || (GROQ_KEY ? 'groq' : 'gemini');
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GEMINI_MODEL = 'gemini-3.5-flash';
const BOT_TOKEN = '8871127080:AAGmUx1lt_6BVvSLK1xDFivIf7l_iA3fTOA';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8644795194';
const SEND = process.argv.includes('--send');

// Extract text from a minimal PDF with UTF-16BE hex string content (<XXXX...>).
function extractPdfText(buf) {
  const s = buf.toString('latin1');
  const out = [];
  const re = /<([0-9A-Fa-f]{4}(?:\s+[0-9A-Fa-f]{4})*)>/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const nums = m[1].trim().split(/\s+/);
    let t = '';
    for (let i = 0; i < nums.length; i++) {
      const code = parseInt(nums[i], 16);
      if (code >= 0x20) t += String.fromCharCode(code);
    }
    if (t.trim()) out.push(t.trim());
  }
  return out;
}

async function callLLM(prompt) {
  if (LLM === 'groq' && GROQ_KEY) {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
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

function moneyToNumber(v) {
  return parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
}

(async () => {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node pdf-extractor.js <file.pdf> [--send]'); process.exit(1); }
  const lines = extractPdfText(fs.readFileSync(file));
  const text = lines.join('\n');

  const prompt =
    'Ти — асистент, що розпізнає рахунки. З тексту рахунка витягни структурований JSON ' +
    'з полями: {"invoice_no": "...", "date": "YYYY-MM-DD", "supplier": "...", "buyer": "...", ' +
    '"total_amount": 0, "vat_amount": 0, "due_date": "YYYY-MM-DD", "items": [{"name": "...", "qty": 0, "price": 0, "sum": 0}]}. ' +
    'Якщо поля немає — порожній рядок або 0. Не вигадуй.\n\nТекст рахунка:\n' + text;

  let parsed = null;
  let error = null;
  try { parsed = await callLLM(prompt); } catch (e) { error = e.message; }

  const ev = { at: new Date().toISOString(), file: path.basename(file), lines: lines.length, parsed, error };

  if (parsed) {
    // ensure CSV header
    if (!fs.existsSync(INVOICES_CSV)) {
      fs.writeFileSync(INVOICES_CSV, 'invoice_no,date,supplier,total_amount,vat_amount,due_date,status\n');
    }
    const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const row = [
      parsed.invoice_no || '',
      parsed.date || '',
      parsed.supplier || '',
      moneyToNumber(parsed.total_amount),
      moneyToNumber(parsed.vat_amount),
      parsed.due_date || '',
      'open'
    ].map(esc).join(',') + '\n';
    fs.appendFileSync(INVOICES_CSV, row);
    ev.saved_row = row.trim();

    if (SEND) {
      const txt = `🧾 Розпізнано рахунок:\n№ ${parsed.invoice_no} від ${parsed.date}\nПостачальник: ${parsed.supplier}\nСума: ${parsed.total_amount} грн (ПДВ ${parsed.vat_amount})\nОплата до: ${parsed.due_date}\nПозицій: ${(parsed.items || []).length}`;
      const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text: txt })
      });
      const d = await resp.json();
      ev.telegram_sent = d.ok === true;
      if (!d.ok) ev.telegram_error = d.description;
    }
  }

  fs.appendFileSync(LOG, JSON.stringify(ev) + '\n');
  console.log(JSON.stringify(ev, null, 2));
})();
