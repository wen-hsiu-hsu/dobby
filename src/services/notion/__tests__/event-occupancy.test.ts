import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEventOccupancy } from '../event-occupancy.js';
import * as calendarRepo from '../calendar-repository.js';
import * as seasonRepo from '../season-repository.js';
import { getCurrentSeasonName } from '../../../utils/date-utils.js';

vi.mock('../calendar-repository.js');
vi.mock('../season-repository.js');

const event = {
  pageId: 'evt-1',
  date: '2026-05-09',
  absentees: ['p-absent'],
  guests: ['Guest 1'],
  isPaused: false,
};

const season = {
  pageId: 'season-1',
  name: getCurrentSeasonName(),
  members: ['p1', 'p2', 'p3'],
  courts: 2,
  guestFee: 200,
  location: '',
  weekCounts: 0,
  pricePerPersonForSeason: null,
  pricePerPersonOverride: null,
  totalPrice: null,
  playDatePageIds: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(calendarRepo.findByDate).mockResolvedValue(event);
  vi.mocked(seasonRepo.findByName).mockResolvedValue(season);
});

describe('getEventOccupancy', () => {
  it('looks up the current season by name, not the first record', async () => {
    await getEventOccupancy('2026-05-09');

    expect(seasonRepo.findByName).toHaveBeenCalledWith(getCurrentSeasonName());
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

  it('applies courtsOverride to slots but not attendance', async () => {
    const occupancy = await getEventOccupancy('2026-05-09', 5);

    // totalSlots = 5*7 - 3 + 1 = 33
    expect(occupancy?.totalSlots).toBe(33);
    expect(occupancy?.remainingSlots).toBe(32);
    // attendance unaffected by court count
    expect(occupancy?.presentSeasonMembers).toBe(2);
    expect(occupancy?.totalPeople).toBe(3);
  });
});
