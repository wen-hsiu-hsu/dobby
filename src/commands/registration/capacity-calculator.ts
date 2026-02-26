export interface CalendarEventData {
  pageId: string;
  date: string;
  absentees: string[];   // relation pageIds of People
  guests: string[];      // multi_select names (zero-da / 零打)
  capacity: number | null;
  isPaused: boolean;
}

export interface SeasonData {
  members: string[];     // relation pageIds of People
}

export interface CapacityResult {
  canAdd: boolean;
  error?: string;
  newGuests?: string[];
  removedGuests?: string[];
}

export function calculateAddCapacity(
  event: CalendarEventData,
  seasonData: SeasonData,
  targetName: string,
  delta: number,
  isSelfSeasonMember: boolean
): CapacityResult {
  if (event.isPaused) {
    return { canAdd: false, error: '本次活動已暫停，無法報名' };
  }

  const COURTS_DENSITY = 7;
  const totalCapacity =
    event.capacity !== null
      ? event.capacity
      : (seasonData.members.length - event.absentees.length) + COURTS_DENSITY * 2; // rough estimate

  const currentGuests = event.guests.length;
  const availableSlots = totalCapacity - (seasonData.members.length - event.absentees.length) - currentGuests;

  if (delta > availableSlots) {
    return {
      canAdd: false,
      error: `名額不足，目前剩餘 ${availableSlots} 個名額`,
    };
  }

  // Build new guest entries
  const newEntries: string[] = [];
  if (isSelfSeasonMember) {
    // Season member's friends: "{Name}的朋友" or "{Name}的朋友2", etc.
    for (let i = 0; i < delta; i++) {
      const suffix = i === 0 ? '' : String(i + 1);
      newEntries.push(`${targetName}的朋友${suffix}`);
    }
  } else {
    for (let i = 0; i < delta; i++) {
      const suffix = i === 0 ? '' : ` ${i + 1}`;
      newEntries.push(`${targetName}${suffix}`);
    }
  }

  return {
    canAdd: true,
    newGuests: [...event.guests, ...newEntries],
  };
}

export function calculateRemoveCapacity(
  event: CalendarEventData,
  targetName: string,
  delta: number,
  isSelfSeasonMember: boolean
): CapacityResult {
  const prefix = isSelfSeasonMember ? `${targetName}的朋友` : targetName;
  const toRemove = event.guests.filter((g) => g.startsWith(prefix));

  if (toRemove.length === 0) {
    return { canAdd: false, error: `找不到 ${targetName} 的報名紀錄` };
  }

  const removeCount = Math.min(Math.abs(delta), toRemove.length);
  const toRemoveSlice = toRemove.slice(0, removeCount);
  const newGuests = event.guests.filter((g) => !toRemoveSlice.includes(g));

  return { canAdd: true, newGuests, removedGuests: toRemoveSlice };
}
