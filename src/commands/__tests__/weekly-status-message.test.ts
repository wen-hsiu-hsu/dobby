import { describe, it, expect, vi } from 'vitest';
import { buildWeeklyStatusMessage } from '../weekly-status-message.js';
import * as peopleRepo from '../../services/notion/people-repository.js';
import type { EventOccupancy } from '../../services/notion/event-occupancy.js';
import type { CalendarEvent, SeasonRecord, PersonRecord } from '../../types/notion-models.js';

vi.mock('../../services/notion/people-repository.js');

const findByPageIdsMock = vi.mocked(peopleRepo.findByPageIds);

function makeCalendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    pageId: 'cal-1',
    date: '2026-09-26',
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
    pricePerPersonForSeason: 1000,
    pricePerPersonOverride: null,
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
    lineUserId: 'line-1',
    ...overrides,
  };
}

function makeOccupancy(overrides: Partial<EventOccupancy> = {}): EventOccupancy {
  const event = overrides.event ?? makeCalendarEvent();
  const season = overrides.season ?? makeSeasonRecord();
  return {
    event,
    season,
    courts: season.courts,
    totalSlots: 4,
    remainingSlots: 4,
    totalPeople: 0,
    presentSeasonMembers: 0,
    ...overrides,
  };
}

describe('buildWeeklyStatusMessage', () => {
  it('renders the unified paused-week format', async () => {
    const occupancy = makeOccupancy({ event: makeCalendarEvent({ isPaused: true }) });

    const text = await buildWeeklyStatusMessage(occupancy, '2026-09-26');

    expect(text).toBe(['2026-09-26 不能到請喊聲', '⛔ 本週活動暫停'].join('\n'));
    expect(findByPageIdsMock).not.toHaveBeenCalled();
  });

  it('renders a normal week with guests filling some slots and empty lines for the rest', async () => {
    const occupancy = makeOccupancy({
      event: makeCalendarEvent({ guests: ['小明', '小華'] }),
      season: makeSeasonRecord({ guestFee: 200 }),
      totalSlots: 4,
      presentSeasonMembers: 3,
    });

    const text = await buildWeeklyStatusMessage(occupancy, '2026-09-26');

    expect(text).toContain('2026-09-26 不能到請喊聲');
    expect(text).toContain('零打名額：4人 $200/人');
    expect(text).toContain('1. 小明');
    expect(text).toContain('2. 小華');
    expect(text).toContain('3. ');
    expect(text).toContain('4. ');
    expect(text).toContain('請假：無');
    expect(text).toContain('場地：2 面');
    expect(text).toContain('應到：3 人');
    expect(findByPageIdsMock).not.toHaveBeenCalled();
  });

  it('resolves absentee names via peopleRepo.findByPageIds and joins with 、', async () => {
    findByPageIdsMock.mockResolvedValue([makePerson({ name: '小美' }), makePerson({ name: '小強' })]);
    const occupancy = makeOccupancy({
      event: makeCalendarEvent({ absentees: ['p-a', 'p-b'] }),
    });

    const text = await buildWeeklyStatusMessage(occupancy, '2026-09-26');

    expect(findByPageIdsMock).toHaveBeenCalledWith(['p-a', 'p-b']);
    expect(text).toContain('請假：小美、小強');
  });

  it('shows more guest lines than totalSlots when guests exceed capacity', async () => {
    const occupancy = makeOccupancy({
      event: makeCalendarEvent({ guests: ['A', 'B', 'C'] }),
      totalSlots: 2,
    });

    const text = await buildWeeklyStatusMessage(occupancy, '2026-09-26');

    expect(text).toContain('1. A');
    expect(text).toContain('2. B');
    expect(text).toContain('3. C');
  });

  it('shows the court count without a hint when it matches the season default', async () => {
    const occupancy = makeOccupancy({
      season: makeSeasonRecord({ courts: 5 }),
      courts: 5,
      totalSlots: 33,
      presentSeasonMembers: 2,
    });

    const text = await buildWeeklyStatusMessage(occupancy, '2026-09-26');

    expect(text.split('\n')).toContain('場地：5 面');
    expect(text).not.toContain('本週調整');
  });

  it('shows occupancy.courts with a 本週調整 hint when the calendar overrides the season default', async () => {
    const occupancy = makeOccupancy({
      event: makeCalendarEvent({ courts: 1 }),
      season: makeSeasonRecord({ courts: 2 }),
      courts: 1,
      totalSlots: 5,
    });

    const text = await buildWeeklyStatusMessage(occupancy, '2026-09-26');

    expect(text.split('\n')).toContain('場地：1 面（本週調整）');
  });
});
