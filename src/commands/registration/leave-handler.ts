import { replyMessage } from '../../services/line/reply-service.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import { resolveTarget } from './target-resolver.js';
import { parseRegistrationTarget } from './registration-parser.js';
import { formatDate, getNextSaturday, getCurrentSeasonName } from '../../utils/date-utils.js';
import { withCalendarMutex } from './calendar-mutex.js';
import { logger } from '../../utils/logger.js';

interface MessageEvent {
  replyToken: string;
  message: { text: string; mention?: unknown };
  source: { userId: string };
}

export async function handleLeave(
  event: MessageEvent,
  isCancel: boolean,
  botId: string
): Promise<void> {
  const target = parseRegistrationTarget(event as any);
  const resolved = await resolveTarget(target, event.source.userId);

  if (!resolved) {
    await replyMessage(event.replyToken, [{ type: 'text', text: '找不到您的資料' }], botId);
    return;
  }

  const activeSeason = await seasonRepo.findByName(getCurrentSeasonName());
  if (!activeSeason || !activeSeason.members.includes(resolved.personPageId)) {
    await replyMessage(event.replyToken, [{ type: 'text', text: '請假/銷假功能僅限季租成員使用' }], botId);
    return;
  }

  const nextSaturday = formatDate(getNextSaturday());
  const calEvent = await calendarRepo.findByDate(nextSaturday);
  if (!calEvent) {
    await replyMessage(event.replyToken, [{ type: 'text', text: `找不到 ${nextSaturday} 的活動` }], botId);
    return;
  }

  try {
    await withCalendarMutex(calEvent.pageId, async () => {
      const freshEvent = await calendarRepo.findByDate(nextSaturday);
      if (!freshEvent) throw new Error('Event not found');

      const isCurrentlyAbsent = freshEvent.absentees.includes(resolved.personPageId);

      if (!isCancel && isCurrentlyAbsent) {
        await replyMessage(event.replyToken, [{ type: 'text', text: `${resolved.displayName} 已請假，無需重複操作` }], botId);
        return;
      }

      if (isCancel && !isCurrentlyAbsent) {
        await replyMessage(event.replyToken, [{ type: 'text', text: `${resolved.displayName} 目前未請假` }], botId);
        return;
      }

      const newAbsentees = !isCancel
        ? [...freshEvent.absentees, resolved.personPageId]
        : freshEvent.absentees.filter((id) => id !== resolved.personPageId);

      await calendarRepo.updateAbsentees(freshEvent.pageId, newAbsentees);
      const action = isCancel ? '銷假成功' : '請假成功';
      await replyMessage(event.replyToken, [{ type: 'text', text: `${action}！${resolved.displayName}` }], botId);
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message?.includes('Mutex busy')) {
      await replyMessage(event.replyToken, [{ type: 'text', text: '系統忙碌中，請稍後再試' }], botId);
      return;
    }
    logger.error({ err }, 'Leave handler error');
    await replyMessage(event.replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }], botId);
  }
}
