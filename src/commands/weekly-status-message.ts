import type { messagingApi } from '@line/bot-sdk';
import * as peopleRepo from '../services/notion/people-repository.js';
import {
  buildStatusCardBubble,
  buildStatusCardAltText,
  type StatusCardParams,
} from './registration/flex-status-card.js';
import { FLEX_ICONS } from '../config/flex-assets.js';
import type { EventOccupancy } from '../services/notion/event-occupancy.js';

const PAUSED_NOTE = '本週因故暫停，恢復後另行公告';

/**
 * Renders the weekly status card shared by the Sunday push (`weekly-push.ts`) and the
 * `@Dobby next` command (`next-event.ts`) — both must show the exact same card: `next`
 * is both how members check the current state and how a failed Sunday push gets manually
 * resent, so the two can't drift into two formats (see docs/adr/0011-weekly-status-flex-card.md).
 *
 * 卡片組裝本身沿用報名／請假共用的 `buildStatusCardBubble`／`buildStatusCardAltText`
 * （`registration/flex-status-card.ts`），不重畫一份 hero／footer／徽章 JSON——這裡只負責
 * 把 `EventOccupancy` 換算成 `StatusCardParams`，跟 `event-status-message.ts` 的
 * `buildEventStatusReply()` 是同一種角色分工。
 */
export async function buildWeeklyStatusReply(
  occupancy: EventOccupancy,
  dateStr: string
): Promise<messagingApi.FlexMessage> {
  const { event, season, courts, totalSlots, presentSeasonMembers } = occupancy;

  if (event.isPaused) {
    const cardParams: StatusCardParams = {
      date: dateStr,
      headline: '本週活動暫停',
      badgeColor: 'gray',
      badgeIcon: FLEX_ICONS.banDark,
      title: '本週活動暫停',
      subtitle: '',
      guests: [],
      newGuestCount: 0,
      totalSlots,
      presentSeasonMembers,
      guestFee: season.guestFee,
      absenteeNames: [],
      paused: true,
      pausedNote: PAUSED_NOTE,
    };
    return {
      type: 'flex',
      altText: buildStatusCardAltText(cardParams),
      contents: buildStatusCardBubble(cardParams),
    };
  }

  // 行事曆 場地數 優先，未填用季預設（見 resolveCourts）；跟季預設不同時副標題／
  // altText 都加註「本週調整」，讓換季複製頁面帶錯的值在週日推播時被看到。
  const courtsAdjusted = courts !== season.courts;
  const courtNote = courtsAdjusted ? '（本週調整）' : '';
  const subtitle = courtsAdjusted ? `不能到請喊聲・本週 ${courts} 面場` : '不能到請喊聲';
  // altText 沿用 buildStatusCardAltText 的固定格式（headline/日期/零打名額/.../總人數），
  // 場地資訊沒有專屬欄位，所以跟著 headline 多帶一行——headline 本身允許內嵌換行，
  // buildStatusCardAltText 只是把它當一段文字接進 lines 陣列。跟舊文字版一樣，
  // 「場地：N 面」每週都印，只有跟季預設不同時才加「（本週調整）」（見 docs/schedulers.md）。
  const headline = `本週打球・不能到請喊聲\n場地：${courts} 面${courtNote}`;

  const absenteeNames = (await peopleRepo.findAbsenteesOfEvent(event)).map((p) => p.name);

  const cardParams: StatusCardParams = {
    date: dateStr,
    headline,
    badgeColor: 'gray',
    badgeIcon: FLEX_ICONS.calendarCheckDark,
    title: '本週打球',
    subtitle,
    // 本週完整零打名單（不是「這次新增」的概念），newGuestCount 固定 0 —— 週報／next
    // 沒有「新增」標記，見 docs/adr/0011。本週出席（presentSeasonMembers + 零打數）
    // 由 buildStatusCardBubble 內部算，跟報名卡片同一套公式，這裡不用另外傳。
    guests: event.guests,
    newGuestCount: 0,
    totalSlots,
    presentSeasonMembers,
    guestFee: season.guestFee,
    absenteeNames,
  };

  return {
    type: 'flex',
    altText: buildStatusCardAltText(cardParams),
    contents: buildStatusCardBubble(cardParams),
  };
}
