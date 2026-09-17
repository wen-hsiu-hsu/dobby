export interface CalendarEventData {
  pageId: string;
  date: string;
  absentees: string[];   // relation pageIds of People (請假人)
  guests: string[];      // multi_select names (零打)
  isPaused: boolean;     // 類型 === '打球暫停'
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

export function calculateTotalSlots(event: Pick<CalendarEventData, 'absentees'>, seasonData: SeasonData): number {
  const COURTS_DENSITY = 7;
  return seasonData.courts * COURTS_DENSITY - seasonData.members.length + event.absentees.length;
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
        error: `名額不足，目前剩餘 ${availableSlots} 個名額`,
      };
    }
    // Partially fulfill up to the remaining capacity instead of rejecting outright.
    actualDelta = availableSlots;
    cappedAt = availableSlots;
  }

  // Build new guest entries
  const newEntries: string[] = [];
  if (isSelfSeasonMember) {
    // Season member's friends: "{Name}的朋友" or "{Name}的朋友2", etc.
    for (let i = 0; i < actualDelta; i++) {
      const suffix = i === 0 ? '' : String(i + 1);
      newEntries.push(`${targetName}的朋友${suffix}`);
    }
  } else {
    for (let i = 0; i < actualDelta; i++) {
      const suffix = i === 0 ? '' : ` ${i + 1}`;
      newEntries.push(`${targetName}${suffix}`);
    }
  }

  return {
    canAdd: true,
    newGuests: [...event.guests, ...newEntries],
    cappedAt,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
