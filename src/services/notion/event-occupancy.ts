import * as calendarRepo from './calendar-repository.js';
import * as seasonRepo from './season-repository.js';
import { calculateTotalSlots, resolveCourts } from '../../commands/registration/capacity-calculator.js';
import { getSeasonNameForDate } from '../../utils/date-utils.js';
import type { CalendarEvent, SeasonRecord } from '../../types/notion-models.js';
import { logger } from '../../utils/logger.js';

export interface EventOccupancy {
  event: CalendarEvent;
  season: SeasonRecord;
  /** 本週實際採用的場地數（行事曆 場地數 優先，未填則用當季預設），見 resolveCourts。 */
  courts: number;
  totalSlots: number;
  remainingSlots: number;
  totalPeople: number;
  presentSeasonMembers: number;
}

export async function getEventOccupancy(
  date: string,
  knownSeason?: SeasonRecord | null
): Promise<EventOccupancy | null> {
  const event = await calendarRepo.findByDate(date);
  // Caller may already have the event's season (e.g. for a member-check before
  // locking) — reuse it instead of re-querying the same rarely-changing record.
  // Season is derived from the event date, not today — see getSeasonNameForDate.
  const season = knownSeason !== undefined ? knownSeason : await seasonRepo.findByName(getSeasonNameForDate(date));
  if (!event || !season) {
    // 呼叫端（週報、報名、請假、next）都只拿到 null，分不出是沒有活動還是沒有季資料。
    // 用 info 不用 warn：報名「找不到活動」、next 沒有活動都是正常流程，
    // /logs 的 groupStatus 會掃所有行的等級，warn 會把這些事件標成「警告」。
    logger.info({ date, hasEvent: !!event, hasSeason: !!season }, 'Event occupancy unavailable: no event or season for date');
    return null;
  }

  const courts = resolveCourts(event, season);
  const totalSlots = calculateTotalSlots(event, season);
  const remainingSlots = Math.max(0, totalSlots - event.guests.length);
  const presentSeasonMembers = season.members.length - event.absentees.length;
  const totalPeople = presentSeasonMembers + event.guests.length;

  return { event, season, courts, totalSlots, remainingSlots, totalPeople, presentSeasonMembers };
}
