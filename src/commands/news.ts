import * as announcementRepo from '../services/notion/announcement-repository.js';
import { replyMessage } from '../services/line/reply-service.js';
import { getNextSaturdayDateText } from '../utils/date-utils.js';
import { logger } from '../utils/logger.js';

const PLACEHOLDERS: Record<string, () => string> = {
  '{{NEXT_SATURDAY}}': () => getNextSaturdayDateText(),
  '{{DATE}}': () => getNextSaturdayDateText(),
};

function applyPlaceholders(text: string): string {
  let result = text;
  for (const [key, fn] of Object.entries(PLACEHOLDERS)) {
    result = result.replaceAll(key, fn());
  }
  return result;
}

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

export async function handleNews(replyToken: string, botId: string): Promise<void> {
  try {
    const announcement = await announcementRepo.findByName('NEWS');
    if (!announcement) {
      await replyMessage(replyToken, [{ type: 'text', text: '找不到公告內容' }], botId);
      return;
    }
    const blocks = await announcementRepo.getBlocks(announcement.pageId);
    const rawText = blocksToText(blocks);
    const text = applyPlaceholders(rawText);
    await replyMessage(replyToken, [{ type: 'text', text: text || '公告內容為空' }], botId);
  } catch (err) {
    logger.error({ err }, 'News handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }], botId);
  }
}
