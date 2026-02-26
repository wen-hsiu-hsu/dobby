import type { messagingApi } from '@line/bot-sdk';
import * as announcementRepo from './notion/announcement-repository.js';
import { findAdmin } from './notion/users-repository.js';
import { logger } from '../utils/logger.js';

function blocksToText(blocks: any[]): string {
  return blocks
    .map((block) => {
      const type = block.type as string;
      const content = (block as any)[type];
      if (!content) return '';
      const richText: any[] = content.rich_text ?? [];
      return richText.map((r: any) => r.plain_text ?? '').join('');
    })
    .filter(Boolean)
    .join('\n');
}

function buildTextV2(
  text: string,
  substitution: Record<string, messagingApi.SubstitutionObject>,
): messagingApi.TextMessageV2 {
  return { type: 'textV2', text, substitution };
}

function mentionUser(userId: string): messagingApi.MentionSubstitutionObject {
  return { type: 'mention', mentionee: { type: 'user', userId } };
}

const FALLBACK_JOIN_TEXT = `大家好！我是 Dobby 🧤\n有任何問題歡迎輸入 @Dobby 查看指令列表！`;
const FALLBACK_MEMBER_TEXT = (displayName: string) =>
  `歡迎 ${displayName} 加入！\n輸入 @Dobby 查看我能做什麼！`;

/**
 * Build welcome message when the bot joins a group.
 * Uses WELCOME_MESSAGE announcement from Notion if available,
 * replacing {MANAGER} with a mention of the admin user.
 */
export async function buildJoinWelcome(
  botId: string,
): Promise<messagingApi.Message> {
  try {
    const [announcement, admin] = await Promise.all([
      announcementRepo.findByName('WELCOME_MESSAGE'),
      findAdmin(),
    ]);

    if (!announcement || !admin) {
      return { type: 'text', text: FALLBACK_JOIN_TEXT };
    }

    const blocks = await announcementRepo.getBlocks(announcement.pageId);
    const text = blocksToText(blocks);
    if (!text) return { type: 'text', text: FALLBACK_JOIN_TEXT };

    return buildTextV2(text, {
      MANAGER: mentionUser(admin.userId),
    });
  } catch (err) {
    logger.error({ err, botId }, 'buildJoinWelcome error, using fallback');
    return { type: 'text', text: FALLBACK_JOIN_TEXT };
  }
}

/**
 * Build welcome message when a new member joins the group.
 * Uses WELCOME_MESSAGE announcement from Notion if available,
 * replacing {NEW_FRIEND} and {MANAGER} with mentions.
 */
export async function buildMemberJoinedWelcome(
  newMemberUserId: string,
  displayName: string,
  botId: string,
): Promise<messagingApi.Message> {
  try {
    const [announcement, admin] = await Promise.all([
      announcementRepo.findByName('WELCOME_MESSAGE'),
      findAdmin(),
    ]);

    if (!announcement || !admin) {
      return { type: 'text', text: FALLBACK_MEMBER_TEXT(displayName) };
    }

    const blocks = await announcementRepo.getBlocks(announcement.pageId);
    const text = blocksToText(blocks);
    if (!text) return { type: 'text', text: FALLBACK_MEMBER_TEXT(displayName) };

    return buildTextV2(text, {
      NEW_FRIEND: mentionUser(newMemberUserId),
      MANAGER: mentionUser(admin.userId),
    });
  } catch (err) {
    logger.error({ err, newMemberUserId, botId }, 'buildMemberJoinedWelcome error, using fallback');
    return { type: 'text', text: FALLBACK_MEMBER_TEXT(displayName) };
  }
}
