import type { messagingApi } from '@line/bot-sdk';
import * as peopleRepo from '../../services/notion/people-repository.js';
import { buildStatusCardBubble, buildStatusCardAltText, type BadgeColorName, type StatusCardParams } from './flex-status-card.js';

export interface EventStatusParams {
  date: string;
  /** 既有的一句話摘要（含 ✅ 等既有措辭），拿來組 altText；卡片本身不顯示這個字串，顯示的是 title/subtitle。 */
  headline: string;
  badgeColor: BadgeColorName;
  badgeIcon: string;
  title: string;
  subtitle: string;
  guests: string[];
  /** guests 尾端有幾筆是這次新增的條目，預設 0；只有報名成功（含被截斷）時非 0。 */
  newGuestCount?: number;
  totalSlots: number;
  presentSeasonMembers: number;
  guestFee: number;
  /** 活動的行事曆頁面 ID，查請假人姓名時用（反向 relation 查詢的篩選條件）。 */
  eventPageId: string;
  absenteePageIds: string[];
}

/**
 * 組出報名／請假操作後要回覆的 Flex 狀態卡（含 altText）。成功、失敗、no-op 每個結束分支
 * 都回傳這份參數，由 `withFreshCalendarEvent` 放鎖後呼叫這裡，使用者看到目前完整的名額狀態，
 * 不是只有一句話（這裡丟錯時 wrapper 才退回只回 headline）。
 *
 * 卡片 JSON 本身（buildStatusCardBubble/buildStatusCardAltText，見 flex-status-card.ts）
 * 是純函式，這裡只多做一件事：把 absenteePageIds 查成姓名（Notion 呼叫），所以整個
 * 函式是 async。
 */
export async function buildEventStatusReply(params: EventStatusParams): Promise<messagingApi.FlexMessage> {
  const absentees = await peopleRepo.findAbsenteesOfEvent({ pageId: params.eventPageId, absentees: params.absenteePageIds });
  const absenteeNames = absentees.map((p) => p.name);

  const cardParams: StatusCardParams = {
    date: params.date,
    headline: params.headline,
    badgeColor: params.badgeColor,
    badgeIcon: params.badgeIcon,
    title: params.title,
    subtitle: params.subtitle,
    guests: params.guests,
    newGuestCount: params.newGuestCount ?? 0,
    totalSlots: params.totalSlots,
    presentSeasonMembers: params.presentSeasonMembers,
    guestFee: params.guestFee,
    absenteeNames,
  };

  return {
    type: 'flex',
    altText: buildStatusCardAltText(cardParams),
    contents: buildStatusCardBubble(cardParams),
  };
}
