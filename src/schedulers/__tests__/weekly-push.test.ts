import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendWeeklyPush } from '../weekly-push.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import * as peopleRepo from '../../services/notion/people-repository.js';
import { pushMessage } from '../../services/line/push-service.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import type { CalendarEvent, SeasonRecord, PersonRecord } from '../../types/notion-models.js';

vi.mock('../../services/notion/calendar-repository.js');
vi.mock('../../services/notion/season-repository.js');
vi.mock('../../services/notion/people-repository.js');
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
const findByPageIdsMock = vi.mocked(peopleRepo.findByPageIds);
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

function makePerson(overrides: Partial<PersonRecord> = {}): PersonRecord {
  return {
    pageId: 'person-1',
    name: '某人',
    hasPaid: true,
    lineUserId: 'line-1',
    ...overrides,
  };
}

function pushedText(): string {
  const [, messages] = pushMessageMock.mock.calls[0]!;
  return (messages[0] as { text: string }).text;
}

describe('sendWeeklyPush', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    env.DOBBY_GROUP_IDS = ['group-test-1'];
    findByDateMock.mockResolvedValue(makeCalendarEvent());
    findByNameMock.mockResolvedValue(makeSeasonRecord());
    findByPageIdsMock.mockResolvedValue([]);
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

  it('aborts and logs an error when there is no calendar event or season for the date', async () => {
    findByDateMock.mockResolvedValue(null);

    await sendWeeklyPush();

    expect(pushMessageMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ nextSaturday: expect.any(String) }),
      'Weekly push aborted: no calendar/season data for date'
    );
  });

  it('shows a paused message instead of attendance count when the event is paused', async () => {
    findByDateMock.mockResolvedValue(makeCalendarEvent({ isPaused: true }));

    await sendWeeklyPush();

    const text = pushedText();
    expect(text).toContain('本週活動暫停');
    expect(text).not.toContain('應到');
  });

  it('builds a numbered guest list with filled and empty slots, and reports courts/fee/attendance', async () => {
    findByDateMock.mockResolvedValue(
      makeCalendarEvent({ date: '2026-09-26', guests: ['小明', '小華'] })
    );
    // courts=1 -> totalSlots = 1*7 - members.length(3) + absentees.length(0) = 4
    findByNameMock.mockResolvedValue(makeSeasonRecord({ courts: 1, guestFee: 200, members: ['p1', 'p2', 'p3'] }));

    await sendWeeklyPush();

    const text = pushedText();
    expect(text).toContain('2026-09-26 不能到請喊聲');
    expect(text).toContain('零打名額：4人 $200/人');
    expect(text).toContain('1. 小明');
    expect(text).toContain('2. 小華');
    expect(text).toContain('3. ');
    expect(text).toContain('4. ');
    expect(text).toContain('場地：1 面');
    expect(text).toContain('應到：3 人');
    expect(text).toContain('請假：無');
  });

  it('resolves absentee names and joins them with 、 when there are absentees', async () => {
    findByDateMock.mockResolvedValue(makeCalendarEvent({ absentees: ['p-a', 'p-b'] }));
    findByPageIdsMock.mockResolvedValue([makePerson({ name: '小美' }), makePerson({ name: '小強' })]);

    await sendWeeklyPush();

    expect(findByPageIdsMock).toHaveBeenCalledWith(['p-a', 'p-b']);
    const text = pushedText();
    expect(text).toContain('請假：小美、小強');
  });

  it('shows 無 for absentees when there are none', async () => {
    findByDateMock.mockResolvedValue(makeCalendarEvent({ absentees: [] }));

    await sendWeeklyPush();

    expect(findByPageIdsMock).not.toHaveBeenCalled();
    const text = pushedText();
    expect(text).toContain('請假：無');
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
