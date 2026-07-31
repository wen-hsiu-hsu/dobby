import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleLeave } from '../leave-handler.js';
import * as calendarRepo from '../../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../../services/notion/season-repository.js';
import * as mutex from '../../../services/mutex.js';
import { resolveTarget } from '../target-resolver.js';
import { replyMessage } from '../../../services/line/reply-service.js';
import { getCurrentSeasonName } from '../../../utils/date-utils.js';

vi.mock('../../../services/notion/calendar-repository.js');
vi.mock('../../../services/notion/season-repository.js');
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
  });
  vi.mocked(calendarRepo.findByDate).mockResolvedValue({
    pageId: 'evt-1',
    date: '2026-05-09',
    absentees: [],
    guests: [],
    isPaused: false,
  });
  vi.mocked(mutex.withMutex).mockImplementation(async (_pageId, fn) => fn());
});

describe('handleLeave', () => {
  it('looks up the current season by name, not just the first season record', async () => {
    await handleLeave(event, false, 'dobby');

    expect(seasonRepo.findByName).toHaveBeenCalledWith(getCurrentSeasonName());
    expect(seasonRepo.findAll).not.toHaveBeenCalled();
  });

  it('wraps the read-modify-write in withMutex using the event pageId as key', async () => {
    await handleLeave(event, false, 'dobby');

    expect(mutex.withMutex).toHaveBeenCalledWith('evt-1', expect.any(Function));
    expect(calendarRepo.updateAbsentees).toHaveBeenCalledWith('evt-1', ['person-1']);
  });

  it('replies success after leave is recorded', async () => {
    await handleLeave(event, false, 'dobby');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '請假成功！Alice' }], 'dobby');
  });
});
