// Minimal CSV parser supporting quoted fields (escaped "" inside).
function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const header = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const parts = parseLine(line);
    const row = {};
    header.forEach((h, i) => (row[h.trim()] = (parts[i] || '').trim()));
    return row;
  });
}

function parseLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

module.exports = { parseCsv };
