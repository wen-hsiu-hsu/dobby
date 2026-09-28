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
  pricePerPersonForSeason: null,
  pricePerPersonOverride: null,
  totalPrice: null,
  playDatePageIds: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-1', displayName: 'Alice' });
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
  vi.mocked(mutex.withMutex).mockImplementation(async (_pageId, fn) => fn());
});

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

      const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
      expect((messages[0] as { text: string }).text).toBe('請假/銷假功能僅限季租成員使用');
      expect(calendarRepo.updateAbsentees).not.toHaveBeenCalled();
    });

    it('replies with the event season name (not "僅限季租成員") when that season has not been created yet', async () => {
      vi.mocked(seasonRepo.findByName).mockResolvedValue(null);

      await handleLeave(event, false, false);

      const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
      expect((messages[0] as { text: string }).text).toBe('找不到 2026-Q4 季租資料');
      expect(calendarRepo.findByDate).not.toHaveBeenCalled();
    });
  });

  it('still replies "not found" (not the season error) when both lookups come back empty', async () => {
    vi.mocked(resolveTarget).mockResolvedValue(null);
    vi.mocked(seasonRepo.findByName).mockResolvedValue(null);

    await handleLeave(event, false, false);

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    expect((messages[0] as { text: string }).text).toBe('找不到您的資料');
  });

  it('passes the actor snapshot to resolveTarget and looks up the season without waiting for it', async () => {
    let finishResolve!: (v: { personPageId: string; displayName: string }) => void;
    vi.mocked(resolveTarget).mockReturnValue(new Promise((r) => { finishResolve = r; }));
    const actorUser = { userId: 'user-alice' } as any;

    const handling = handleLeave(event, false, false, actorUser);
    await Promise.resolve();
    expect(resolveTarget).toHaveBeenCalledWith(expect.objectContaining({ isSelf: true }), 'user-alice', actorUser);
    expect(seasonRepo.findByName).toHaveBeenCalled();

    finishResolve({ personPageId: 'person-1', displayName: 'Alice' });
    await handling;
    expect(calendarRepo.updateAbsentees).toHaveBeenCalled();
  });

  it('wraps the read-modify-write in withMutex using the event date as key', async () => {
    await handleLeave(event, false, false);

    expect(mutex.withMutex).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.any(Function));
    expect(calendarRepo.updateAbsentees).toHaveBeenCalledWith('evt-1', ['person-1']);
  });

  it('replies with the full weekly status (not a bare one-liner) after leave is recorded', async () => {
    await handleLeave(event, false, false);

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;

    expect(text).toContain('請假成功 ✅');
    expect(text).toContain('剩餘名額：');
    expect(text).toContain('請假：Alice');
    // courts(2) * 7 - members(1) + absentees(1, after leave) = 14
    expect(text).toContain('零打名額 14 人');
    expect(text).toContain('總人數：共');
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
    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;

    expect(text).toContain('銷假成功 ✅');
    expect(text).toContain('請假：無');
    // courts(2) * 7 - members(1) + absentees(0, after cancel) = 13
    expect(text).toContain('零打名額 13 人');
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

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;
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
    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;

    expect(text).toContain('Alice 已請假，無需重複操作');
    expect(text).toContain('剩餘名額：');
  });

  it('replies with full status + reason when cancelling leave without having leave recorded (no Notion write)', async () => {
    await handleLeave(event, true, false);

    expect(calendarRepo.updateAbsentees).not.toHaveBeenCalled();
    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;

    expect(text).toContain('Alice 目前未請假');
    expect(text).toContain('剩餘名額：');
  });

  it('logs a business summary after a successful leave write, with actorUserId only at debug level', async () => {
    await handleLeave(event, false, false);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDisplayName: 'Alice',
        isCancel: false,
        absenteeCountAfter: 1,
      }),
      'Leave status updated',
    );
    const infoCall = vi.mocked(logger.info).mock.calls[0]![0];
    expect(infoCall).not.toHaveProperty('actorUserId');

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'user-alice', targetPersonPageId: 'person-1' }),
      'Leave status updated detail',
    );
  });

  it('logs a business summary after a successful cancel-leave write, with isCancel: true', async () => {
    vi.mocked(calendarRepo.findByDate).mockResolvedValue({
      pageId: 'evt-1',
      date: '2026-05-09',
      absentees: ['person-1'],
      guests: [],
      isPaused: false,
      courts: null,
    });

    await handleLeave(event, true, false);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ targetDisplayName: 'Alice', isCancel: true, absenteeCountAfter: 0 }),
      'Leave status updated',
    );
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

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;
    expect(text).toBe('指令格式錯誤：指定對象需使用 @Name');
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

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;
    expect(text).toBe('你不是管理員');
    expect(seasonRepo.findByName).not.toHaveBeenCalled();
    expect(calendarRepo.updateAbsentees).not.toHaveBeenCalled();
  });

  it('does not log a business summary on the early-return branches (already on leave / not on leave)', async () => {
    vi.mocked(calendarRepo.findByDate).mockResolvedValue({
      pageId: 'evt-1',
      date: '2026-05-09',
      absentees: ['person-1'],
      guests: [],
      isPaused: false,
      courts: null,
    });

    await handleLeave(event, false, false);

    expect(logger.info).not.toHaveBeenCalled();
  });
});
