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
});

describe('calculateTotalSlots', () => {
  it('computes courts × 7 − season members + absentees', () => {
    // 2 courts × 7 = 14, minus 3 season members, plus 1 absentee = 12
    const event: CalendarEventData = { ...baseEvent, absentees: ['p4'] };
    expect(calculateTotalSlots(event, season)).toBe(12);
  });
});
