import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEventOccupancy } from '../event-occupancy.js';
import * as calendarRepo from '../calendar-repository.js';
import * as seasonRepo from '../season-repository.js';
import { logger } from '../../../utils/logger.js';

vi.mock('../calendar-repository.js');
vi.mock('../season-repository.js');
vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const event = {
  pageId: 'evt-1',
  date: '2026-05-09',
  absentees: ['p-absent'],
  guests: ['Guest 1'],
  isPaused: false,
  courts: null,
};

const season = {
  pageId: 'season-1',
  name: '2026-Q2',
  members: ['p1', 'p2', 'p3'],
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
  vi.mocked(calendarRepo.findByDate).mockResolvedValue(event);
  vi.mocked(seasonRepo.findByName).mockResolvedValue(season);
});

describe('getEventOccupancy', () => {
  it("looks up the event date's season by name, not the first record", async () => {
    await getEventOccupancy('2026-05-09');

    expect(seasonRepo.findByName).toHaveBeenCalledWith('2026-Q2');
  });

  it("uses the event date's season, not today's, when the date is already in the next quarter", async () => {
    // 季末最後一週查下週六（已跨到下一季），不能拿今天所在的季度去算名額
    await getEventOccupancy('2026-10-03');

    expect(seasonRepo.findByName).toHaveBeenCalledWith('2026-Q4');
  });

  it('computes slots and attendance from event + season', async () => {
    const occupancy = await getEventOccupancy('2026-05-09');

    // totalSlots = courts*7 - members + absentees = 2*7 - 3 + 1 = 12
    expect(occupancy?.totalSlots).toBe(12);
    // remainingSlots = totalSlots - guests.length = 12 - 1 = 11
    expect(occupancy?.remainingSlots).toBe(11);
    // presentSeasonMembers = members - absentees = 3 - 1 = 2
    expect(occupancy?.presentSeasonMembers).toBe(2);
    // totalPeople = presentSeasonMembers + guests.length = 2 + 1 = 3
    expect(occupancy?.totalPeople).toBe(3);
  });

  it('returns null when the event does not exist', async () => {
    vi.mocked(calendarRepo.findByDate).mockResolvedValue(null);

    expect(await getEventOccupancy('2026-05-09')).toBeNull();
  });

  it('returns null when the current season is not found', async () => {
    vi.mocked(seasonRepo.findByName).mockResolvedValue(null);

    expect(await getEventOccupancy('2026-05-09')).toBeNull();
  });

  it('logs which lookup came back empty at info level, so callers that only see null can be told apart', async () => {
    vi.mocked(seasonRepo.findByName).mockResolvedValue(null);

    await getEventOccupancy('2026-05-09');

    expect(logger.info).toHaveBeenCalledWith(
      { date: '2026-05-09', hasEvent: true, hasSeason: false },
      'Event occupancy unavailable: no event or season for date'
    );
    // warn 會讓報名「找不到活動」、next 事件在 /logs 被標成「警告」
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not log the unavailable line when both event and season exist', async () => {
    await getEventOccupancy('2026-05-09');

    expect(logger.info).not.toHaveBeenCalled();
  });

  it('reuses a caller-provided season instead of re-querying Notion', async () => {
    const occupancy = await getEventOccupancy('2026-05-09', season);

    expect(seasonRepo.findByName).not.toHaveBeenCalled();
    expect(occupancy?.season).toBe(season);
  });

  it('returns null when a caller-provided season is null, without querying Notion', async () => {
    expect(await getEventOccupancy('2026-05-09', null)).toBeNull();
    expect(seasonRepo.findByName).not.toHaveBeenCalled();
  });

  it('falls back to the season court count when the calendar 場地數 is unset', async () => {
    const occupancy = await getEventOccupancy('2026-05-09');

    expect(occupancy?.courts).toBe(2);
  });

  it('uses the calendar 場地數 over the season default for slots, but not attendance', async () => {
    vi.mocked(calendarRepo.findByDate).mockResolvedValue({ ...event, courts: 5 });

    const occupancy = await getEventOccupancy('2026-05-09');

    expect(occupancy?.courts).toBe(5);
    // totalSlots = 5*7 - 3 + 1 = 33
    expect(occupancy?.totalSlots).toBe(33);
    expect(occupancy?.remainingSlots).toBe(32);
    // attendance unaffected by court count
    expect(occupancy?.presentSeasonMembers).toBe(2);
    expect(occupancy?.totalPeople).toBe(3);
    // season record itself is left untouched — the default stays visible to callers
    expect(occupancy?.season.courts).toBe(2);
  });
});
