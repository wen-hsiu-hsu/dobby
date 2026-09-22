import * as peopleRepo from '../services/notion/people-repository.js';
import type { EventOccupancy } from '../services/notion/event-occupancy.js';

/**
 * Renders the weekly status message shared by the Sunday push (`weekly-push.ts`) and the
 * `@Dobby next` admin command (`next-event.ts`) — both show the same "current state" view,
 * just triggered differently.
 *
 * `courts` is taken as a separate param rather than read from `occupancy.season.courts`
 * because `getEventOccupancy(date, courtsOverride)` uses `courtsOverride` to compute
 * `totalSlots` but still returns the original (non-overridden) `season` — callers doing a
 * court-override what-if query must pass the same override here so the `場地` line stays
 * consistent with `totalSlots`/`零打名額`.
 */
export async function buildWeeklyStatusMessage(
  occupancy: EventOccupancy,
  dateStr: string,
  courts: number
): Promise<string> {
  const { event, season, totalSlots, presentSeasonMembers } = occupancy;

  if (event.isPaused) {
    return [`${dateStr} 不能到請喊聲`, `⛔ 本週活動暫停`].join('\n');
  }

  // Show all slots including empty ones, matching buildEventStatusMessage's guest list.
  const displaySlots = Math.max(totalSlots, event.guests.length);
  const guestLines = Array.from({ length: displaySlots }, (_, i) => `${i + 1}. ${event.guests[i] ?? ''}`).join('\n');

  let absenteeText = '無';
  if (event.absentees.length > 0) {
    const absentees = await peopleRepo.findByPageIds(event.absentees);
    absenteeText = absentees.map((p) => p.name).join('、');
  }

  return [
    `${dateStr} 不能到請喊聲`,
    `零打名額：${totalSlots}人 $${season.guestFee}/人`,
    guestLines,
    ``,
    `請假：${absenteeText}`,
    `場地：${courts} 面`,
    `應到：${presentSeasonMembers} 人`,
  ].join('\n');
}
