// Minimal .env parser: reads KEY=VALUE lines into an object.
const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

const ENV = loadEnv(path.join(__dirname, '..', 'shared-secrets', '.env'));
module.exports = { loadEnv, ENV };
