// Import new rows from an external ledger export (e.g. 1C/BAS Excel -> CSV)
// into deadlines.csv. Skips rows whose id already exists.
// Usage: node import-from-ledger.js path/to/export.csv
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./csv-parse.js');

const DIR = __dirname;
const CSV = path.join(DIR, 'deadlines.csv');

function serializeCsv(rows) {
  const header = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) lines.push(header.map(h => esc(r[h])).join(','));
  return lines.join('\n') + '\n';
}

(async () => {
  const exportFile = process.argv[2];
  if (!exportFile) {
    console.error('Usage: node import-from-ledger.js <export.csv>');
    process.exit(1);
  }
  const exportRows = parseCsv(fs.readFileSync(exportFile, 'utf8'));
  const currentRows = parseCsv(fs.readFileSync(CSV, 'utf8'));
  const existingIds = new Set(currentRows.map(r => r.id));

  const added = [];
  const skipped = [];
  for (const row of exportRows) {
    if (!row.id) continue;
    if (existingIds.has(row.id)) {
      skipped.push(row.id);
    } else {
      // normalize: ensure all required fields exist
      const clean = {
        id: row.id,
        type: row.type || 'task',
        title: row.title || row.id,
        due_date: row.due_date || '',
        amount: row.amount || '',
        status: (row.status || 'open').toLowerCase(),
        assignee: row.assignee || 'alex_d64'
      };
      currentRows.push(clean);
      existingIds.add(clean.id);
      added.push(clean.id);
    }
  }

  fs.writeFileSync(CSV, serializeCsv(currentRows));
  console.log(JSON.stringify({
    imported_from: exportFile,
    added,
    skipped_duplicates: skipped,
    total_now: currentRows.length
  }, null, 2));
})();
