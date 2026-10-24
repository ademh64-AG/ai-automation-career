// Generates a demo invoice PDF with proper UTF-16BE hex text encoding
// (so text is truly extractable, including Cyrillic).
// Usage: node make-demo-invoice.js [output.pdf]
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, 'demo-invoice.pdf');

const lines = [
  'РАХУНОК № INV-2026-1042 від 22.10.2026',
  'Постачальник: ТОВ «ЗооГурман», ЄДРПОУ 44556677',
  'Покупець: Зоомагазин «Лапа», м. Кам\'янське',
  '',
  '№ | Найменування | К-сть | Ціна | Сума',
  '1 | Корм сухий для собак 15кг | 5 | 1450.00 | 7250.00',
  '2 | Наповнювач деревний 20л | 10 | 320.00 | 3200.00',
  '3 | Миска керамічна 0.5л | 8 | 180.00 | 1440.00',
  '',
  'Разом до сплати: 11890.00 грн',
  'ПДВ (20%): 1981.67 грн',
  'Оплата до: 05.11.2026',
  'Керівник: О. Демченко'
];

function toHexUtf16be(str) {
  return Array.from(str)
    .map(ch => ch.charCodeAt(0).toString(16).padStart(4, '0'))
    .join(' ');
}

let content = '';
let y = 800;
for (const l of lines) {
  if (l.trim()) content += `BT /F1 11 Tf 50 ${y} Td <${toHexUtf16be(l)}> Tj ET\n`;
  y -= 24;
}

const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /MacRomanEncoding >>'
];

let data = '';
const offsets = [];
for (let i = 0; i < objects.length; i++) {
  offsets.push(Buffer.byteLength(data));
  data += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
}
const xrefStart = Buffer.byteLength(data);
data += 'xref\n0 6\n0000000000 65535 f \n';
for (const off of offsets) data += String(off).padStart(10, '0') + ' 00000 n \n';
data += 'trailer << /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';

fs.writeFileSync(OUT, data);
console.log('PDF written: ' + OUT + ' (' + Buffer.byteLength(data) + ' bytes)');
