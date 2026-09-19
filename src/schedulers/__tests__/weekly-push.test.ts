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
vi.mock('../../config/env.js', () => ({ env: { DOBBY_GROUP_IDS: ['group-test-1'] } }));
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
const loggerInfoMock = vi.mocked(logger.info);

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
    env.DOBBY_GROUP_IDS = ['group-test-1'];
    findByDateMock.mockResolvedValue(makeCalendarEvent());
    findByNameMock.mockResolvedValue(makeSeasonRecord());
    pushMessageMock.mockResolvedValue(undefined);
  });

  it('pushes the weekly message to the single configured group when data loads normally', async () => {
    await sendWeeklyPush();

    expect(pushMessageMock).toHaveBeenCalledTimes(1);
    const [to] = pushMessageMock.mock.calls[0]!;
    expect(to).toBe('group-test-1');
  });

  it('does not push and logs an error when DOBBY_GROUP_IDS is unset', async () => {
    env.DOBBY_GROUP_IDS = [];

    await sendWeeklyPush();

    expect(pushMessageMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith('Weekly push aborted: DOBBY_GROUP_IDS is not set');
  });

  it('shows a paused message instead of attendance count when the event is paused', async () => {
    findByDateMock.mockResolvedValue(makeCalendarEvent({ isPaused: true }));

    await sendWeeklyPush();

    const [, messages] = pushMessageMock.mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;
    expect(text).toContain('本週活動暫停');
    expect(text).not.toContain('出席人數');
  });

  it('pushes to every configured group when there are multiple targets and all succeed', async () => {
    env.DOBBY_GROUP_IDS = ['group-1', 'group-2', 'group-3'];

    await sendWeeklyPush();

    expect(pushMessageMock).toHaveBeenCalledTimes(3);
    const calledTo = pushMessageMock.mock.calls.map((call) => call[0]);
    expect(calledTo).toEqual(['group-1', 'group-2', 'group-3']);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: 3, failed: 0, total: 3 }),
      expect.any(String)
    );
  });

  it('keeps pushing to the remaining groups when one group fails', async () => {
    env.DOBBY_GROUP_IDS = ['group-1', 'group-2', 'group-3'];
    pushMessageMock.mockImplementation(async (to) => {
      if (to === 'group-2') throw new Error('LINE API error');
    });

    await sendWeeklyPush();

    expect(pushMessageMock).toHaveBeenCalledTimes(3);
    const calledTo = pushMessageMock.mock.calls.map((call) => call[0]);
    expect(calledTo).toEqual(['group-1', 'group-2', 'group-3']);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'group-2' }),
      expect.any(String)
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: 2, failed: 1, total: 3 }),
      expect.any(String)
    );
  });

  it('logs a per-group error for every target and does not throw when all groups fail', async () => {
    env.DOBBY_GROUP_IDS = ['group-1', 'group-2'];
    pushMessageMock.mockRejectedValue(new Error('LINE API error'));

    await expect(sendWeeklyPush()).resolves.not.toThrow();

    expect(pushMessageMock).toHaveBeenCalledTimes(2);
    expect(loggerErrorMock).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'group-1' }), expect.any(String));
    expect(loggerErrorMock).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'group-2' }), expect.any(String));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: 0, failed: 2, total: 2 }),
      expect.any(String)
    );
  });
});
