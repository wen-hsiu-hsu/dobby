import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleLeave } from '../leave-handler.js';
import * as calendarRepo from '../../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../../services/notion/season-repository.js';
import * as peopleRepo from '../../../services/notion/people-repository.js';
import * as mutex from '../../../services/mutex.js';
import { resolveTarget } from '../target-resolver.js';
import { replyMessage } from '../../../services/line/reply-service.js';
import { logger } from '../../../utils/logger.js';
import { getCurrentSeasonName, getSeasonNameForDate, formatDate, getNextSaturday } from '../../../utils/date-utils.js';
import { replyText as sharedReplyText } from '../../../test-utils/index.js';
import { FLEX_ICONS } from '../../../config/flex-assets.js';
import { BADGE_COLORS } from '../flex-status-card.js';
import { cardHeroSummary } from './card-nav.js';

vi.mock('../../../services/notion/calendar-repository.js');
vi.mock('../../../services/notion/season-repository.js');
vi.mock('../../../services/notion/people-repository.js');
vi.mock('../target-resolver.js');
vi.mock('../../../services/line/reply-service.js');
vi.mock('../../../services/mutex.js');
vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const event = {
  replyToken: 'token',
  message: { text: '@Dobby 假' },
  source: { userId: 'user-alice' },
};

const baseSeason = {
  pageId: 'season-1',
  name: getCurrentSeasonName(),
  members: ['person-1'],
  courts: 2,
  guestFee: 200,
  location: '',
  weekCounts: 0,
  courtPricePerHour: 450,
  actualFeePerPerson: null,
  refundPerPerson: null,
  balance: null,
  totalPrice: null,
  playDatePageIds: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-1', displayName: 'Alice', resolvedVia: 'self' });
  vi.mocked(seasonRepo.findByName).mockResolvedValue(baseSeason);
  vi.mocked(calendarRepo.findByDate).mockResolvedValue({
    pageId: 'evt-1',
    date: '2026-05-09',
    absentees: [],
    guests: [],
    isPaused: false,
    courts: null,
  });
  vi.mocked(peopleRepo.findByPageIds).mockImplementation(async (ids: string[]) =>
    ids.map((id) => ({
      pageId: id,
      name: id === 'person-1' ? 'Alice' : id,
      hasPaid: true,
    })),
  );
  vi.mocked(peopleRepo.findAbsenteesOfEvent).mockImplementation(async (event) =>
    event.absentees.map((id) => ({
      pageId: id,
      name: id === 'person-1' ? 'Alice' : id,
      hasPaid: true,
    })),
  );
  vi.mocked(mutex.withMutex).mockImplementation(async (_pageId, fn) => fn());
});

// text/textV2 → .text、flex → .altText——請假結果現在多半是 Flex 卡片，不能再假設是純文字。
function reply(): { type: string; text?: string; altText?: string; contents?: any } {
  const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
  return messages[0] as any;
}

function replyText(): string {
  return sharedReplyText(reply() as any);
}

// 卡片 contents 本身（徽章底色／圖示／標題／副標題），見 card-nav.ts。呼叫端須確認
// reply().type === 'flex'，否則 .contents 是 undefined。
function cardSummary() {
  return cardHeroSummary(reply().contents);
}

describe('handleLeave', () => {
  it("looks up the event date's season by name, not just the first season record", async () => {
    await handleLeave(event, false, false);

    expect(seasonRepo.findByName).toHaveBeenCalledWith(getSeasonNameForDate(formatDate(getNextSaturday())));
  });

  describe('in the last days of a quarter, when next Saturday is already in the next season', () => {
    beforeEach(() => {
      // 2026-09-27 (Sun) 13:00 Asia/Taipei → next Saturday is 2026-10-03 (Q4)
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-27T05:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("looks up the event date's season (Q4), not today's (Q3)", async () => {
      await handleLeave(event, false, false);

      expect(seasonRepo.findByName).toHaveBeenCalledWith('2026-Q4');
      expect(seasonRepo.findByName).not.toHaveBeenCalledWith('2026-Q3');
      expect(calendarRepo.findByDate).toHaveBeenCalledWith('2026-10-03');
    });

    it("rejects leave from a last-season member who isn't in the event season", async () => {
      // person-1 was a Q3 member but is not in Q4's members
      vi.mocked(seasonRepo.findByName).mockImplementation(async (name: string) =>
        name === '2026-Q4' ? { ...baseSeason, name, members: ['person-9'] } : { ...baseSeason, name, members: ['person-1'] },
      );

      await handleLeave(event, false, false);

      expect(replyText()).toBe('請假/銷假功能僅限季租成員使用');
      expect(calendarRepo.updateAbsentees).not.toHaveBeenCalled();
    });

    it('replies with the event season name (not "僅限季租成員") when that season has not been created yet', async () => {
      vi.mocked(seasonRepo.findByName).mockResolvedValue(null);

      await handleLeave(event, false, false);

      expect(replyText()).toBe('找不到 2026-Q4 季租資料');
      expect(calendarRepo.findByDate).not.toHaveBeenCalled();
    });
  });

  it('names the missing target (not "your data") when an admin files leave for someone who cannot be resolved', async () => {
    vi.mocked(resolveTarget).mockResolvedValue(null);

    await handleLeave({ ...event, message: { text: '@Dobby 假 @Charlie' } }, false, true);

    expect(replyText()).toBe('找不到「Charlie」的資料，請確認名稱與人員清單一致');
  });

  it('still replies "not found" (not the season error) when both lookups come back empty', async () => {
    vi.mocked(resolveTarget).mockResolvedValue(null);
    vi.mocked(seasonRepo.findByName).mockResolvedValue(null);

    await handleLeave(event, false, false);

    expect(replyText()).toBe('找不到您的資料');
  });

  it('passes the actor snapshot to resolveTarget and looks up the season without waiting for it', async () => {
    let finishResolve!: (v: NonNullable<Awaited<ReturnType<typeof resolveTarget>>>) => void;
    vi.mocked(resolveTarget).mockReturnValue(new Promise((r) => { finishResolve = r; }));
    const actorUser = { userId: 'user-alice' } as any;

    const handling = handleLeave(event, false, false, actorUser);
    await Promise.resolve();
    expect(resolveTarget).toHaveBeenCalledWith(expect.objectContaining({ isSelf: true }), 'user-alice', actorUser);
    expect(seasonRepo.findByName).toHaveBeenCalled();

    finishResolve({ personPageId: 'person-1', displayName: 'Alice', resolvedVia: 'self' });
    await handling;
    expect(calendarRepo.updateAbsentees).toHaveBeenCalled();
  });

  // 取鎖前的查詢 throw 時 withFreshCalendarEvent 還沒接手，handler 要自己回覆，否則例外一路丟到 event-router 只記 log。
  it.each([
    ['the target lookup', () => vi.mocked(resolveTarget).mockRejectedValue(new Error('Notion 502'))],
    ['the season lookup', () => vi.mocked(seasonRepo.findByName).mockRejectedValue(new Error('Notion 502'))],
    [
      'the season lookup (with the target not found)',
      () => {
        vi.mocked(resolveTarget).mockResolvedValue(null);
        vi.mocked(seasonRepo.findByName).mockRejectedValue(new Error('Notion 502'));
      },
    ],
  ])('replies "系統錯誤" without taking the lock when %s throws', async (_label, arrange) => {
    arrange();

    await handleLeave(event, false, false);

    expect(replyMessage).toHaveBeenCalledTimes(1);
    expect(replyText()).toBe('系統錯誤，請稍後再試');
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'Leave handler error');
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'Leave handler outcome');
    expect(mutex.withMutex).not.toHaveBeenCalled();
  });

  it('wraps the read-modify-write in withMutex using the event date as key', async () => {
    await handleLeave(event, false, false);

    expect(mutex.withMutex).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.any(Function), { cancelIfNotStarted: true });
    expect(calendarRepo.updateAbsentees).toHaveBeenCalledWith('evt-1', ['person-1']);
  });

  it('replies with the full weekly status (not a bare one-liner) after leave is recorded', async () => {
    await handleLeave(event, false, false);

    const text = replyText();

    expect(text).toContain('請假成功 ✅');
    expect(text).toContain('剩餘名額：');
    expect(text).toContain('請假：Alice');
    // courts(2) * 7 - members(1) + absentees(1, after leave) = 14
    expect(text).toContain('零打名額 14 人');
    expect(text).toContain('總人數：共');
    expect(reply().type).toBe('flex');

    const card = cardSummary();
    expect(card.badgeColor).toBe(BADGE_COLORS.blue);
    expect(card.badgeIconUrl.endsWith(FLEX_ICONS.calendarXDark)).toBe(true);
    expect(card.title).toBe('請假成功');
    expect(card.subtitle).toBe('Alice 本週請假，零打名額 +1');
    // 姓名用寫入後的請假名單查，不是鎖內讀到的舊名單
    expect(peopleRepo.findAbsenteesOfEvent).toHaveBeenCalledWith({ pageId: 'evt-1', absentees: ['person-1'] });
  });

  // 寫入已經成功才查請假人姓名，這時回「系統錯誤」會讓使用者以為沒請到假而重打。
  it('replies with the headline (not "系統錯誤") when the absentee-name lookup throws after the write', async () => {
    vi.mocked(peopleRepo.findAbsenteesOfEvent).mockRejectedValue(new Error('Notion 502'));

    await handleLeave(event, false, false);

    expect(calendarRepo.updateAbsentees).toHaveBeenCalledWith('evt-1', ['person-1']);
    expect(replyMessage).toHaveBeenCalledTimes(1);
    expect(replyText()).toBe('請假成功 ✅\n（名額狀態暫時無法顯示）');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('replies with full status (not a bare one-liner) when cancelling leave', async () => {
    vi.mocked(calendarRepo.findByDate).mockResolvedValue({
      pageId: 'evt-1',
      date: '2026-05-09',
      absentees: ['person-1'],
      guests: [],
      isPaused: false,
      courts: null,
    });

    await handleLeave(event, true, false);

    expect(calendarRepo.updateAbsentees).toHaveBeenCalledWith('evt-1', []);
    const text = replyText();

    expect(text).toContain('銷假成功 ✅');
    expect(text).toContain('請假：無');
    // courts(2) * 7 - members(1) + absentees(0, after cancel) = 13
    expect(text).toContain('零打名額 13 人');

    const card = cardSummary();
    expect(card.badgeColor).toBe(BADGE_COLORS.lime);
    expect(card.badgeIconUrl.endsWith(FLEX_ICONS.calendarCheckDark)).toBe(true);
    expect(card.title).toBe('銷假成功');
    expect(card.subtitle).toBe('Alice 已銷假，零打名額 −1');
  });

  it('recomputes slots after cancelling leave with the calendar 場地數, not the season default', async () => {
    vi.mocked(calendarRepo.findByDate).mockResolvedValue({
      pageId: 'evt-1',
      date: '2026-05-09',
      absentees: ['person-1'],
      guests: [],
      isPaused: false,
      courts: 1,
    });

    await handleLeave(event, true, false);

    const text = replyText();
    expect(text).toContain('銷假成功 ✅');
    // calendar courts(1) * 7 - members(1) + absentees(0, after cancel) = 6 (season default would give 13)
    expect(text).toContain('零打名額 6 人');
  });

  it('replies with full status + reason when already on leave (no Notion write)', async () => {
    vi.mocked(calendarRepo.findByDate).mockResolvedValue({
      pageId: 'evt-1',
      date: '2026-05-09',
      absentees: ['person-1'],
      guests: [],
      isPaused: false,
      courts: null,
    });

    await handleLeave(event, false, false);

    expect(calendarRepo.updateAbsentees).not.toHaveBeenCalled();
    const text = replyText();

    expect(text).toContain('Alice 已請假，無需重複操作');
    expect(text).toContain('剩餘名額：');
    expect(reply().type).toBe('flex');

    const card = cardSummary();
    expect(card.badgeColor).toBe(BADGE_COLORS.gray);
    expect(card.badgeIconUrl.endsWith(FLEX_ICONS.infoWhite)).toBe(true);
    expect(card.title).toBe('已經請過假');
    expect(card.subtitle).toBe('Alice 已請假，無需重複操作');
  });

  it('replies with full status + reason when cancelling leave without having leave recorded (no Notion write)', async () => {
    await handleLeave(event, true, false);

    expect(calendarRepo.updateAbsentees).not.toHaveBeenCalled();
    const text = replyText();

    expect(text).toContain('Alice 目前未請假');
    expect(text).toContain('剩餘名額：');

    const card = cardSummary();
    expect(card.badgeColor).toBe(BADGE_COLORS.gray);
    expect(card.badgeIconUrl.endsWith(FLEX_ICONS.infoWhite)).toBe(true);
    expect(card.title).toBe('目前未請假');
    expect(card.subtitle).toBe('Alice 目前未請假');
  });

  it('replies with the parse error (not "你不是管理員") when a non-admin sends a malformed (non-@) target', async () => {
    // parseError is checked before the admin gate: a syntax mistake is not a permission
    // problem. leave-handler previously skipped this check entirely (registration-handler
    // had it, but only after the admin gate) — both must now report the same
    // "指令格式錯誤" to a non-admin instead of the misleading "你不是管理員".
    const malformedEvent = {
      replyToken: 'token',
      message: { text: '@Dobby 假 Charlie' },
      source: { userId: 'user-alice' },
    };

    await handleLeave(malformedEvent, false, false);

    const text = replyText();
    expect(text).toBe('指令格式錯誤：指定對象需使用 @Name');
    expect(reply().type).toBe('text');
    expect(seasonRepo.findByName).not.toHaveBeenCalled();
    expect(calendarRepo.updateAbsentees).not.toHaveBeenCalled();
  });

  it('rejects a non-admin trying to operate leave for someone else via a valid @Name mention', async () => {
    // Sanity check that the parseError-before-admin-gate reorder didn't break the
    // existing admin gate for a syntactically valid @mention.
    const mentionEvent = {
      replyToken: 'token',
      message: {
        text: '@Dobby 假 @Bob',
        mention: { mentionees: [{ type: 'user', userId: 'u-bob', index: 0, length: 4 }] },
      },
      source: { userId: 'user-alice' },
    };

    await handleLeave(mentionEvent, false, false);

    const text = replyText();
    expect(text).toBe('你不是管理員');
    expect(seasonRepo.findByName).not.toHaveBeenCalled();
    expect(calendarRepo.updateAbsentees).not.toHaveBeenCalled();
  });

  describe('outcome log', () => {
    function outcomeSummary(): Record<string, unknown> {
      const calls = vi.mocked(logger.info).mock.calls.filter(([, msg]) => msg === 'Leave handler outcome');
      expect(calls).toHaveLength(1);
      return calls[0]![0] as Record<string, unknown>;
    }

    function withAbsentees(absentees: string[]) {
      vi.mocked(calendarRepo.findByDate).mockResolvedValue({
        pageId: 'evt-1',
        date: '2026-05-09',
        absentees,
        guests: ['G1'],
        isPaused: false,
        courts: null,
      });
    }

    it('logs "leave-recorded" with slot numbers before/after, with actorUserId only in the debug detail', async () => {
      await handleLeave(event, false, false);

      const date = formatDate(getNextSaturday());
      expect(outcomeSummary()).toEqual({
        outcome: 'leave-recorded',
        date,
        seasonName: getSeasonNameForDate(date),
        isCancel: false,
        isAdmin: false,
        resolvedVia: 'self',
        courts: 2,
        guestCount: 0,
        totalSlotsBefore: 13,
        absenteeCountBefore: 0,
        totalSlotsAfter: 14,
        absenteeCountAfter: 1,
        presentSeasonMembersAfter: 0,
        targetDisplayName: 'Alice',
      });
      expect(logger.debug).toHaveBeenCalledWith(
        { actorUserId: 'user-alice', targetPersonPageId: 'person-1' },
        'Leave handler outcome detail',
      );
    });

    it('logs "leave-cancelled" after a successful cancel-leave write', async () => {
      withAbsentees(['person-1']);

      await handleLeave(event, true, false);

      expect(outcomeSummary()).toMatchObject({
        outcome: 'leave-cancelled',
        isCancel: true,
        totalSlotsBefore: 14,
        totalSlotsAfter: 13,
        absenteeCountBefore: 1,
        absenteeCountAfter: 0,
        guestCount: 1,
      });
    });

    it('logs "already-absent" (info, not warn) without writing', async () => {
      withAbsentees(['person-1']);

      await handleLeave(event, false, false);

      const summary = outcomeSummary();
      expect(summary).toMatchObject({ outcome: 'already-absent', absenteeCountBefore: 1, totalSlotsBefore: 14 });
      expect(summary).not.toHaveProperty('totalSlotsAfter');
      expect(summary).not.toHaveProperty('targetDisplayName');
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('logs "not-absent" when cancelling leave that was never recorded', async () => {
      await handleLeave(event, true, false);

      expect(outcomeSummary()).toMatchObject({ outcome: 'not-absent', isCancel: true, absenteeCountBefore: 0 });
    });

    it('logs "not-season-member" before fetching the event', async () => {
      vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-2', displayName: 'Bob', resolvedVia: 'mention' });

      await handleLeave(event, false, true);

      expect(calendarRepo.findByDate).not.toHaveBeenCalled();
      expect(outcomeSummary()).toMatchObject({ outcome: 'not-season-member', resolvedVia: 'mention', isAdmin: true });
    });

    it('logs "season-not-found" and "target-not-found"', async () => {
      vi.mocked(seasonRepo.findByName).mockResolvedValue(null);
      await handleLeave(event, false, false);
      expect(outcomeSummary()).toMatchObject({ outcome: 'season-not-found', resolvedVia: 'self' });

      vi.mocked(logger.info).mockClear();
      vi.mocked(resolveTarget).mockResolvedValue(null);
      await handleLeave(event, false, false);
      expect(outcomeSummary()).toMatchObject({ outcome: 'target-not-found', targetRequest: 'self' });
    });

    it('logs "parse-error" and "not-admin" before date/season are known', async () => {
      await handleLeave({ ...event, message: { text: '@Dobby 假 Charlie' } }, false, true);
      expect(outcomeSummary()).toEqual({ outcome: 'parse-error', isCancel: false, isAdmin: true });

      vi.mocked(logger.info).mockClear();
      await handleLeave(
        { ...event, message: { text: '@Dobby 假 @Bob', mention: { mentionees: [{ type: 'user', userId: 'u-bob', index: 10, length: 4 }] } } },
        false,
        false,
      );
      expect(outcomeSummary()).toEqual({ outcome: 'not-admin', isCancel: false, isAdmin: false });
    });
  });
});
