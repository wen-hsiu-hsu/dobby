import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRegistration } from '../registration-handler.js';
import * as calendarRepo from '../../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../../services/notion/season-repository.js';
import * as peopleRepo from '../../../services/notion/people-repository.js';
import * as mutex from '../../../services/mutex.js';
import { resolveTarget } from '../target-resolver.js';
import { replyMessage } from '../../../services/line/reply-service.js';
import { logger } from '../../../utils/logger.js';
import { getCurrentSeasonName } from '../../../utils/date-utils.js';

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

function replyText(): string {
  const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
  return (messages[0] as { text: string }).text;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-1', displayName: 'Alice' });
  vi.mocked(seasonRepo.findByName).mockResolvedValue(baseSeason());
  vi.mocked(calendarRepo.findByDate).mockResolvedValue(baseCalendarEvent());
  vi.mocked(peopleRepo.findByPageIds).mockImplementation(async (ids: string[]) =>
    ids.map((id) => ({
      pageId: id,
      name: id === 'person-1' ? 'Alice' : id,
      hasPaid: true,
      lineUserId: '',
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
    vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-2', displayName: 'Bob' });
    vi.mocked(seasonRepo.findByName).mockResolvedValue(baseSeason({ members: ['person-1'] }));
    const event = makeEvent('@Dobby +1');

    await handleRegistration(event, 1, false);

    expect(calendarRepo.updateGuests).toHaveBeenCalledWith('evt-1', ['Bob']);
    expect(replyText()).toContain('報名成功 ✅');
  });

  it('caps a non-admin request that exceeds remaining capacity and reports cappedAt in the headline', async () => {
    // courts(1) * 7 - members(1) + absentees(0) = 6 available slots
    vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-2', displayName: 'Bob' });
    vi.mocked(seasonRepo.findByName).mockResolvedValue(baseSeason({ members: ['person-1'], courts: 1 }));
    const event = makeEvent('@Dobby +10');

    await handleRegistration(event, 10, false);

    expect(calendarRepo.updateGuests).toHaveBeenCalledWith(
      'evt-1',
      ['Bob', 'Bob 2', 'Bob 3', 'Bob 4', 'Bob 5', 'Bob 6'],
    );
    const text = replyText();
    expect(text).toContain('報名成功 ✅（名額已達上限，僅報名 6 位，您原本要求 10 位）');
  });

  it('caps +N against the calendar 場地數 when set, and shows the same total in the reply', async () => {
    // calendar courts(1) * 7 - members(1) + absentees(0) = 6 slots;
    // the season default (2 courts) would have allowed 13 — must not be used for the gate
    vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-2', displayName: 'Bob' });
    vi.mocked(seasonRepo.findByName).mockResolvedValue(baseSeason({ members: ['person-1'], courts: 2 }));
    vi.mocked(calendarRepo.findByDate).mockResolvedValue(baseCalendarEvent({ courts: 1 }));
    const event = makeEvent('@Dobby +10');

    await handleRegistration(event, 10, false);

    expect(calendarRepo.updateGuests).toHaveBeenCalledWith(
      'evt-1',
      ['Bob', 'Bob 2', 'Bob 3', 'Bob 4', 'Bob 5', 'Bob 6'],
    );
    const text = replyText();
    expect(text).toContain('僅報名 6 位');
    expect(text).toContain('零打名額 6 人');
  });

  it('lets an admin register on behalf of another target even though target.isSelf is false', async () => {
    vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-2', displayName: 'Bob' });
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
    expect(seasonRepo.findByName).not.toHaveBeenCalled();
    expect(calendarRepo.updateGuests).not.toHaveBeenCalled();
  });

  it('replies with the target parse error for a malformed (non-@) target, without touching Notion', async () => {
    // Only reachable once the actor passes the admin gate — parseError is checked after it.
    const event = makeEvent('@Dobby +1 Charlie');

    await handleRegistration(event, 1, true);

    expect(replyText()).toBe('指令格式錯誤：指定對象需使用 @Name');
    expect(seasonRepo.findByName).not.toHaveBeenCalled();
    expect(calendarRepo.updateGuests).not.toHaveBeenCalled();
  });

  it('replies when the actor cannot be resolved to a known account, without touching Notion', async () => {
    vi.mocked(resolveTarget).mockResolvedValue(null);
    const event = makeEvent('@Dobby +1');

    await handleRegistration(event, 1, false);

    expect(replyText()).toBe('找不到您的帳號，請先向管理員登記');
    expect(calendarRepo.updateGuests).not.toHaveBeenCalled();
  });

  it('replies when the current season cannot be found, without touching the calendar', async () => {
    vi.mocked(seasonRepo.findByName).mockResolvedValue(null);
    const event = makeEvent('@Dobby +1');

    await handleRegistration(event, 1, false);

    expect(replyText()).toBe(`找不到 ${getCurrentSeasonName()} 季租資料`);
    expect(calendarRepo.findByDate).not.toHaveBeenCalled();
  });

  it('removes a guest entry on -1 and replies with the cancellation headline', async () => {
    vi.mocked(calendarRepo.findByDate).mockResolvedValue(baseCalendarEvent({ guests: ['Alice的朋友'] }));
    const event = makeEvent('@Dobby -1');

    await handleRegistration(event, -1, false);

    expect(calendarRepo.updateGuests).toHaveBeenCalledWith('evt-1', []);
    expect(replyText()).toContain('取消報名成功 ✅');
  });

  it('replies with an error and does not write when there is no matching registration to remove', async () => {
    const event = makeEvent('@Dobby -1');

    await handleRegistration(event, -1, false);

    expect(calendarRepo.updateGuests).not.toHaveBeenCalled();
    expect(replyText()).toContain('找不到 Alice 的報名紀錄');
  });

  it('logs a business summary after a successful registration write, with actorUserId only at debug level', async () => {
    const event = makeEvent('@Dobby +1');

    await handleRegistration(event, 1, false);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDisplayName: 'Alice',
        delta: 1,
        guestCountAfter: 1,
      }),
      'Registration updated',
    );
    const infoCall = vi.mocked(logger.info).mock.calls[0]![0];
    expect(infoCall).not.toHaveProperty('actorUserId');

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'user-alice', targetPersonPageId: 'person-1' }),
      'Registration updated detail',
    );
  });

  it('does not log a business summary when the operation fails validation (!result.canAdd)', async () => {
    const event = makeEvent('@Dobby -1');

    await handleRegistration(event, -1, false);

    expect(logger.info).not.toHaveBeenCalled();
  });
});
