import { describe, it, expect } from 'vitest';
import { calculateAddCapacity, calculateRemoveCapacity, calculateTotalSlots } from '../registration/capacity-calculator.js';
import type { CalendarEventData, SeasonData } from '../registration/capacity-calculator.js';

const baseEvent: CalendarEventData = {
  pageId: 'evt1',
  date: '2024-01-06',
  absentees: [],
  guests: [],
  isPaused: false,
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
});
