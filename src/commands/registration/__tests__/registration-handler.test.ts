import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleRegistration } from '../registration-handler.js';
import * as calendarRepo from '../../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../../services/notion/season-repository.js';
import * as peopleRepo from '../../../services/notion/people-repository.js';
import * as mutex from '../../../services/mutex.js';
import { resolveTarget } from '../target-resolver.js';
import { replyMessage } from '../../../services/line/reply-service.js';
import { logger } from '../../../utils/logger.js';
import { getCurrentSeasonName, getSeasonNameForDate, formatDate, getNextSaturday } from '../../../utils/date-utils.js';
import { replyText as sharedReplyText } from '../../../test-utils/index.js';

vi.mock('../../../services/notion/calendar-repository.js');
vi.mock('../../../services/notion/season-repository.js');
vi.mock('../../../services/notion/people-repository.js');
vi.mock('../target-resolver.js');
vi.mock('../../../services/line/reply-service.js');
vi.mock('../../../services/mutex.js');
vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeEvent(text: string, mentionees: any[] = []) {
  return {
    replyToken: 'token',
    message: { text, mention: { mentionees } },
    source: { userId: 'user-alice' },
  };
}

function baseSeason(overrides: Partial<Awaited<ReturnType<typeof seasonRepo.findByName>>> = {}) {
  return {
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
    ...overrides,
  } as any;
}

function baseCalendarEvent(overrides: Partial<Awaited<ReturnType<typeof calendarRepo.findByDate>>> = {}) {
  return {
    pageId: 'evt-1',
    date: '2026-05-09',
    absentees: [],
    guests: [],
    isPaused: false,
    courts: null,
    ...overrides,
  } as any;
}

function reply(): { type: string; text?: string; altText?: string } {
  const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
  return messages[0] as any;
}

// text/textV2 → .text、flex → .altText——報名結果現在多半是 Flex 卡片，不能再假設是純文字。
function replyText(): string {
  return sharedReplyText(reply() as any);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-1', displayName: 'Alice', resolvedVia: 'self' });
  vi.mocked(seasonRepo.findByName).mockResolvedValue(baseSeason());
  vi.mocked(calendarRepo.findByDate).mockResolvedValue(baseCalendarEvent());
  vi.mocked(peopleRepo.findByPageIds).mockImplementation(async (ids: string[]) =>
    ids.map((id) => ({
      pageId: id,
      name: id === 'person-1' ? 'Alice' : id,
      hasPaid: true,
    })),
  );
  vi.mocked(mutex.withMutex).mockImplementation(async (_key, fn) => fn());
});

describe('handleRegistration', () => {
  it('wraps the read-modify-write in withMutex using the event date as key, not the calendar page id', async () => {
    const event = makeEvent('@Dobby +1');

    await handleRegistration(event, 1, false);

    expect(mutex.withMutex).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.any(Function));
    expect(calendarRepo.updateGuests).toHaveBeenCalledWith('evt-1', ['Alice的朋友']);
  });

  it('registers a guest for a non-season-member (零打) self sign-up without the 的朋友 suffix', async () => {
    vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-2', displayName: 'Bob', resolvedVia: 'mention' });
    vi.mocked(seasonRepo.findByName).mockResolvedValue(baseSeason({ members: ['person-1'] }));
    const event = makeEvent('@Dobby +1');

    await handleRegistration(event, 1, false);

    expect(calendarRepo.updateGuests).toHaveBeenCalledWith('evt-1', ['Bob']);
    expect(replyText()).toContain('報名成功 ✅');
    expect(reply().type).toBe('flex');
  });

  it('caps a non-admin request that exceeds remaining capacity and reports cappedAt in the headline', async () => {
    // courts(1) * 7 - members(1) + absentees(0) = 6 available slots
    vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-2', displayName: 'Bob', resolvedVia: 'mention' });
    vi.mocked(seasonRepo.findByName).mockResolvedValue(baseSeason({ members: ['person-1'], courts: 1 }));
    const event = makeEvent('@Dobby +10');

    await handleRegistration(event, 10, false);

    expect(calendarRepo.updateGuests).toHaveBeenCalledWith(
      'evt-1',
      ['Bob', 'Bob (2)', 'Bob (3)', 'Bob (4)', 'Bob (5)', 'Bob (6)'],
    );
    const text = replyText();
    expect(text).toContain('報名成功 ✅（名額已達上限，僅報名 6 位，您原本要求 10 位）');
  });

  it('caps +N against the calendar 場地數 when set, and shows the same total in the reply', async () => {
    // calendar courts(1) * 7 - members(1) + absentees(0) = 6 slots;
    // the season default (2 courts) would have allowed 13 — must not be used for the gate
    vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-2', displayName: 'Bob', resolvedVia: 'mention' });
    vi.mocked(seasonRepo.findByName).mockResolvedValue(baseSeason({ members: ['person-1'], courts: 2 }));
    vi.mocked(calendarRepo.findByDate).mockResolvedValue(baseCalendarEvent({ courts: 1 }));
    const event = makeEvent('@Dobby +10');

    await handleRegistration(event, 10, false);

    expect(calendarRepo.updateGuests).toHaveBeenCalledWith(
      'evt-1',
      ['Bob', 'Bob (2)', 'Bob (3)', 'Bob (4)', 'Bob (5)', 'Bob (6)'],
    );
    const text = replyText();
    expect(text).toContain('僅報名 6 位');
    expect(text).toContain('零打名額 6 人');
  });

  it('lets an admin register on behalf of another target even though target.isSelf is false', async () => {
    vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-2', displayName: 'Bob', resolvedVia: 'mention' });
    const event = makeEvent('@Dobby +1 @Bob', [{ type: 'user', userId: 'u-bob', index: 0, length: 6 }]);

    await handleRegistration(event, 1, true);

    expect(replyMessage).not.toHaveBeenCalledWith('token', [{ type: 'text', text: '你不是管理員' }]);
    expect(calendarRepo.updateGuests).toHaveBeenCalled();
    expect(replyText()).toContain('報名成功 ✅');
  });

  it('rejects a non-admin trying to register someone else without touching Notion', async () => {
    const event = makeEvent('@Dobby +1 @Bob', [{ type: 'user', userId: 'u-bob', index: 0, length: 6 }]);

    await handleRegistration(event, 1, false);

    expect(replyText()).toBe('你不是管理員');
    expect(reply().type).toBe('text');
    expect(seasonRepo.findByName).not.toHaveBeenCalled();
    expect(calendarRepo.updateGuests).not.toHaveBeenCalled();
  });

  it('replies with the target parse error for a malformed (non-@) target, without touching Notion', async () => {
    const event = makeEvent('@Dobby +1 Charlie');

    await handleRegistration(event, 1, true);

    expect(replyText()).toBe('指令格式錯誤：指定對象需使用 @Name');
    expect(reply().type).toBe('text');
    expect(seasonRepo.findByName).not.toHaveBeenCalled();
    expect(calendarRepo.updateGuests).not.toHaveBeenCalled();
  });

  it('replies with the parse error (not "你不是管理員") when a non-admin sends a malformed (non-@) target', async () => {
    // parseError is checked before the admin gate: a syntax mistake is not a permission
    // problem, and a non-admin should see the same "指令格式錯誤" a would-be admin sees,
    // not a misleading permission message.
    const event = makeEvent('@Dobby +1 Charlie');

    await handleRegistration(event, 1, false);

    expect(replyText()).toBe('指令格式錯誤：指定對象需使用 @Name');
    expect(seasonRepo.findByName).not.toHaveBeenCalled();
    expect(calendarRepo.updateGuests).not.toHaveBeenCalled();
  });

  it('replies when the actor cannot be resolved to a known account, without touching Notion', async () => {
    vi.mocked(resolveTarget).mockResolvedValue(null);
    const event = makeEvent('@Dobby +1');

    await handleRegistration(event, 1, false);

    expect(replyText()).toBe('找不到您的帳號，請先向管理員登記');
    expect(reply().type).toBe('text');
    expect(calendarRepo.updateGuests).not.toHaveBeenCalled();
  });

  it('names the missing target (not "your account") when an admin registers someone who cannot be resolved', async () => {
    vi.mocked(resolveTarget).mockResolvedValue(null);

    await handleRegistration(makeEvent('@Dobby +1 @Charlie'), 1, true);

    expect(replyText()).toBe('找不到「Charlie」的資料，請確認名稱與人員清單一致');
    expect(calendarRepo.updateGuests).not.toHaveBeenCalled();
  });

  it('still replies "account not found" (not the season error) when both lookups come back empty', async () => {
    vi.mocked(resolveTarget).mockResolvedValue(null);
    vi.mocked(seasonRepo.findByName).mockResolvedValue(null);

    await handleRegistration(makeEvent('@Dobby +1'), 1, false);

    expect(replyText()).toBe('找不到您的帳號，請先向管理員登記');
  });

  it('passes the actor snapshot to resolveTarget and looks up the season without waiting for it', async () => {
    let finishResolve!: (v: NonNullable<Awaited<ReturnType<typeof resolveTarget>>>) => void;
    vi.mocked(resolveTarget).mockReturnValue(new Promise((r) => { finishResolve = r; }));
    const actorUser = { userId: 'user-alice' } as any;

    const handling = handleRegistration(makeEvent('@Dobby +1'), 1, false, actorUser);
    await Promise.resolve();
    expect(resolveTarget).toHaveBeenCalledWith(expect.objectContaining({ isSelf: true }), 'user-alice', actorUser);
    expect(seasonRepo.findByName).toHaveBeenCalled();

    finishResolve({ personPageId: 'person-1', displayName: 'Alice', resolvedVia: 'self' });
    await handling;
    expect(calendarRepo.updateGuests).toHaveBeenCalled();
  });

  it('replies when the event season cannot be found, without touching the calendar', async () => {
    vi.mocked(seasonRepo.findByName).mockResolvedValue(null);
    const event = makeEvent('@Dobby +1');

    await handleRegistration(event, 1, false);

    expect(replyText()).toBe(`找不到 ${getSeasonNameForDate(formatDate(getNextSaturday()))} 季租資料`);
    expect(calendarRepo.findByDate).not.toHaveBeenCalled();
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
      await handleRegistration(makeEvent('@Dobby +1'), 1, false);

      expect(seasonRepo.findByName).toHaveBeenCalledWith('2026-Q4');
      expect(seasonRepo.findByName).not.toHaveBeenCalledWith('2026-Q3');
      expect(calendarRepo.findByDate).toHaveBeenCalledWith('2026-10-03');
    });

    it("registers a last-season member who isn't in the event season as 零打 themself, without 的朋友", async () => {
      // 官穗妙 case: person-1 was a Q3 member but is not in Q4's members
      vi.mocked(seasonRepo.findByName).mockImplementation(async (name: string) =>
        name === '2026-Q4' ? baseSeason({ name, members: ['person-9'] }) : baseSeason({ name, members: ['person-1'] }),
      );

      await handleRegistration(makeEvent('@Dobby +1'), 1, false);

      expect(calendarRepo.updateGuests).toHaveBeenCalledWith('evt-1', ['Alice']);
    });

    it('replies with the event season name when that season has not been created yet', async () => {
      vi.mocked(seasonRepo.findByName).mockResolvedValue(null);

      await handleRegistration(makeEvent('@Dobby +1'), 1, false);

      expect(replyText()).toBe('找不到 2026-Q4 季租資料');
    });
  });

  it('removes a guest entry on -1 and replies with the cancellation headline', async () => {
    vi.mocked(calendarRepo.findByDate).mockResolvedValue(baseCalendarEvent({ guests: ['Alice的朋友'] }));
    const event = makeEvent('@Dobby -1');

    await handleRegistration(event, -1, false);

    expect(calendarRepo.updateGuests).toHaveBeenCalledWith('evt-1', []);
    expect(replyText()).toContain('取消報名成功 ✅');
    expect(reply().type).toBe('flex');
  });

  it('replies with an error and does not write when there is no matching registration to remove', async () => {
    const event = makeEvent('@Dobby -1');

    await handleRegistration(event, -1, false);

    expect(calendarRepo.updateGuests).not.toHaveBeenCalled();
    expect(replyText()).toContain('找不到 Alice 的報名紀錄');
    expect(reply().type).toBe('flex');
  });

  describe('outcome log', () => {
    function outcomeSummary(): Record<string, unknown> {
      const calls = vi.mocked(logger.info).mock.calls.filter(([, msg]) => msg === 'Registration handler outcome');
      expect(calls).toHaveLength(1);
      return calls[0]![0] as Record<string, unknown>;
    }

    function outcomeDetail(): Record<string, unknown> | undefined {
      return vi.mocked(logger.debug).mock.calls.find(([, msg]) => msg === 'Registration handler outcome detail')?.[0] as
        | Record<string, unknown>
        | undefined;
    }

    it('logs "added" after a successful write, with names/userIds and the new entries only in the debug detail', async () => {
      vi.mocked(calendarRepo.findByDate).mockResolvedValue(baseCalendarEvent({ guests: ['Bob'] }));

      await handleRegistration(makeEvent('@Dobby +2'), 2, false);

      const date = formatDate(getNextSaturday());
      expect(outcomeSummary()).toEqual({
        outcome: 'added',
        date,
        seasonName: getSeasonNameForDate(date),
        requestedDelta: 2,
        isAdmin: false,
        isSelfSeasonMember: true,
        resolvedVia: 'self',
        courts: 2,
        totalSlots: 13,
        guestCountBefore: 1,
        guestCountAfter: 3,
        cappedAt: undefined,
        targetDisplayName: 'Alice',
      });
      expect(outcomeDetail()).toEqual({
        actorUserId: 'user-alice',
        targetPersonPageId: 'person-1',
        addedGuests: ['Alice的朋友', 'Alice的朋友 (2)'],
      });
    });

    it('logs "added" with cappedAt when a non-admin request is trimmed to the remaining slots', async () => {
      // 1 court → 7 - 1 member = 6 slots; 5 taken → 1 left
      vi.mocked(calendarRepo.findByDate).mockResolvedValue(
        baseCalendarEvent({ courts: 1, guests: ['G1', 'G2', 'G3', 'G4', 'G5'] }),
      );

      await handleRegistration(makeEvent('@Dobby +3'), 3, false);

      expect(outcomeSummary()).toMatchObject({ outcome: 'added', requestedDelta: 3, cappedAt: 1, guestCountAfter: 6 });
    });

    it('logs "removed" with the removed entries only in the debug detail', async () => {
      vi.mocked(calendarRepo.findByDate).mockResolvedValue(baseCalendarEvent({ guests: ['Alice的朋友', 'Bob'] }));

      await handleRegistration(makeEvent('@Dobby -1'), -1, false);

      expect(outcomeSummary()).toMatchObject({ outcome: 'removed', requestedDelta: -1, guestCountBefore: 2, guestCountAfter: 1 });
      expect(outcomeDetail()).toMatchObject({ removedGuests: ['Alice的朋友'] });
    });

    it('logs "no-registration" (info, not warn) when there is nothing to remove', async () => {
      await handleRegistration(makeEvent('@Dobby -1'), -1, false);

      expect(outcomeSummary()).toMatchObject({ outcome: 'no-registration', requestedDelta: -1, guestCountBefore: 0 });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it.each([
      ['+0', 0, []],
      ['+0', 0, ['Alice的朋友']],
      // parseInt('-0') is -0, which must also count as zero
      ['-0', -0, []],
      ['-0', -0, ['Alice的朋友']],
    ])('logs "zero-delta" for %s with guests %j (it goes down the removal path, not a rejected registration)', async (text, delta, guests) => {
      vi.mocked(calendarRepo.findByDate).mockResolvedValue(baseCalendarEvent({ guests }));

      await handleRegistration(makeEvent(`@Dobby ${text}`), delta, false);

      expect(calendarRepo.updateGuests).not.toHaveBeenCalled();
      expect(outcomeSummary()).toMatchObject({ outcome: 'zero-delta' });
    });

    it('logs "full" with the capacity numbers when no slot is left', async () => {
      vi.mocked(calendarRepo.findByDate).mockResolvedValue(baseCalendarEvent({ courts: 0 }));

      await handleRegistration(makeEvent('@Dobby +1'), 1, false);

      expect(outcomeSummary()).toMatchObject({ outcome: 'full', courts: 0, totalSlots: -1, guestCountBefore: 0 });
    });

    it('logs "paused" when the event is paused, even for an admin', async () => {
      vi.mocked(calendarRepo.findByDate).mockResolvedValue(baseCalendarEvent({ isPaused: true }));

      await handleRegistration(makeEvent('@Dobby +1'), 1, true);

      expect(outcomeSummary()).toMatchObject({ outcome: 'paused', isAdmin: true });
    });

    it('logs isSelfSeasonMember false when the target has no People page', async () => {
      vi.mocked(resolveTarget).mockResolvedValue({ personPageId: '', displayName: 'alice-line', resolvedVia: 'self' });

      await handleRegistration(makeEvent('@Dobby +1'), 1, false);

      expect(outcomeSummary()).toMatchObject({ outcome: 'added', isSelfSeasonMember: false });
    });

    it('logs "parse-error" and "not-admin" before date/season are known', async () => {
      await handleRegistration(makeEvent('@Dobby +1 Bob'), 1, true);
      expect(outcomeSummary()).toEqual({ outcome: 'parse-error', requestedDelta: 1, isAdmin: true });

      vi.mocked(logger.info).mockClear();
      await handleRegistration(makeEvent('@Dobby @Bob +1', [{ type: 'user', userId: 'u-bob', index: 7, length: 4 }]), 1, false);
      expect(outcomeSummary()).toEqual({ outcome: 'not-admin', requestedDelta: 1, isAdmin: false });
    });

    it('logs "target-not-found" with what was asked for, keeping the typed name and userId in the debug detail', async () => {
      vi.mocked(resolveTarget).mockResolvedValue(null);

      await handleRegistration(makeEvent('@Dobby @Bob +1', [{ type: 'user', userId: 'u-bob', index: 7, length: 4 }]), 1, true);

      const summary = outcomeSummary();
      expect(summary).toMatchObject({ outcome: 'target-not-found', targetRequest: 'mention', requestedDelta: 1 });
      expect(summary).not.toHaveProperty('targetName');
      expect(outcomeDetail()).toEqual({ actorUserId: 'user-alice', targetUserId: 'u-bob', targetName: 'Bob' });
    });

    it('logs "season-not-found" with the season it looked for', async () => {
      vi.mocked(seasonRepo.findByName).mockResolvedValue(null);

      await handleRegistration(makeEvent('@Dobby +1'), 1, false);

      const date = formatDate(getNextSaturday());
      expect(outcomeSummary()).toMatchObject({ outcome: 'season-not-found', seasonName: getSeasonNameForDate(date), resolvedVia: 'self' });
    });
  });
});
