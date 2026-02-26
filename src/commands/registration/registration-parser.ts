import type { RegistrationTarget } from '../../types/commands.js';

interface MentionEvent {
  message: {
    text: string;
    mention?: {
      mentionees?: Array<{ type: string; userId?: string; index: number; length: number }>;
    };
  };
  source: { userId: string };
}

function normalizeFullWidth(text: string): string {
  return text.replace(/＋/g, '+').replace(/－/g, '-');
}

export function parseRegistrationTarget(event: MentionEvent): RegistrationTarget {
  const msg = event.message;
  const text = normalizeFullWidth(msg.text).replace(/@Dobby/i, '').trim();

  const commandRegex = /([+\-]\d+|假|銷假)/;
  const match = text.match(commandRegex);
  const command = match ? match[1] : null;

  if (!command) {
    return { isSelf: true };
  }

  const rawTarget = text.replace(commandRegex, '').trim();
  if (!rawTarget) {
    return { isSelf: true };
  }

  if (rawTarget.startsWith('@')) {
    const mentionees = msg.mention?.mentionees ?? [];
    const cleanTarget = rawTarget.substring(1);
    // Last mentionee of type "user" is the target (skip @Dobby which is type "user" too)
    // Filter out the bot mention - use the last user mention
    const userMentions = mentionees.filter((m) => m.type === 'user');
    if (userMentions.length > 0) {
      const lastMention = userMentions[userMentions.length - 1];
      return {
        isSelf: false,
        targetUserId: lastMention.userId,
        targetName: cleanTarget,
      };
    }
    // PC version: mention without userId
    return { isSelf: false, targetName: cleanTarget };
  }

  return {
    isSelf: false,
    parseError: '指令格式錯誤：指定對象需使用 @Name',
    targetName: rawTarget,
  };
}
