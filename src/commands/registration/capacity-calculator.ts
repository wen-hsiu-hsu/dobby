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

/**
 * 每面場地可容納的人數上限。season-announcement.ts 的公告 baseline 計算也用同一個數字
 * （語意相同：每面場地固定容納這麼多人），故從這裡 export 共用，避免兩處各自定義後
 * 悄悄失去同步。兩處的計算公式本身不同——這裡另外套用 resolveCourts()（行事曆場地數優先
 * 於當季預設）並扣掉請假人數，season-announcement.ts 算的是「當季預設、零請假」的
 * 公告用 baseline——但「每面場地幾人」這個數字本身沒有理由不同。
 */
export const COURTS_DENSITY = 7;

export function calculateTotalSlots(event: Pick<CalendarEventData, 'absentees' | 'courts'>, seasonData: SeasonData): number {
  return resolveCourts(event, seasonData) * COURTS_DENSITY - seasonData.members.length + event.absentees.length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Numbering suffix format shared by calculateAddCapacity/calculateRemoveCapacity:
 * "{prefix}" for the first entry (index 1), "{prefix} (2)", "{prefix} (3)", ... after
 * that — same shape for season-member friends and non-season members alike.
 */
const NUMBERED_SUFFIX_PATTERN = ' \\((\\d+)\\)';

/**
 * Finds the highest existing numbering already used for `prefix` inside `guests`,
 * so a new batch of entries can continue from there instead of restarting at 0.
 *
 * Matches the unsuffixed prefix itself (treated as index 1) and the numbered form
 * that calculateAddCapacity produces ("{prefix} (2)", ...). Anchored to the full
 * string so an unrelated guest that merely starts with `prefix` (e.g. "Alice" vs
 * prefix "Al") is never mistaken for one of this target's entries.
 */
function findMaxExistingIndex(guests: string[], prefix: string): number {
  const exactPattern = new RegExp(`^${escapeRegExp(prefix)}$`);
  const numberedPattern = new RegExp(`^${escapeRegExp(prefix)}${NUMBERED_SUFFIX_PATTERN}$`);

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

/**
 * Index of a single guest entry relative to `prefix`: 1 for the unsuffixed entry,
 * N for "{prefix} (N)". Used to sort removal candidates so the highest-numbered
 * entry is removed first — see calculateRemoveCapacity for why order matters.
 */
function guestIndex(guest: string, prefix: string): number {
  if (guest === prefix) return 1;
  const match = guest.match(new RegExp(`^${escapeRegExp(prefix)}${NUMBERED_SUFFIX_PATTERN}$`));
  return match ? parseInt(match[1] as string, 10) : 1;
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
  // Season member's friends: "{Name}的朋友" or "{Name}的朋友 (2)", etc.
  // Non-season members: "{Name}" or "{Name} (2)", etc.
  const startIndex = findMaxExistingIndex(event.guests, prefix);

  const newEntries: string[] = [];
  for (let i = 0; i < actualDelta; i++) {
    const index = startIndex + i + 1;
    newEntries.push(index === 1 ? prefix : `${prefix} (${index})`);
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
  // calculateAddCapacity actually produces ("{prefix} (2)", etc). A plain startsWith
  // would also match unrelated names that merely share this name as a string prefix
  // (e.g. target "Al" would wrongly match existing guests "Alice"/"Alice (2)").
  const exactOrNumberedPattern = new RegExp(`^${escapeRegExp(prefix)}(${NUMBERED_SUFFIX_PATTERN})?$`);
  const toRemove = event.guests.filter((g) => exactOrNumberedPattern.test(g));

  if (toRemove.length === 0) {
    return { canAdd: false, error: `找不到 ${targetName} 的報名紀錄` };
  }

  const removeCount = Math.min(Math.abs(delta), toRemove.length);
  if (removeCount === 0) {
    // delta is 0 (e.g. "-0"/"+0"): there's a registration to remove, but the request
    // asked to remove none of it. Must not report success — a 0-length removal is not
    // a real change, and the caller would otherwise write the unchanged guest list back
    // to Notion and reply "取消報名成功" despite nothing actually changing.
    return { canAdd: false, error: '取消數量需大於 0' };
  }
  // Remove the highest-numbered entries first, leaving the unsuffixed "{prefix}"
  // entry (index 1) for last. Filtering in event.guests order (as before) instead
  // removed whichever entry happened to appear first in the array — often the
  // unsuffixed one — which left gaps like "{prefix} (2)"/"{prefix} (3)" with no
  // "{prefix}" and confused users into thinking a registration had vanished.
  const toRemoveSlice = [...toRemove].sort((a, b) => guestIndex(b, prefix) - guestIndex(a, prefix)).slice(0, removeCount);
  const newGuests = event.guests.filter((g) => !toRemoveSlice.includes(g));

  return { canAdd: true, newGuests, removedGuests: toRemoveSlice };
}
