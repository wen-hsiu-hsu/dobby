import * as calendarRepo from './calendar-repository.js';
import * as seasonRepo from './season-repository.js';
import { calculateTotalSlots } from '../../commands/registration/capacity-calculator.js';
import { getCurrentSeasonName } from '../../utils/date-utils.js';
import type { CalendarEvent, SeasonRecord } from '../../types/notion-models.js';

export interface EventOccupancy {
  event: CalendarEvent;
  season: SeasonRecord;
  totalSlots: number;
  remainingSlots: number;
  totalPeople: number;
  presentSeasonMembers: number;
}

export async function getEventOccupancy(
  date: string,
  courtsOverride?: number
): Promise<EventOccupancy | null> {
  const event = await calendarRepo.findByDate(date);
  const season = await seasonRepo.findByName(getCurrentSeasonName());
  if (!event || !season) return null;

  const slotsSeason = courtsOverride === undefined ? season : { ...season, courts: courtsOverride };
  const totalSlots = calculateTotalSlots(event, slotsSeason);
  const remainingSlots = Math.max(0, totalSlots - event.guests.length);
  const presentSeasonMembers = season.members.length - event.absentees.length;
  const totalPeople = presentSeasonMembers + event.guests.length;

  return { event, season, totalSlots, remainingSlots, totalPeople, presentSeasonMembers };
}
