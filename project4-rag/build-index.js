// Builds a chunk index from docs/*.md: splits by headings (## / ###),
// stores chunks in chunks.json (JSON handles multi-line text correctly).
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const DOCS = path.join(DIR, 'docs');
const OUT = path.join(DIR, 'chunks.json');

const files = fs.readdirSync(DOCS).filter(f => f.endsWith('.md')).sort();
const chunks = [];

for (const f of files) {
  const text = fs.readFileSync(path.join(DOCS, f), 'utf8');
  const lines = text.split('\n');
  let currentHeading = '(документ)';
  let buf = [];
  let hCount = 0;

  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) chunks.push({ file: f, heading: currentHeading, text: body });
    buf = [];
  };

  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('## ') || l.startsWith('### ')) {
      flush();
      currentHeading = l.replace(/^#{2,3}\s*/, '').trim();
      hCount++;
    } else if (l) {
      buf.push(l);
    } else if (buf.length) {
      buf.push('');
    }
  }
  flush();
  console.log(f + ' → ' + hCount + ' розділів, ' + chunks.filter(c => c.file === f).length + ' чанків');
}

fs.writeFileSync(OUT, JSON.stringify(chunks, null, 2));
console.log('TOTAL_CHUNKS=' + chunks.length);
console.log('Index written: ' + OUT);
