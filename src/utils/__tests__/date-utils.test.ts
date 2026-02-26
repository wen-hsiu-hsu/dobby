import { describe, it, expect } from 'vitest';
import { getNextSaturday, getQuarter, formatDate, getNextSaturdayDateText } from '../date-utils.js';

describe('getNextSaturday', () => {
  it('returns same day if today is Saturday', () => {
    const sat = new Date('2024-01-06'); // Saturday
    const result = getNextSaturday(sat);
    expect(formatDate(result)).toBe('2024-01-06');
  });

  it('returns next Saturday from Sunday', () => {
    const sun = new Date('2024-01-07'); // Sunday
    const result = getNextSaturday(sun);
    expect(formatDate(result)).toBe('2024-01-13');
  });

  it('returns next Saturday from Monday', () => {
    const mon = new Date('2024-01-08'); // Monday
    expect(formatDate(getNextSaturday(mon))).toBe('2024-01-13');
  });

  it('returns next Saturday from Friday', () => {
    const fri = new Date('2024-01-05'); // Friday
    expect(formatDate(getNextSaturday(fri))).toBe('2024-01-06');
  });
});

describe('getQuarter', () => {
  it('returns Q1 for January', () => {
    expect(getQuarter(new Date('2024-01-15'))).toBe(1);
  });

  it('returns Q2 for April', () => {
    expect(getQuarter(new Date('2024-04-01'))).toBe(2);
  });

  it('returns Q3 for July', () => {
    expect(getQuarter(new Date('2024-07-01'))).toBe(3);
  });

  it('returns Q4 for October', () => {
    expect(getQuarter(new Date('2024-10-01'))).toBe(4);
  });
});

describe('formatDate', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(formatDate(new Date('2024-03-05'))).toBe('2024-03-05');
  });

  it('zero-pads month and day', () => {
    expect(formatDate(new Date('2024-01-01'))).toBe('2024-01-01');
  });
});

describe('getNextSaturdayDateText', () => {
  it('formats Saturday as YYYY/MM/DD（六）', () => {
    const fri = new Date('2024-01-05');
    expect(getNextSaturdayDateText(fri)).toBe('2024/01/06（六）');
  });
});
