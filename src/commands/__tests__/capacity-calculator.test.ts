import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateAddCapacity, calculateRemoveCapacity, calculateTotalSlots, resolveCourts } from '../registration/capacity-calculator.js';
import type { CalendarEventData, SeasonData } from '../registration/capacity-calculator.js';

vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
import { logger } from '../../utils/logger.js';

beforeEach(() => {
  vi.clearAllMocks();
});

const baseEvent: CalendarEventData = {
  pageId: 'evt1',
  date: '2024-01-06',
  absentees: [],
  guests: [],
  isPaused: false,
  courts: null,
};

// courts=2, members=3 → total capacity = 2×7 = 14, available = 14 - 3 + 0 - guests
const season: SeasonData = {
  members: ['p1', 'p2', 'p3'],
  courts: 2,
};

describe('calculateAddCapacity', () => {
  it('adds guest entries for non-season member', () => {
    const result = calculateAddCapacity(baseEvent, season, 'Alice', 2, false);
    expect(result.canAdd).toBe(true);
    expect(result.newGuests).toContain('Alice');
    expect(result.newGuests).toContain('Alice 2');
  });

  it('adds friend entries for season member', () => {
    const result = calculateAddCapacity(baseEvent, season, 'Bob', 1, true);
    expect(result.canAdd).toBe(true);
    expect(result.newGuests).toContain('Bob的朋友');
  });

  it('returns error when paused', () => {
    const result = calculateAddCapacity({ ...baseEvent, isPaused: true }, season, 'Alice', 1, false);
    expect(result.canAdd).toBe(false);
    expect(result.error).toMatch(/暫停/);
  });

  it('returns error when no slots available', () => {
    // 14 capacity, 3 season members = 11 slots; fill with 11 guests
    const fullEvent: CalendarEventData = {
      ...baseEvent,
      guests: Array.from({ length: 11 }, (_, i) => `Guest${i}`),
    };
    const result = calculateAddCapacity(fullEvent, season, 'New', 1, false);
    expect(result.canAdd).toBe(false);
    expect(result.error).toMatch(/名額不足/);
  });

  it('shows 0 remaining slots, not a negative number, when guests already exceed total capacity', () => {
    // 11 slots total, 15 guests already registered (e.g. after a season/court change
    // shrank capacity) → availableSlots = 11 - 15 = -4. The message must not surface
    // that negative number to the user.
    const overfullEvent: CalendarEventData = {
      ...baseEvent,
      guests: Array.from({ length: 15 }, (_, i) => `Guest${i}`),
    };
    const result = calculateAddCapacity(overfullEvent, season, 'New', 1, false);
    expect(result.canAdd).toBe(false);
    expect(result.error).toBe('名額不足，目前剩餘 0 個名額');
  });

  it('partially fulfills up to remaining capacity instead of rejecting outright (non-admin)', () => {
    // 11 slots total, 9 already taken → 2 remaining, but requesting 5
    const nearFullEvent: CalendarEventData = {
      ...baseEvent,
      guests: Array.from({ length: 9 }, (_, i) => `Guest${i}`),
    };
    const result = calculateAddCapacity(nearFullEvent, season, 'Bob', 5, true, false);

    expect(result.canAdd).toBe(true);
    expect(result.cappedAt).toBe(2);
    expect(result.newGuests).toHaveLength(11);
    expect(result.newGuests).toContain('Bob的朋友');
    expect(result.newGuests).toContain('Bob的朋友2');
    expect(result.newGuests).not.toContain('Bob的朋友3');
  });

  it('admin is not capped even when the request exceeds remaining capacity', () => {
    const nearFullEvent: CalendarEventData = {
      ...baseEvent,
      guests: Array.from({ length: 9 }, (_, i) => `Guest${i}`),
    };
    const result = calculateAddCapacity(nearFullEvent, season, 'New', 5, false, true);

    expect(result.canAdd).toBe(true);
    expect(result.cappedAt).toBeUndefined();
    expect(result.newGuests).toHaveLength(14);
    expect(result.newGuests).toContain('New 5');
  });

  // Regression tests for the "Notion multi_select silently merges duplicate-name
  // options" data-loss bug: calculateAddCapacity used to number every call's entries
  // starting from 0 without looking at event.guests, so a season member calling "+1"
  // repeatedly (each call re-reading the latest Notion data, as withFreshCalendarEvent
  // does) produced the exact same "{Name}的朋友" string every time. Notion's 零打
  // property is multi_select, whose options are deduplicated by name, so the second
  // (and third, and fourth) identically-named guest silently vanished even though the
  // app believed each call had registered a new person.
  describe('repeated calls continue numbering instead of duplicating names', () => {
    it('season member calling +1 four times in a row each gets a distinct friend name', () => {
      // Each call simulates withFreshCalendarEvent re-reading Notion, which by then
      // already contains the guest written by the previous call.
      let event: CalendarEventData = { ...baseEvent, guests: [] };
      const producedNames: string[] = [];

      for (let call = 0; call < 4; call++) {
        const result = calculateAddCapacity(event, season, '許文修', 1, true);
        expect(result.canAdd).toBe(true);
        const newGuests = result.newGuests ?? [];
        const added = newGuests.filter((g) => !event.guests.includes(g));
        expect(added).toHaveLength(1);
        producedNames.push(added[0] as string);
        event = { ...event, guests: newGuests };
      }

      // All four calls must have produced four distinct, non-colliding names.
      expect(new Set(producedNames).size).toBe(4);
      expect(producedNames).toEqual(['許文修的朋友', '許文修的朋友2', '許文修的朋友3', '許文修的朋友4']);
      expect(event.guests).toHaveLength(4);
    });

    it('non-season member calling +1 repeatedly each gets a distinct numbered name', () => {
      let event: CalendarEventData = { ...baseEvent, guests: [] };
      const producedNames: string[] = [];

      for (let call = 0; call < 3; call++) {
        const result = calculateAddCapacity(event, season, 'Alice', 1, false);
        expect(result.canAdd).toBe(true);
        const newGuests = result.newGuests ?? [];
        const added = newGuests.filter((g) => !event.guests.includes(g));
        expect(added).toHaveLength(1);
        producedNames.push(added[0] as string);
        event = { ...event, guests: newGuests };
      }

      expect(new Set(producedNames).size).toBe(3);
      expect(producedNames).toEqual(['Alice', 'Alice 2', 'Alice 3']);
    });

    it('numbering for one target is not thrown off by unrelated existing guest names (season members)', () => {
      // Alice already has a friend registered; Bob then registers his first friend.
      // Bob's numbering must start fresh, not continue from Alice's.
      const event: CalendarEventData = { ...baseEvent, guests: ['Alice的朋友'] };
      const result = calculateAddCapacity(event, season, 'Bob', 1, true);

      expect(result.canAdd).toBe(true);
      expect(result.newGuests).toEqual(['Alice的朋友', 'Bob的朋友']);
    });

    it('a target with existing entries continues numbering correctly even with unrelated guests interleaved', () => {
      const event: CalendarEventData = {
        ...baseEvent,
        guests: ['Alice的朋友', 'Bob的朋友', 'Alice的朋友2'],
      };
      const result = calculateAddCapacity(event, season, 'Bob', 1, true);

      expect(result.canAdd).toBe(true);
      // Bob already has one entry ("Bob的朋友"), so the new one must be "Bob的朋友2",
      // not another "Bob的朋友" (which would collide) and not influenced by Alice's
      // own "2" suffix.
      expect(result.newGuests).toEqual(['Alice的朋友', 'Bob的朋友', 'Alice的朋友2', 'Bob的朋友2']);
    });

    it('a non-season target with existing entries continues numbering without being thrown off by unrelated names', () => {
      const event: CalendarEventData = { ...baseEvent, guests: ['Alice', 'Bob', 'Alice 2'] };
      const result = calculateAddCapacity(event, season, 'Bob', 1, false);

      expect(result.canAdd).toBe(true);
      expect(result.newGuests).toEqual(['Alice', 'Bob', 'Alice 2', 'Bob 2']);
    });

    it('picks up numbering after a gap left by a previous removal', () => {
      // e.g. "Bob的朋友" was removed earlier via -1, leaving only "Bob的朋友2" behind;
      // the next +1 must not reuse "Bob的朋友2" and collide.
      const event: CalendarEventData = { ...baseEvent, guests: ['Bob的朋友2'] };
      const result = calculateAddCapacity(event, season, 'Bob', 1, true);

      expect(result.canAdd).toBe(true);
      expect(result.newGuests).toEqual(['Bob的朋友2', 'Bob的朋友3']);
    });

    it('requesting multiple entries in a single call still avoids colliding with existing ones', () => {
      const event: CalendarEventData = { ...baseEvent, guests: ['許文修的朋友'] };
      const result = calculateAddCapacity(event, season, '許文修', 2, true);

      expect(result.canAdd).toBe(true);
      expect(result.newGuests).toEqual(['許文修的朋友', '許文修的朋友2', '許文修的朋友3']);
      // No duplicate strings in the array that gets sent to Notion's multi_select.
      expect(new Set(result.newGuests)).toHaveProperty('size', result.newGuests?.length);
    });
  });

  // TODO.md (2026-09-22) 🟢 Low: regression coverage for "event.guests already contains
  // this targetName's previous entries when calculateAddCapacity is called" — the
  // duplicate-naming bug itself is already fixed via findMaxExistingIndex(); these tests
  // just pin down the behavior directly (the scenarios above already exercise the same
  // logic via repeated-call loops / interleaved guests, but these spell out the exact
  // cases called out in the TODO for clarity).
  describe('event.guests already contains this target\'s previous entries', () => {
    it('season member: existing "Bob的朋友" leads to "Bob的朋友2", not a duplicate "Bob的朋友"', () => {
      const event: CalendarEventData = { ...baseEvent, guests: ['Bob的朋友'] };
      const result = calculateAddCapacity(event, season, 'Bob', 1, true);

      expect(result.canAdd).toBe(true);
      expect(result.newGuests).toEqual(['Bob的朋友', 'Bob的朋友2']);
    });

    it('non-season member: existing "Alice" leads to "Alice 2", not a duplicate "Alice"', () => {
      const event: CalendarEventData = { ...baseEvent, guests: ['Alice'] };
      const result = calculateAddCapacity(event, season, 'Alice', 1, false);

      expect(result.canAdd).toBe(true);
      expect(result.newGuests).toEqual(['Alice', 'Alice 2']);
    });

    it('existing "Bob的朋友" and "Bob的朋友2" leads to "Bob的朋友3" next', () => {
      const event: CalendarEventData = { ...baseEvent, guests: ['Bob的朋友', 'Bob的朋友2'] };
      const result = calculateAddCapacity(event, season, 'Bob', 1, true);

      expect(result.canAdd).toBe(true);
      expect(result.newGuests).toEqual(['Bob的朋友', 'Bob的朋友2', 'Bob的朋友3']);
    });
  });

  // TODO.md (2026-09-22) 🟢 Low: coverage for the defense-in-depth duplicate check
  // (capacity-calculator.ts:118-133). The normal numbering path above is guaranteed by
  // findMaxExistingIndex() to never produce a duplicate for the target being processed,
  // so it cannot be used to trigger this branch. The one realistic way to trigger it
  // (per the code's own comment: "a future bug, an admin path, manual data") is
  // event.guests already containing a duplicate string *before* this call runs — e.g.
  // corrupted data from before this fix existed, or a manual Notion edit — which the
  // scan-the-whole-array check still catches even though it has nothing to do with the
  // targetName/delta this particular call is processing.
  describe('defensive duplicate detection (logger.warn)', () => {
    it('warns when event.guests already contains a pre-existing duplicate name unrelated to this call\'s target', () => {
      const event: CalendarEventData = { ...baseEvent, guests: ['Bob的朋友', 'Bob的朋友'] };
      const result = calculateAddCapacity(event, season, 'Carol', 1, true);

      expect(result.canAdd).toBe(true);
      expect(result.newGuests).toEqual(['Bob的朋友', 'Bob的朋友', 'Carol的朋友']);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ targetName: 'Carol', duplicates: ['Bob的朋友'] }),
        expect.stringContaining('duplicate guest name')
      );
    });

    it('does NOT warn on the normal, non-colliding numbering path', () => {
      const event: CalendarEventData = { ...baseEvent, guests: ['Bob的朋友'] };
      const result = calculateAddCapacity(event, season, 'Bob', 1, true);

      expect(result.canAdd).toBe(true);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});

describe('calculateRemoveCapacity', () => {
  it('removes matching guest entries', () => {
    const event: CalendarEventData = { ...baseEvent, guests: ['Alice', 'Bob'] };
    const result = calculateRemoveCapacity(event, 'Alice', -1, false);
    expect(result.canAdd).toBe(true);
    expect(result.newGuests).toEqual(['Bob']);
  });

  it('removes friend entries for season member', () => {
    const event: CalendarEventData = { ...baseEvent, guests: ['Carol的朋友', 'Dave'] };
    const result = calculateRemoveCapacity(event, 'Carol', -1, true);
    expect(result.canAdd).toBe(true);
    expect(result.newGuests).toEqual(['Dave']);
  });

  it('returns error when name not found', () => {
    const result = calculateRemoveCapacity(baseEvent, 'Nobody', -1, false);
    expect(result.canAdd).toBe(false);
    expect(result.error).toMatch(/找不到/);
  });

  it('removes the second/third entry for a non-season member with existing numbered entries', () => {
    const event: CalendarEventData = { ...baseEvent, guests: ['Alice', 'Alice 2', 'Alice 3', 'Bob'] };
    const result = calculateRemoveCapacity(event, 'Alice', -1, false);
    expect(result.canAdd).toBe(true);
    // removes the first match in list order; the important part is only one Alice entry is removed
    expect(result.newGuests).toHaveLength(3);
    expect(result.newGuests).toContain('Bob');
    expect(result.newGuests?.filter((g) => g === 'Alice' || g === 'Alice 2' || g === 'Alice 3')).toHaveLength(2);
  });

  it('does NOT match an unrelated name that is a string prefix of another guest (non-season)', () => {
    // Regression test for the "Al" vs "Alice"/"Alice 2" data-deletion bug.
    const event: CalendarEventData = { ...baseEvent, guests: ['Alice', 'Alice 2'] };
    const result = calculateRemoveCapacity(event, 'Al', -1, false);
    expect(result.canAdd).toBe(false);
    expect(result.error).toMatch(/找不到/);
    expect(event.guests).toEqual(['Alice', 'Alice 2']);
  });

  it('does NOT match a guest whose name merely starts with the target name (non-season)', () => {
    const event: CalendarEventData = { ...baseEvent, guests: ['Peter Wang'] };
    const result = calculateRemoveCapacity(event, 'Peter', -1, false);
    expect(result.canAdd).toBe(false);
    expect(result.error).toMatch(/找不到/);
  });

  it('removes own exact-name entry without touching a longer, unrelated same-prefix name (non-season)', () => {
    const event: CalendarEventData = { ...baseEvent, guests: ['Peter', 'Peter Wang'] };
    const result = calculateRemoveCapacity(event, 'Peter', -1, false);
    expect(result.canAdd).toBe(true);
    expect(result.newGuests).toEqual(['Peter Wang']);
  });

  it('does NOT match an unrelated name that is a string prefix of a friend entry (season member)', () => {
    // "Bo" should not accidentally match "Bob的朋友" / "Bob的朋友2".
    const event: CalendarEventData = { ...baseEvent, guests: ['Bob的朋友', 'Bob的朋友2'] };
    const result = calculateRemoveCapacity(event, 'Bo', -1, true);
    expect(result.canAdd).toBe(false);
    expect(result.error).toMatch(/找不到/);
    expect(event.guests).toEqual(['Bob的朋友', 'Bob的朋友2']);
  });

  it('removes a numbered friend entry for a season member', () => {
    const event: CalendarEventData = { ...baseEvent, guests: ['Bob的朋友', 'Bob的朋友2', 'Carol的朋友'] };
    const result = calculateRemoveCapacity(event, 'Bob', -2, true);
    expect(result.canAdd).toBe(true);
    expect(result.newGuests).toEqual(['Carol的朋友']);
  });
});

describe('calculateTotalSlots', () => {
  it('computes courts × 7 − season members + absentees', () => {
    // 2 courts × 7 = 14, minus 3 season members, plus 1 absentee = 12
    const event: CalendarEventData = { ...baseEvent, absentees: ['p4'] };
    expect(calculateTotalSlots(event, season)).toBe(12);
  });

  it('uses the calendar court count over the season default when set', () => {
    // 1 court (calendar) × 7 = 7, minus 3 season members, plus 1 absentee = 5
    const event: CalendarEventData = { ...baseEvent, absentees: ['p4'], courts: 1 };
    expect(calculateTotalSlots(event, season)).toBe(5);
  });
});

describe('resolveCourts', () => {
  it('prefers the calendar court count', () => {
    expect(resolveCourts({ courts: 3 }, { courts: 2 })).toBe(3);
  });

  it('falls back to the season default when the calendar court count is unset', () => {
    expect(resolveCourts({ courts: null }, { courts: 2 })).toBe(2);
  });
});

describe('calculateAddCapacity with a calendar court override', () => {
  it('caps a non-admin request against the calendar court count, not the season default', () => {
    // 1 court (calendar) × 7 - 3 members + 0 absentees - 0 guests = 4 available
    // (season default of 2 courts would have allowed 11)
    const result = calculateAddCapacity({ ...baseEvent, courts: 1 }, season, 'Alice', 10, false);
    expect(result.canAdd).toBe(true);
    expect(result.cappedAt).toBe(4);
    expect(result.newGuests).toHaveLength(4);
  });
});
