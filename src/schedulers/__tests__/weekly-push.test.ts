import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendWeeklyPush } from '../weekly-push.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import * as peopleRepo from '../../services/notion/people-repository.js';
import { pushMessage } from '../../services/line/push-service.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import { formatDate, getNextSaturday } from '../../utils/date-utils.js';
import { cardHeroSummary } from '../../commands/registration/__tests__/card-nav.js';
import type { CalendarEvent, SeasonRecord, PersonRecord } from '../../types/notion-models.js';

// Fixed so `getNextSaturday()` inside weekly-push.ts always resolves the same way,
// regardless of what day it is when the suite actually runs (see TODO.md 測試技術債
// 2026-09-27: hardcoded date strings previously expired as real time passed).
const FAKE_NOW = new Date('2026-01-14T12:00:00+08:00'); // Wednesday

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
    courts: null,
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
    courtPricePerHour: 450,
    actualFeePerPerson: null,
    refundPerPerson: null,
    balance: null,
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
    ...overrides,
  };
}

// 推播訊息現在是 Flex 卡片（見 weekly-status-message.ts 的 buildWeeklyStatusReply），
// 沒有 .text 欄位——用 altText 當精簡文字版斷言內容，跟報名／請假卡片的既有測試
// 慣例（test-utils/reply-text.ts 的 replyText()）一致。
function pushedAltText(): string {
  const [, messages] = pushMessageMock.mock.calls[0]!;
  return (messages[0] as { altText: string }).altText;
}

function pushedBubble(): any {
  const [, messages] = pushMessageMock.mock.calls[0]!;
  return (messages[0] as { contents: unknown }).contents;
}

describe('sendWeeklyPush', () => {
  let nextSaturday: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
    nextSaturday = formatDate(getNextSaturday());

    vi.resetAllMocks();
    env.DOBBY_GROUP_IDS = ['group-test-1'];
    findByDateMock.mockResolvedValue(makeCalendarEvent());
    findByNameMock.mockResolvedValue(makeSeasonRecord());
    findByPageIdsMock.mockResolvedValue([]);
    pushMessageMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('pushes a flex status card, not a plain-text message', async () => {
    await sendWeeklyPush();

    const [, messages] = pushMessageMock.mock.calls[0]!;
    expect(messages[0]!.type).toBe('flex');
    const summary = cardHeroSummary(pushedBubble());
    expect(summary.title).toBe('本週打球');
  });

  it('shows the paused card (title「本週活動暫停」, no footer/capacity) instead of the attendance card when the event is paused', async () => {
    findByDateMock.mockResolvedValue(makeCalendarEvent({ date: nextSaturday, isPaused: true }));

    await sendWeeklyPush();

    const bubble = pushedBubble();
    const titleRow = bubble.hero.contents[1].contents[1].contents[0];
    expect(titleRow.contents[1]).toMatchObject({ text: '本週活動暫停' });
    expect(bubble.footer).toBeUndefined();

    const altText = pushedAltText();
    expect(altText).toContain(nextSaturday);
    expect(altText).toContain('本週活動暫停');
    expect(altText).not.toContain('應到');
  });

  it('builds a numbered guest list with filled and empty slots, and reports courts/fee/attendance', async () => {
    findByDateMock.mockResolvedValue(
      makeCalendarEvent({ date: nextSaturday, guests: ['小明', '小華'] })
    );
    // courts=1 -> totalSlots = 1*7 - members.length(3) + absentees.length(0) = 4
    findByNameMock.mockResolvedValue(makeSeasonRecord({ courts: 1, guestFee: 200, members: ['p1', 'p2', 'p3'] }));

    await sendWeeklyPush();

    const bubble = pushedBubble();
    const summary = cardHeroSummary(bubble);
    // 行事曆 event.courts 未填，resolveCourts 用季預設(1)，跟季預設本身相同 -> 沒有「本週調整」
    expect(summary.subtitle).toBe('不能到請喊聲');

    const guestSection = bubble.body.contents[0].contents;
    expect(guestSection.map((row: any) => row.contents?.[1]?.text)).toEqual(
      expect.arrayContaining(['小明', '小華'])
    );

    const altText = pushedAltText();
    expect(altText).toContain(nextSaturday);
    expect(altText).toContain('零打名額 4 人 | $200/人');
    expect(altText).toContain('1. 小明');
    expect(altText).toContain('2. 小華');
    expect(altText).toContain('場地：1 面');
    expect(altText).not.toContain('本週調整');
    expect(altText).toContain('總人數：共 5 人'); // presentSeasonMembers(3) + guests(2)
    expect(altText).toContain('請假：無');
  });

  it('resolves absentee names and joins them with 、 when there are absentees', async () => {
    findByDateMock.mockResolvedValue(makeCalendarEvent({ absentees: ['p-a', 'p-b'] }));
    findByPageIdsMock.mockResolvedValue([makePerson({ name: '小美' }), makePerson({ name: '小強' })]);

    await sendWeeklyPush();

    expect(findByPageIdsMock).toHaveBeenCalledWith(['p-a', 'p-b']);
    const bubble = pushedBubble();
    const leaveSection = bubble.body.contents[2];
    expect(leaveSection.contents[1].text).toBe('小美、小強');
    expect(pushedAltText()).toContain('請假：小美、小強');
  });

  it('shows 無 for absentees when there are none', async () => {
    findByDateMock.mockResolvedValue(makeCalendarEvent({ absentees: [] }));

    await sendWeeklyPush();

    expect(findByPageIdsMock).not.toHaveBeenCalled();
    const bubble = pushedBubble();
    const leaveSection = bubble.body.contents[2];
    expect(leaveSection.contents[1].text).toBe('無');
    expect(pushedAltText()).toContain('請假：無');
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
