import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

interface AutoReplyRule {
  trigger: string;
  reply: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, '..', 'data', 'auto-reply.json');
const rules: AutoReplyRule[] = JSON.parse(readFileSync(dataPath, 'utf-8'));

export function findReply(text: string): string | null {
  for (const rule of rules) {
    if (text.includes(rule.trigger)) {
      return rule.reply;
    }
  }
  return null;
}
