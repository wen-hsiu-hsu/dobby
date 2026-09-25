import { readFileSync } from 'fs';
import { join } from 'path';

interface AutoReplyRule {
  trigger: string;
  reply: string;
}

const dataPath = join(process.cwd(), 'src', 'data', 'auto-reply.json');
const rules: AutoReplyRule[] = JSON.parse(readFileSync(dataPath, 'utf-8'));

export function findReply(text: string): string | null {
  const matches = rules.filter((rule) => text.includes(rule.trigger));
  if (matches.length === 0) return null;
  const index = Math.floor(Math.random() * matches.length);
  return matches[index]!.reply;
}
