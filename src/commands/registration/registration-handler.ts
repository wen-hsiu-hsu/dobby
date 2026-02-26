import { withMutex } from '../../services/mutex.js';
import { replyMessage } from '../../services/line/reply-service.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import { resolveTarget } from './target-resolver.js';
import { calculateAddCapacity, calculateRemoveCapacity } from './capacity-calculator.js';
import { parseRegistrationTarget } from './registration-parser.js';
import { formatDate, getNextSaturday } from '../../utils/date-utils.js';
import { logger } from '../../utils/logger.js';

interface MessageEvent {
  replyToken: string;
  message: { text: string; mention?: unknown };
  source: { userId: string };
}

export async function handleRegistration(
  event: MessageEvent,
  delta: number,
  botId: string
): Promise<void> {
  const target = parseRegistrationTarget(event as any);

  if (target.parseError) {
    await replyMessage(event.replyToken, [{ type: 'text', text: target.parseError }], botId);
    return;
  }

  const resolved = await resolveTarget(target, event.source.userId);
  if (!resolved) {
    await replyMessage(event.replyToken, [{ type: 'text', text: '找不到您的報名資料，請確認是否已加入季租' }], botId);
    return;
  }

  const nextSaturday = formatDate(getNextSaturday());
  const calEvent = await calendarRepo.findByDate(nextSaturday);
  if (!calEvent) {
    await replyMessage(event.replyToken, [{ type: 'text', text: `找不到 ${nextSaturday} 的活動` }], botId);
    return;
  }

  // Get current season
  const seasons = await seasonRepo.findAll();
  const activeSeason = seasons[0]; // assume first is current
  if (!activeSeason) {
    await replyMessage(event.replyToken, [{ type: 'text', text: '找不到季租資料' }], botId);
    return;
  }

  const isSelfSeasonMember = activeSeason.members.includes(resolved.personPageId);

  try {
    await withMutex(calEvent.pageId, async () => {
      const freshEvent = await calendarRepo.findByDate(nextSaturday);
      if (!freshEvent) throw new Error('Event not found');

      let result;
      if (delta > 0) {
        result = calculateAddCapacity(freshEvent, activeSeason, resolved.displayName, delta, isSelfSeasonMember);
      } else {
        result = calculateRemoveCapacity(freshEvent, resolved.displayName, delta, isSelfSeasonMember);
      }

      if (!result.canAdd) {
        await replyMessage(event.replyToken, [{ type: 'text', text: result.error ?? '操作失敗' }], botId);
        return;
      }

      await calendarRepo.updateGuests(freshEvent.pageId, result.newGuests ?? []);

      const action = delta > 0 ? '報名成功' : '取消報名成功';
      const msg = `${action}！${resolved.displayName} ${delta > 0 ? `+${delta}` : delta}`;
      await replyMessage(event.replyToken, [{ type: 'text', text: msg }], botId);
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message?.includes('Mutex busy')) {
      await replyMessage(event.replyToken, [{ type: 'text', text: '系統忙碌中，請稍後再試' }], botId);
      return;
    }
    logger.error({ err }, 'Registration handler error');
    await replyMessage(event.replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }], botId);
  }
}
