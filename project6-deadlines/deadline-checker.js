// Deadline & invoice checker — sends Telegram reminders about overdue and upcoming items.
// Usage: node deadline-checker.js [--send]
//   --send — actually send Telegram messages (otherwise dry-run)
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./csv-parse.js');

const DIR = __dirname;
const CSV = path.join(DIR, 'deadlines.csv');
const LOG = path.join(DIR, 'checker-log.ndjson');
const REMIND_BEFORE_DAYS = 3;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8871127080:AAGmUx1lt_6BVvSLK1xDFivIf7l_iA3fTOA';
const SEND = process.argv.includes('--send');

function daysUntil(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

async function sendTelegram(chatId, text) {
  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  const data = await resp.json();
  if (!data.ok) throw new Error('Telegram error: ' + (data.description || resp.status));
  return data;
}

(async () => {
  const items = parseCsv(fs.readFileSync(CSV, 'utf8'));
  const overdue = [];
  const upcoming = [];

  for (const it of items) {
    if (it.status !== 'open') continue;
    const days = daysUntil(it.due_date);
    const label = it.type === 'invoice' ? `💰 Рахунок ${it.title}` : `📋 Задача «${it.title}»`;
    if (days < 0) {
      overdue.push({ it, days, label });
    } else if (days <= REMIND_BEFORE_DAYS) {
      upcoming.push({ it, days, label });
    }
  }

  const lines = [];
  if (overdue.length) {
    lines.push('🚨 ПРОСТРОЧЕНО:');
    for (const { label, days } of overdue) {
      lines.push(`  • ${label} — прострочено на ${Math.abs(days)} дн.`);
    }
  }
  if (upcoming.length) {
    lines.push(`⏳ Дедлайн протягом ${REMIND_BEFORE_DAYS} дн.:`);
    for (const { label, days } of upcoming) {
      lines.push(`  • ${label} — ${days === 0 ? 'сьогодні' : `через ${days} дн.`}`);
    }
  }

  const summary = {
    checked_at: new Date().toISOString(),
    total: items.length,
    open: items.filter(i => i.status === 'open').length,
    overdue: overdue.length,
    upcoming: upcoming.length,
    telegram_sent: false,
    dry_run: !SEND
  };

  fs.appendFileSync(LOG, JSON.stringify({ ...summary, detail: { overdue: overdue.map(o => o.it.id), upcoming: upcoming.map(u => u.it.id) } }) + '\n');

  if (!lines.length) {
    summary.message = 'Все добре — прострочених немає.';
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const text = '📅 Контроль дедлайнів\n' + lines.join('\n');

  if (SEND) {
    // chat id: try username, or read from env
    const chatId = process.env.TELEGRAM_CHAT_ID || '@alex_d64';
    await sendTelegram(chatId, text);
    summary.telegram_sent = true;
    summary.message = 'Нагадування надіслано в Telegram.';
  } else {
    summary.message = 'Dry-run (без відправки). Для відправки: node deadline-checker.js --send';
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!SEND) console.log('\n--- Текст повідомлення ---\n' + text);
})();
