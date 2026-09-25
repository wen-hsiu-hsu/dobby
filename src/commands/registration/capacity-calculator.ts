import { logger } from '../../utils/logger.js';

export interface CalendarEventData {
  pageId: string;
  date: string;
  absentees: string[];   // relation pageIds of People (請假人)
  guests: string[];      // multi_select names (零打)
  isPaused: boolean;     // 類型 === '打球暫停'
  courts: number | null; // 場地數（本週），null 表示未填
}

export interface SeasonData {
  members: string[];     // relation pageIds of People (報名人)
  courts: number;        // 場地數
}

export interface CapacityResult {
  canAdd: boolean;
  error?: string;
  newGuests?: string[];
  removedGuests?: string[];
  /** Set when the requested delta was reduced to fit remaining capacity (non-admin only). */
  cappedAt?: number;
}

/**
 * 本週實際採用的場地數：行事曆當週有填就用它，沒填才用當季預設。
 * 所有會用到場地數的地方（名額計算、週報顯示）都必須經過這裡，不要直接讀 season.courts，
 * 否則會出現「報名用行事曆場地數、銷假或顯示卻用季預設」的不一致。
 * 唯一例外是 news 的 {COURT_COUNT}：那是季公告，刻意顯示當季預設。見 docs/adr/0007-calendar-courts-fallback-in-one-place.md。
 */
export function resolveCourts(event: Pick<CalendarEventData, 'courts'>, seasonData: Pick<SeasonData, 'courts'>): number {
  return event.courts ?? seasonData.courts;
}

export function calculateTotalSlots(event: Pick<CalendarEventData, 'absentees' | 'courts'>, seasonData: SeasonData): number {
  const COURTS_DENSITY = 7;
  return resolveCourts(event, seasonData) * COURTS_DENSITY - seasonData.members.length + event.absentees.length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds the highest existing numbering already used for `prefix` inside `guests`,
 * so a new batch of entries can continue from there instead of restarting at 0.
 *
 * Matches the unsuffixed prefix itself (treated as index 1) and the numbered form
 * that calculateAddCapacity produces ("{prefix}2" for season-member friends,
 * "{prefix} 2" for non-season members). Anchored to the full string so an unrelated
 * guest that merely starts with `prefix` (e.g. "Alice" vs prefix "Al") is never
 * mistaken for one of this target's entries.
 */
function findMaxExistingIndex(guests: string[], prefix: string, numberSuffixPattern: string): number {
  const exactPattern = new RegExp(`^${escapeRegExp(prefix)}$`);
  const numberedPattern = new RegExp(`^${escapeRegExp(prefix)}${numberSuffixPattern}$`);

  let max = 0;
  for (const guest of guests) {
    if (exactPattern.test(guest)) {
      max = Math.max(max, 1);
      continue;
    }
    const match = guest.match(numberedPattern);
    if (match) {
      max = Math.max(max, parseInt(match[1] as string, 10));
    }
  }
  return max;
}

export function calculateAddCapacity(
  event: CalendarEventData,
  seasonData: SeasonData,
  targetName: string,
  delta: number,
  isSelfSeasonMember: boolean,
  isAdmin = false
): CapacityResult {
  if (event.isPaused) {
    return { canAdd: false, error: '本次活動已暫停，無法報名' };
  }

  // 可報名數 = 總名額 - 已報名零打數量
  const availableSlots = calculateTotalSlots(event, seasonData) - event.guests.length;

  let actualDelta = delta;
  let cappedAt: number | undefined;

  if (!isAdmin && delta > availableSlots) {
    if (availableSlots <= 0) {
      return {
        canAdd: false,
        error: `名額不足，目前剩餘 ${Math.max(0, availableSlots)} 個名額`,
      };
    }
    // Partially fulfill up to the remaining capacity instead of rejecting outright.
    actualDelta = availableSlots;
    cappedAt = availableSlots;
  }

  // Build new guest entries. Numbering must continue from whatever already exists in
  // event.guests for this targetName — not restart at 0 — otherwise repeated calls
  // (e.g. a season member sending "+1" several times, each one re-reading the latest
  // Notion data via withFreshCalendarEvent) produce an identically-named entry every
  // time. Notion's 零打 property is multi_select, whose options are deduplicated by
  // name: two guests with the exact same string collapse into a single option
  // server-side, silently discarding one of the registrations even though this code
  // believed it wrote two.
  const prefix = isSelfSeasonMember ? `${targetName}的朋友` : targetName;
  // Season member's friends: "{Name}的朋友" or "{Name}的朋友2", etc.
  // Non-season members: "{Name}" or "{Name} 2", etc.
  const numberSuffixPattern = isSelfSeasonMember ? '(\\d+)' : ' (\\d+)';
  const startIndex = findMaxExistingIndex(event.guests, prefix, numberSuffixPattern);

  const newEntries: string[] = [];
  for (let i = 0; i < actualDelta; i++) {
    const index = startIndex + i + 1;
    if (index === 1) {
      newEntries.push(prefix);
    } else {
      newEntries.push(isSelfSeasonMember ? `${prefix}${index}` : `${prefix} ${index}`);
    }
  }

  const newGuests = [...event.guests, ...newEntries];

  // Defense-in-depth: even with the numbering above, anything else that ever produces
  // a duplicate string in this array (a future bug, an admin path, manual data) would
  // hit the same silent multi_select dedup and lose a registration with no error. Log
  // it so it's diagnosable instead of invisible, without blocking the write.
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const guest of newGuests) {
    if (seen.has(guest)) duplicates.add(guest);
    seen.add(guest);
  }
  if (duplicates.size > 0) {
    logger.warn(
      { targetName, duplicates: [...duplicates], newGuests },
      'calculateAddCapacity: duplicate guest name(s) about to be written to Notion multi_select — Notion will silently merge these into one entry, losing a registration'
    );
  }

  return {
    canAdd: true,
    newGuests,
    cappedAt,
  };
}

export function calculateRemoveCapacity(
  event: CalendarEventData,
  targetName: string,
  delta: number,
  isSelfSeasonMember: boolean
): CapacityResult {
  const prefix = isSelfSeasonMember ? `${targetName}的朋友` : targetName;
  // Match the prefix exactly, or the prefix followed by the numbering suffix that
  // calculateAddCapacity actually produces ("{prefix}2" for season-member friends,
  // "{prefix} 2" for non-season members' own entries). A plain startsWith would also
  // match unrelated names that merely share this name as a string prefix (e.g. target
  // "Al" would wrongly match existing guests "Alice"/"Alice 2").
  const suffixPattern = isSelfSeasonMember ? '\\d+' : ' \\d+';
  const exactOrNumberedPattern = new RegExp(`^${escapeRegExp(prefix)}(${suffixPattern})?$`);
  const toRemove = event.guests.filter((g) => exactOrNumberedPattern.test(g));

  if (toRemove.length === 0) {
    return { canAdd: false, error: `找不到 ${targetName} 的報名紀錄` };
  }

  const removeCount = Math.min(Math.abs(delta), toRemove.length);
  const toRemoveSlice = toRemove.slice(0, removeCount);
  const newGuests = event.guests.filter((g) => !toRemoveSlice.includes(g));

  return { canAdd: true, newGuests, removedGuests: toRemoveSlice };
}
