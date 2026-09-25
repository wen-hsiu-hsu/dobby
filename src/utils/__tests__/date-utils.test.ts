import { describe, it, expect } from 'vitest';
import {
  getNextSaturday,
  getQuarter,
  formatDate,
  getNextSaturdayDateText,
  getSeasonMonthRange,
  groupDatesByMonth,
  parseSeasonInput,
  getSeasonQuarter,
  getPreviousSeasonName,
  formatSeasonTitle,
} from '../date-utils.js';

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

describe('getSeasonMonthRange', () => {
  it('returns 1~3月 for Q1', () => {
    expect(getSeasonMonthRange('2026-Q1')).toBe('1~3月');
  });

  it('returns 7~9月 for Q3', () => {
    expect(getSeasonMonthRange('2026-Q3')).toBe('7~9月');
  });

  it('returns 10~12月 for Q4', () => {
    expect(getSeasonMonthRange('2026-Q4')).toBe('10~12月');
  });

  it('returns empty string for an unrecognized format', () => {
    expect(getSeasonMonthRange('not-a-season')).toBe('');
  });
});

describe('groupDatesByMonth', () => {
  it('groups same-month dates on one line as "M/DD, M/DD", separating months with a newline', () => {
    const dates = [
      '2026-07-04', '2026-07-11', '2026-07-18', '2026-07-25',
      '2026-08-01', '2026-08-08',
      '2026-09-05',
    ];
    expect(groupDatesByMonth(dates)).toBe(
      '7/04, 7/11, 7/18, 7/25\n8/01, 8/08\n9/05',
    );
  });

  it('sorts unordered input before grouping', () => {
    expect(groupDatesByMonth(['2026-08-01', '2026-07-04'])).toBe('7/04\n8/01');
  });

  it('accepts full ISO datetime strings, using only the date portion', () => {
    expect(groupDatesByMonth(['2026-09-26T20:00:00.000+08:00'])).toBe('9/26');
  });

  it('returns empty string for no dates', () => {
    expect(groupDatesByMonth([])).toBe('');
  });
});

describe('parseSeasonInput', () => {
  it('accepts the canonical hyphenated form', () => {
    expect(parseSeasonInput('2026-Q2')).toBe('2026-Q2');
  });

  it('accepts no hyphen', () => {
    expect(parseSeasonInput('2026Q2')).toBe('2026-Q2');
  });

  it('accepts a lowercase q, with or without a hyphen', () => {
    expect(parseSeasonInput('2026q2')).toBe('2026-Q2');
    expect(parseSeasonInput('2026-q2')).toBe('2026-Q2');
  });

  it('returns null for a quarter outside 1-4', () => {
    expect(parseSeasonInput('2026Q5')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(parseSeasonInput('not-a-season')).toBeNull();
    expect(parseSeasonInput('26Q2')).toBeNull();
    expect(parseSeasonInput('2026Q2x')).toBeNull();
  });
});

describe('getSeasonQuarter', () => {
  it('returns the quarter number encoded in the season name', () => {
    expect(getSeasonQuarter('2026-Q3')).toBe(3);
  });

  it('throws for an invalid season name', () => {
    expect(() => getSeasonQuarter('not-a-season')).toThrow();
  });
});

describe('getPreviousSeasonName', () => {
  it('returns the prior quarter within the same year', () => {
    expect(getPreviousSeasonName('2026-Q2')).toBe('2026-Q1');
  });

  it('wraps to Q4 of the prior year when crossing a year boundary', () => {
    expect(getPreviousSeasonName('2027-Q1')).toBe('2026-Q4');
  });

  it('throws for an invalid season name', () => {
    expect(() => getPreviousSeasonName('not-a-season')).toThrow();
  });
});

describe('formatSeasonTitle', () => {
  it('includes the month range by default', () => {
    expect(formatSeasonTitle('2026-Q2')).toBe('2026 Q2 (4~6月)');
  });

  it('omits the month range when withMonthRange is false', () => {
    expect(formatSeasonTitle('2026-Q2', false)).toBe('2026 Q2');
  });
});
