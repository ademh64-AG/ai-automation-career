// Shared ledger store: load/save deadlines.csv and import rows from exports.
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./csv-parse.js');

const DIR = __dirname;
const CSV = path.join(DIR, 'deadlines.csv');

function serializeCsv(rows) {
  if (!rows.length) return '';
  const header = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) lines.push(header.map(h => esc(r[h])).join(','));
  return lines.join('\n') + '\n';
}

function loadRows() {
  if (!fs.existsSync(CSV)) return [];
  return parseCsv(fs.readFileSync(CSV, 'utf8'));
}

function saveRows(rows) {
  fs.writeFileSync(CSV, serializeCsv(rows));
}

function normalizeRow(row) {
  return {
    id: String(row.id || '').trim(),
    type: (row.type || 'task').trim(),
    title: (row.title || row.id || '').trim(),
    due_date: (row.due_date || '').trim(),
    amount: (row.amount || '').trim(),
    status: (row.status || 'open').trim().toLowerCase(),
    assignee: (row.assignee || 'alex_d64').trim()
  };
}

// Import rows from one export file into deadlines.csv. Returns {added, skipped}.
function importExport(exportRows) {
  const current = loadRows();
  const existingIds = new Set(current.map(r => r.id));
  const added = [];
  const skipped = [];
  for (const raw of exportRows) {
    const row = normalizeRow(raw);
    if (!row.id) continue;
    if (existingIds.has(row.id)) {
      skipped.push(row.id);
    } else {
      current.push(row);
      existingIds.add(row.id);
      added.push(row.id);
    }
  }
  saveRows(current);
  return { added, skipped, total_now: current.length };
}

module.exports = { loadRows, saveRows, importExport, normalizeRow, CSV };
