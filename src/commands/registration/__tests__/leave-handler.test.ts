import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleLeave } from '../leave-handler.js';
import * as calendarRepo from '../../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../../services/notion/season-repository.js';
import * as peopleRepo from '../../../services/notion/people-repository.js';
import * as mutex from '../../../services/mutex.js';
import { resolveTarget } from '../target-resolver.js';
import { replyMessage } from '../../../services/line/reply-service.js';
import { getCurrentSeasonName } from '../../../utils/date-utils.js';

vi.mock('../../../services/notion/calendar-repository.js');
vi.mock('../../../services/notion/season-repository.js');
vi.mock('../../../services/notion/people-repository.js');
vi.mock('../target-resolver.js');
vi.mock('../../../services/line/reply-service.js');
vi.mock('../../../services/mutex.js');

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
    await handleLeave(event, false, 'dobby', false);

    expect(seasonRepo.findByName).toHaveBeenCalledWith(getCurrentSeasonName());
    expect(seasonRepo.findAll).not.toHaveBeenCalled();
  });

  it('wraps the read-modify-write in withMutex using the event pageId as key', async () => {
    await handleLeave(event, false, 'dobby', false);

    expect(mutex.withMutex).toHaveBeenCalledWith('evt-1', expect.any(Function));
    expect(calendarRepo.updateAbsentees).toHaveBeenCalledWith('evt-1', ['person-1']);
  });

  it('replies with the full weekly status (not a bare one-liner) after leave is recorded', async () => {
    await handleLeave(event, false, 'dobby', false);

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
    });

    await handleLeave(event, true, 'dobby', false);

    expect(calendarRepo.updateAbsentees).toHaveBeenCalledWith('evt-1', []);
    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;

    expect(text).toContain('銷假成功 ✅');
    expect(text).toContain('請假：無');
    // courts(2) * 7 - members(1) + absentees(0, after cancel) = 13
    expect(text).toContain('零打名額 13 人');
  });

  it('replies with full status + reason when already on leave (no Notion write)', async () => {
    vi.mocked(calendarRepo.findByDate).mockResolvedValue({
      pageId: 'evt-1',
      date: '2026-05-09',
      absentees: ['person-1'],
      guests: [],
      isPaused: false,
    });

    await handleLeave(event, false, 'dobby', false);

    expect(calendarRepo.updateAbsentees).not.toHaveBeenCalled();
    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;

    expect(text).toContain('Alice 已請假，無需重複操作');
    expect(text).toContain('剩餘名額：');
  });

  it('replies with full status + reason when cancelling leave without having leave recorded (no Notion write)', async () => {
    await handleLeave(event, true, 'dobby', false);

    expect(calendarRepo.updateAbsentees).not.toHaveBeenCalled();
    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;

    expect(text).toContain('Alice 目前未請假');
    expect(text).toContain('剩餘名額：');
  });
});
