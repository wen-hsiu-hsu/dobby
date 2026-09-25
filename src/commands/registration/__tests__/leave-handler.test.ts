import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleLeave } from '../leave-handler.js';
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

const event = {
  replyToken: 'token',
  message: { text: '@Dobby 假' },
  source: { userId: 'user-alice' },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveTarget).mockResolvedValue({ personPageId: 'person-1', displayName: 'Alice' });
  vi.mocked(seasonRepo.findByName).mockResolvedValue({
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
  });
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
      lineUserId: '',
    })),
  );
  vi.mocked(mutex.withMutex).mockImplementation(async (_pageId, fn) => fn());
});

describe('handleLeave', () => {
  it('looks up the current season by name, not just the first season record', async () => {
    await handleLeave(event, false, false);

    expect(seasonRepo.findByName).toHaveBeenCalledWith(getCurrentSeasonName());
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
