import { readFileSync } from 'fs';
import { join } from 'path';

interface AutoReplyRule {
  trigger: string;
  reply: string;
}

const dataPath = join(process.cwd(), 'src', 'data', 'auto-reply.json');
const rules: AutoReplyRule[] = JSON.parse(readFileSync(dataPath, 'utf-8'));

export function findReply(text: string): string | null {
  for (const rule of rules) {
    if (text.includes(rule.trigger)) {
      return rule.reply;
    }
  }
  return null;
}
