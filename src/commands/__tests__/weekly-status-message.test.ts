import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildWeeklyStatusReply } from '../weekly-status-message.js';
import { cardHeroSummary } from '../registration/__tests__/card-nav.js';
import { FLEX_ASSET_ROOT, FLEX_ICONS } from '../../config/flex-assets.js';
import * as peopleRepo from '../../services/notion/people-repository.js';
import type { EventOccupancy } from '../../services/notion/event-occupancy.js';
import type { CalendarEvent, SeasonRecord, PersonRecord } from '../../types/notion-models.js';

vi.mock('../../services/notion/people-repository.js');

const findAbsenteesMock = vi.mocked(peopleRepo.findAbsenteesOfEvent);

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
    courtPricePerHour: 450,
    actualFeePerPerson: null,
    refundPerPerson: null,
    balance: null,
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

describe('buildWeeklyStatusReply', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    findAbsenteesMock.mockResolvedValue([]);
  });

  it('回傳 flex 訊息，用跟報名卡片同一個 buildStatusCardBubble 組裝（正常週）', async () => {
    const occupancy = makeOccupancy({
      event: makeCalendarEvent({ guests: ['小明', '小華'] }),
      season: makeSeasonRecord({ guestFee: 200 }),
      totalSlots: 4,
      presentSeasonMembers: 3,
    });

    const reply = await buildWeeklyStatusReply(occupancy, '2026-09-26');

    expect(reply.type).toBe('flex');
    const summary = cardHeroSummary(reply.contents as any);
    expect(summary.badgeColor).toBe('#737373');
    expect(summary.badgeIconUrl).toBe(`${FLEX_ASSET_ROOT}${FLEX_ICONS.calendarCheckDark}`);
    expect(summary.title).toBe('本週打球');
    expect(summary.subtitle).toBe('不能到請喊聲');
  });

  it('本週場地數跟季預設不同時，副標題與 altText 都加註「本週調整」', async () => {
    const occupancy = makeOccupancy({
      event: makeCalendarEvent({ courts: 1 }),
      season: makeSeasonRecord({ courts: 2 }),
      courts: 1,
      totalSlots: 5,
    });

    const reply = await buildWeeklyStatusReply(occupancy, '2026-09-26');

    const summary = cardHeroSummary(reply.contents as any);
    expect(summary.subtitle).toBe('不能到請喊聲・本週 1 面場');
    expect(reply.altText).toContain('場地：1 面（本週調整）');
  });

  it('場地數跟季預設相同時，副標題不加註，altText 的場地行沒有「本週調整」', async () => {
    const occupancy = makeOccupancy({
      season: makeSeasonRecord({ courts: 5 }),
      courts: 5,
      totalSlots: 33,
      presentSeasonMembers: 2,
    });

    const reply = await buildWeeklyStatusReply(occupancy, '2026-09-26');

    const summary = cardHeroSummary(reply.contents as any);
    expect(summary.subtitle).toBe('不能到請喊聲');
    // 「場地：N 面」每週都印（跟舊文字版一樣），只有跟季預設不同時才加註
    expect(reply.altText).toContain('場地：5 面');
    expect(reply.altText).not.toContain('本週調整');
  });

  it('零打名單用完整 event.guests，包含空位合併行（跟報名卡片同格式），沒有「新增」標記', async () => {
    const occupancy = makeOccupancy({
      event: makeCalendarEvent({ guests: ['A', 'B'] }),
      totalSlots: 4,
    });

    const reply = await buildWeeklyStatusReply(occupancy, '2026-09-26');

    const body = (reply.contents as any).body.contents[0].contents;
    // head row + 2 guest rows + 1 merged empty row（totalSlots=4, filled=2）
    expect(body).toHaveLength(4);
    for (const row of body) {
      expect(row.backgroundColor).not.toBe('#26331A'); // 沒有「新增」底色
    }
  });

  it('本週出席＝季租出席（presentSeasonMembers）＋零打數，跟報名卡片一致', async () => {
    const occupancy = makeOccupancy({
      event: makeCalendarEvent({ guests: ['A', 'B'] }),
      presentSeasonMembers: 8,
      totalSlots: 4,
    });

    const reply = await buildWeeklyStatusReply(occupancy, '2026-09-26');

    const presentRow = (reply.contents as any).body.contents[4];
    const spans = presentRow.contents[1].contents;
    expect(spans[0]).toMatchObject({ text: '10' });
    expect(spans[1]).toMatchObject({ text: ' 人（季租 8・零打 2）' });
  });

  it('請假名單完整列出（不截斷），透過 peopleRepo.findAbsenteesOfEvent 查姓名', async () => {
    findAbsenteesMock.mockResolvedValue([makePerson({ name: '小美' }), makePerson({ name: '小強' })]);
    const occupancy = makeOccupancy({
      event: makeCalendarEvent({ absentees: ['p-a', 'p-b'] }),
    });

    const reply = await buildWeeklyStatusReply(occupancy, '2026-09-26');

    expect(findAbsenteesMock).toHaveBeenCalledWith(occupancy.event);
    const leaveSection = (reply.contents as any).body.contents[2];
    expect(leaveSection.contents[1].text).toBe('小美、小強');
    expect(leaveSection.contents[1].maxLines).toBeUndefined();
  });

  it('底部保留三顆按鈕（+1 零打／−1 零打／請假），跟報名卡片相同', async () => {
    const occupancy = makeOccupancy();

    const reply = await buildWeeklyStatusReply(occupancy, '2026-09-26');

    const footer = (reply.contents as any).footer.contents;
    expect(footer.map((b: any) => b.action.text)).toEqual(['@Dobby +1', '@Dobby -1', '@Dobby 假']);
  });

  it('altText 用「本週打球・不能到請喊聲」開頭，包含日期、零打名額、請假、總人數', async () => {
    const occupancy = makeOccupancy({
      event: makeCalendarEvent({ guests: ['小明'] }),
      season: makeSeasonRecord({ guestFee: 200 }),
      totalSlots: 4,
      presentSeasonMembers: 3,
    });

    const reply = await buildWeeklyStatusReply(occupancy, '2026-09-26');

    expect(reply.altText).toContain('本週打球・不能到請喊聲');
    expect(reply.altText).toContain('2026-09-26');
    expect(reply.altText).toContain('零打名額 4 人 | $200/人');
    expect(reply.altText).toContain('請假：無');
    expect(reply.altText).toContain('總人數：共 4 人');
  });

  describe('暫停週', () => {
    it('保留標題區（照片、日期與費用行、徽章灰底＋ban-dark、標題「本週活動暫停」）', async () => {
      const occupancy = makeOccupancy({ event: makeCalendarEvent({ isPaused: true }), season: makeSeasonRecord({ guestFee: 170 }) });

      const reply = await buildWeeklyStatusReply(occupancy, '2026-09-26');

      const contents = reply.contents as any;
      const dateText = contents.hero.contents[1].contents[0];
      expect(dateText.text).toContain('零打 $170/人');
      const titleRow = contents.hero.contents[1].contents[1].contents[0];
      const badge = titleRow.contents[0];
      expect(badge.backgroundColor).toBe('#737373');
      expect(badge.contents[0].url).toBe(`${FLEX_ASSET_ROOT}${FLEX_ICONS.banDark}`);
      expect(titleRow.contents[1]).toMatchObject({ text: '本週活動暫停' });
    });

    it('拿掉右上剩餘名額／進度條、零打名單／請假／本週出席三段、底部按鈕', async () => {
      const occupancy = makeOccupancy({ event: makeCalendarEvent({ isPaused: true }) });

      const reply = await buildWeeklyStatusReply(occupancy, '2026-09-26');

      const contents = reply.contents as any;
      const titleRow = contents.hero.contents[1].contents[1].contents[0];
      expect(titleRow.contents).toHaveLength(2); // 沒有「剩 N 位／已額滿」
      expect(contents.hero.contents[1].contents[1].contents).toHaveLength(1); // 沒有副標題、沒有進度條
      expect(contents.body.contents).toHaveLength(1); // 沒有三段內文
      expect(contents.footer).toBeUndefined();
      expect(findAbsenteesMock).not.toHaveBeenCalled();
    });

    it('內文改放一行灰字「本週因故暫停，恢復後另行公告」', async () => {
      const occupancy = makeOccupancy({ event: makeCalendarEvent({ isPaused: true }) });

      const reply = await buildWeeklyStatusReply(occupancy, '2026-09-26');

      const note = (reply.contents as any).body.contents[0];
      expect(note).toMatchObject({ type: 'text', text: '本週因故暫停，恢復後另行公告' });
    });

    it('altText 至少含日期與「本週活動暫停」', async () => {
      const occupancy = makeOccupancy({ event: makeCalendarEvent({ isPaused: true }) });

      const reply = await buildWeeklyStatusReply(occupancy, '2026-09-26');

      expect(reply.altText).toContain('2026-09-26');
      expect(reply.altText).toContain('本週活動暫停');
    });
  });
});
