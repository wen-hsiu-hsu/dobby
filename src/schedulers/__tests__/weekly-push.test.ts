import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendWeeklyPush } from '../weekly-push.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import { pushMessage } from '../../services/line/push-service.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import type { CalendarEvent, SeasonRecord } from '../../types/notion-models.js';

vi.mock('../../services/notion/calendar-repository.js');
vi.mock('../../services/notion/season-repository.js');
vi.mock('../../services/line/push-service.js');
vi.mock('../../config/env.js', () => ({ env: { DOBBY_GROUP_ID: 'group-test-1' } }));
// logger.ts wraps pino in a Proxy with a `get`-only trap that always reads
// straight off the underlying pino instance, ignoring anything a spy would
// set on the exported object — vi.spyOn(logger, 'error') is a silent no-op
// against it. Mock the whole module instead, matching this repo's other
// logger-asserting tests (e.g. log-cleanup.test.ts).
vi.mock('../../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const findByDateMock = vi.mocked(calendarRepo.findByDate);
const findByNameMock = vi.mocked(seasonRepo.findByName);
const pushMessageMock = vi.mocked(pushMessage);
const loggerErrorMock = vi.mocked(logger.error);

function makeCalendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    pageId: 'cal-1',
    date: '2026-09-20',
    absentees: [],
    guests: [],
    isPaused: false,
    ...overrides,
  };
}

function makeSeasonRecord(overrides: Partial<SeasonRecord> = {}): SeasonRecord {
  return {
    pageId: 'season-1',
    name: '2026-Q3',
    members: [],
    courts: 2,
    guestFee: 170,
    location: '某體育館',
    weekCounts: 12,
    pricePerPersonForSeason: 1000,
    pricePerPersonOverride: null,
    totalPrice: 12000,
    playDatePageIds: [],
    ...overrides,
  };
}

describe('sendWeeklyPush', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    env.DOBBY_GROUP_ID = 'group-test-1';
    findByDateMock.mockResolvedValue(makeCalendarEvent());
    findByNameMock.mockResolvedValue(makeSeasonRecord());
  });

  it('pushes the weekly message to DOBBY_GROUP_ID when data loads normally', async () => {
    await sendWeeklyPush();

    expect(pushMessageMock).toHaveBeenCalledTimes(1);
    const [to, , botId] = pushMessageMock.mock.calls[0]!;
    expect(to).toBe('group-test-1');
    expect(botId).toBe('dobby');
  });

  it('does not push and logs an error when DOBBY_GROUP_ID is unset', async () => {
    env.DOBBY_GROUP_ID = '';

    await sendWeeklyPush();

    expect(pushMessageMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith('Weekly push aborted: DOBBY_GROUP_ID is not set');
  });

  it('shows a paused message instead of attendance count when the event is paused', async () => {
    findByDateMock.mockResolvedValue(makeCalendarEvent({ isPaused: true }));

    await sendWeeklyPush();

    const [, messages] = pushMessageMock.mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;
    expect(text).toContain('本週活動暫停');
    expect(text).not.toContain('出席人數');
  });
});
