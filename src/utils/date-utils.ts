/**
 * Returns the next Saturday from today (or today if today is Saturday).
 */
export function getNextSaturday(from: Date = new Date()): Date {
  const date = new Date(from);
  const day = date.getDay(); // 0=Sun, 6=Sat
  const daysUntilSaturday = day === 6 ? 0 : (6 - day);
  date.setDate(date.getDate() + daysUntilSaturday);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Returns fiscal quarter number (1-4) for a given date.
 */
export function getQuarter(date: Date = new Date()): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

/**
 * Returns the current season name in "YYYY-QN" format using Asia/Taipei timezone.
 * e.g. "2026-Q1"
 */
export function getCurrentSeasonName(): string {
  const now = new Date();
  const taipei = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const year = Number(taipei.find((p) => p.type === 'year')!.value);
  const month = Number(taipei.find((p) => p.type === 'month')!.value);
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Formats a date as YYYY-MM-DD.
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns the next Saturday date as a formatted string, e.g. "2024/01/06（六）".
 */
export function getNextSaturdayDateText(from: Date = new Date()): string {
  const sat = getNextSaturday(from);
  const y = sat.getFullYear();
  const m = String(sat.getMonth() + 1).padStart(2, '0');
  const d = String(sat.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}（六）`;
}
