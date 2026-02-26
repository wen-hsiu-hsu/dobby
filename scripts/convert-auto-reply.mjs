import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = join(__dirname, '..', 'Dobby auto reply.csv');
const outDir = join(__dirname, '..', 'src', 'data');
const outPath = join(outDir, 'auto-reply.json');

const content = readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, ''); // strip BOM
const lines = content.split('\n');
const header = lines[0].split(',');
const messageIdx = header.indexOf('message');
const replyIdx = header.indexOf('reply');

const results = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  // Parse CSV respecting quoted fields
  const fields = [];
  let current = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);

  const trigger = fields[messageIdx];
  const reply = fields[replyIdx];
  if (trigger && reply) {
    results.push({ trigger, reply });
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
console.log(`Converted ${results.length} entries to ${outPath}`);
