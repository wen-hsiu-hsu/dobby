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
  // English command keywords are case-insensitive; Chinese keywords and the
  // @Dobby prefix itself are unaffected (prefix case-sensitivity is by design,
  // see command-parser.test.ts).
  const bodyLower = body.toLowerCase();

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
    // Strip the mention token itself (e.g. "@小明") before scanning for a command,
    // so a display name that happens to contain "-1"/"+2"/"假" (e.g. "@小明-1號",
    // "@放假中") isn't mistaken for a registration/leave command. Commands are
    // always space-separated from the mention (see docs/commands.md), so
    // everything up to the next whitespace is the mention, not the command.
    const afterMention = body.replace(/^@\S+/, '');
    const hasReg = afterMention.match(/[+\-]\d+/);
    const hasLeave = /假|銷假/.test(afterMention);
    if (hasReg) return { type: CommandType.REGISTRATION, rawText: text, delta: hasReg[0] };
    if (hasLeave) {
      if (afterMention.includes('銷假')) return { type: CommandType.CANCEL_LEAVE, rawText: text };
      return { type: CommandType.LEAVE, rawText: text };
    }
  }

  // Owe
  if (body === '欠' || bodyLower === 'owe') {
    return { type: CommandType.OWE, rawText: text };
  }

  // Command list
  if (bodyLower === 'command' || body === '指令') {
    return { type: CommandType.COMMAND_LIST, rawText: text };
  }

  // Participants
  if (bodyLower === 'participants' || bodyLower === 'people' || body === '報名人') {
    return { type: CommandType.PARTICIPANTS, rawText: text };
  }

  // Next event (admin): "@Dobby next"
  if (bodyLower === 'next') {
    return { type: CommandType.NEXT_EVENT, rawText: text };
  }

  // News / announcement
  if (bodyLower === 'news' || bodyLower === 'announcement' || body === '公告') {
    return { type: CommandType.NEWS, rawText: text };
  }

  // Payment
  if (bodyLower === 'payment' || body === '付款') {
    return { type: CommandType.PAYMENT, rawText: text };
  }

  // Season announcement (admin): "@Dobby season 2026Q2" — "season" keyword is
  // case-insensitive, but the season arg itself keeps its original casing
  // (it's a data value, e.g. "2026Q2" vs "2026-q2", not a command keyword).
  const seasonMatch = body.match(/^season (\S+)$/i);
  if (seasonMatch) {
    return { type: CommandType.SEASON_ANNOUNCEMENT, rawText: text, seasonArg: seasonMatch[1] };
  }

  return { type: CommandType.UNKNOWN, rawText: text };
}

export function isCommand(text: string): boolean {
  return text.startsWith('@Dobby');
}
