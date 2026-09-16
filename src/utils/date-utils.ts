const TAIPEI_TZ = 'Asia/Taipei';

/**
 * Returns date parts (year, month 1-based, day, weekday 0=Sun) in Asia/Taipei timezone.
 */
function getTaipeiParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TAIPEI_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: weekdayMap[get('weekday')],
  };
}

/**
 * Returns the next Saturday from today (or today if today is Saturday),
 * using Asia/Taipei timezone to determine the current day.
 */
export function getNextSaturday(from: Date = new Date()): Date {
  const { weekday, year, month, day } = getTaipeiParts(from);
  const daysUntilSaturday = weekday === 6 ? 0 : (6 - weekday);
  // Return as a UTC midnight date offset by the days needed
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + daysUntilSaturday);
  return base;
}

/**
 * Returns fiscal quarter number (1-4) for a given date, using Asia/Taipei timezone.
 */
export function getQuarter(date: Date = new Date()): number {
  const { month } = getTaipeiParts(date);
  return Math.floor((month - 1) / 3) + 1;
}

/**
 * Returns the current season name in "YYYY-QN" format using Asia/Taipei timezone.
 * e.g. "2026-Q1"
 */
export function getCurrentSeasonName(): string {
  const { year, month } = getTaipeiParts(new Date());
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Returns the month range text for a season name in "YYYY-QN" format, e.g. "2026-Q3" → "7~9月".
 */
export function getSeasonMonthRange(seasonName: string): string {
  const match = seasonName.match(/Q([1-4])/);
  if (!match) return '';
  const quarter = Number(match[1]);
  const startMonth = (quarter - 1) * 3 + 1;
  return `${startMonth}~${startMonth + 2}月`;
}

/**
 * Groups ISO dates (or "YYYY-MM-DD" prefixes) by month, formats each as "M/DD" (no leading
 * zero on month), joins same-month dates with ", " and separates months with a newline.
 * e.g. ["2026-07-04", "2026-07-11", "2026-08-01"] → "7/04, 7/11\n8/01"
 */
export function groupDatesByMonth(isoDates: string[]): string {
  const sorted = [...isoDates].sort((a, b) => a.localeCompare(b));
  const groups = new Map<string, string[]>();
  for (const iso of sorted) {
    const [, m, d] = iso.slice(0, 10).split('-');
    const groupKey = iso.slice(0, 7); // "YYYY-MM"
    const label = `${Number(m)}/${d}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(label);
  }
  return [...groups.values()].map((labels) => labels.join(', ')).join('\n');
}

/**
 * Formats a Date (treated as UTC) as YYYY-MM-DD.
 */
export function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns the next Saturday date as a formatted string, e.g. "2024/01/06（六）".
 */
export function getNextSaturdayDateText(from: Date = new Date()): string {
  const sat = getNextSaturday(from);
  const y = sat.getUTCFullYear();
  const m = String(sat.getUTCMonth() + 1).padStart(2, '0');
  const d = String(sat.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${d}（六）`;
}
