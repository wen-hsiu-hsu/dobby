import { CommandType } from '../types/commands.js';
import type { ParsedCommand } from '../types/commands.js';

// Support full-width ＋／－
function normalizeFullWidth(text: string): string {
  return text
    .replace(/＋/g, '+')
    .replace(/－/g, '-');
}

export function parseCommand(text: string): ParsedCommand | null {
  if (!text.startsWith('@Dobby')) return null;

  const normalized = normalizeFullWidth(text);
  const body = normalized.replace(/^@Dobby\s*/, '').trim().replace(/\s+/g, ' ');

  // Exact @Dobby → introduce
  if (body === '') {
    return { type: CommandType.INTRODUCE, rawText: text };
  }

  // Registration: starts with + or - followed by digits, or @mention (+/-N @Name)
  const regMatch = body.match(/^([+\-]\d+)/);
  if (regMatch) {
    return { type: CommandType.REGISTRATION, rawText: text, delta: regMatch[1] };
  }

  // Leave / cancel-leave
  if (body === '假' || body.startsWith('假 ') || body.startsWith('假@')) {
    return { type: CommandType.LEAVE, rawText: text };
  }
  if (body === '銷假' || body.startsWith('銷假 ') || body.startsWith('銷假@')) {
    return { type: CommandType.CANCEL_LEAVE, rawText: text };
  }

  // Registration with @mention first (e.g. "@Dobby @Name +1")
  if (body.startsWith('@')) {
    const hasReg = body.match(/[+\-]\d+/);
    const hasLeave = /假|銷假/.test(body);
    if (hasReg) return { type: CommandType.REGISTRATION, rawText: text, delta: hasReg[0] };
    if (hasLeave) {
      if (body.includes('銷假')) return { type: CommandType.CANCEL_LEAVE, rawText: text };
      return { type: CommandType.LEAVE, rawText: text };
    }
  }

  // Owe
  if (body === '欠' || body === 'owe') {
    return { type: CommandType.OWE, rawText: text };
  }

  // Command list
  if (body === 'command' || body === '指令') {
    return { type: CommandType.COMMAND_LIST, rawText: text };
  }

  // Participants
  if (body === 'participants' || body === 'people' || body === '報名人') {
    return { type: CommandType.PARTICIPANTS, rawText: text };
  }

  // Next event (admin): "@Dobby next"
  if (body === 'next') {
    return { type: CommandType.NEXT_EVENT, rawText: text };
  }

  // News / announcement
  if (body === 'news' || body === 'announcement' || body === '公告') {
    return { type: CommandType.NEWS, rawText: text };
  }

  // Payment
  if (body === 'payment' || body === '付款') {
    return { type: CommandType.PAYMENT, rawText: text };
  }

  return { type: CommandType.UNKNOWN, rawText: text };
}

export function isCommand(text: string): boolean {
  return text.startsWith('@Dobby');
}
