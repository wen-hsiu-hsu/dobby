import * as calendarRepo from './calendar-repository.js';
import * as seasonRepo from './season-repository.js';
import { calculateTotalSlots, resolveCourts } from '../../commands/registration/capacity-calculator.js';
import { getCurrentSeasonName } from '../../utils/date-utils.js';
import type { CalendarEvent, SeasonRecord } from '../../types/notion-models.js';

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
  // Caller may already have the current season (e.g. for a member-check before
  // locking) — reuse it instead of re-querying the same rarely-changing record.
  const season = knownSeason !== undefined ? knownSeason : await seasonRepo.findByName(getCurrentSeasonName());
  if (!event || !season) return null;

  const courts = resolveCourts(event, season);
  const totalSlots = calculateTotalSlots(event, season);
  const remainingSlots = Math.max(0, totalSlots - event.guests.length);
  const presentSeasonMembers = season.members.length - event.absentees.length;
  const totalPeople = presentSeasonMembers + event.guests.length;

  return { event, season, courts, totalSlots, remainingSlots, totalPeople, presentSeasonMembers };
}
