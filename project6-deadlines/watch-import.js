// Autopilot importer: watches ledger-drop/ for new export files,
// imports them into deadlines.csv, and moves processed files into processed/.
// Usage:
//   node watch-import.js            — one pass (import everything new)
//   node watch-import.js --watch    — keep running, check every N seconds
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./csv-parse.js');
const { importExport } = require('./ledger-store.js');

const DIR = __dirname;
const DROP = path.join(DIR, 'ledger-drop');
const PROCESSED = path.join(DROP, 'processed');
const LOG = path.join(DIR, 'import-log.ndjson');
const CHECK_INTERVAL_MS = 30000; // 30 s in --watch mode

fs.mkdirSync(DROP, { recursive: true });
fs.mkdirSync(PROCESSED, { recursive: true });

function logEvent(ev) {
  fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...ev }) + '\n');
}

function processDrop() {
  const files = fs.readdirSync(DROP).filter(f => f.toLowerCase().endsWith('.csv'));
  const results = [];
  for (const f of files) {
    const full = path.join(DROP, f);
    const mtime = fs.statSync(full).mtime;
    try {
      const rows = parseCsv(fs.readFileSync(full, 'utf8'));
      const { added, skipped, total_now } = importExport(rows);
      // move to processed with timestamp suffix
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = path.join(PROCESSED, stamp + '__' + f);
      fs.renameSync(full, dest);
      const ev = { file: f, added, skipped_duplicates: skipped, total_now, processed_as: path.basename(dest) };
      logEvent(ev);
      results.push(ev);
    } catch (e) {
      const ev = { file: f, error: e.message, mtime: mtime.toISOString() };
      logEvent(ev);
      results.push(ev);
    }
  }
  return results;
}

if (process.argv.includes('--watch')) {
  console.log('watch-import started. Drop folder: ' + DROP);
  setInterval(() => {
    const res = processDrop();
    for (const r of res) console.log(JSON.stringify(r));
  }, CHECK_INTERVAL_MS);
} else {
  const res = processDrop();
  console.log(JSON.stringify({ checked: true, results: res }, null, 2));
}
