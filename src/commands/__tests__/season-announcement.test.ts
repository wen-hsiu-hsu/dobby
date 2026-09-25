import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSeasonAnnouncement } from '../season-announcement.js';
import * as announcementRepo from '../../services/notion/announcement-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import * as peopleRepo from '../../services/notion/people-repository.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as usersRepo from '../../services/notion/users-repository.js';
import { replyMessage } from '../../services/line/reply-service.js';
import type { SeasonRecord } from '../../types/notion-models.js';

vi.mock('../../services/notion/announcement-repository.js');
vi.mock('../../services/notion/season-repository.js');
vi.mock('../../services/notion/people-repository.js');
vi.mock('../../services/notion/calendar-repository.js');
vi.mock('../../services/notion/users-repository.js');
vi.mock('../../services/line/reply-service.js');

const DIVIDER = '————————';

function paragraphBlock(text: string) {
  return { type: 'paragraph', paragraph: { rich_text: [{ plain_text: text }] } };
}

function bulletedListItemBlock(text: string) {
  return { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: text }] } };
}

function makeSeason(overrides: Partial<SeasonRecord>): SeasonRecord {
  return {
    pageId: 'season-page',
    name: '2026-Q2',
    members: [],
    courts: 2,
    guestFee: 170,
    location: '中華科大',
    weekCounts: 13,
    courtPricePerHour: 450,
    pricePerPersonForSeason: null,
    pricePerPersonOverride: null,
    totalPrice: 23400,
    playDatePageIds: [],
    ...overrides,
  };
}

const CURRENT_SEASON = makeSeason({ pageId: 'season-q2', name: '2026-Q2', members: ['person-1', 'person-2', 'person-3'], playDatePageIds: ['cal-1'] });
const PREVIOUS_SEASON = makeSeason({ pageId: 'season-q1', name: '2026-Q1', members: ['person-1', 'person-2', 'person-4'] });

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(announcementRepo.findByName).mockImplementation(async (name: string) => {
    if (name === 'NEW_SEASON') return { pageId: 'ann-template', name: 'NEW_SEASON' };
    if (name === 'PAYMENT') return { pageId: 'ann-payment', name: 'PAYMENT' };
    return null;
  });

  vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) => {
    if (pageId === 'ann-payment') {
      return [bulletedListItemBlock('永豐 (807) 20201800934932'), bulletedListItemBlock('Line 轉帳')] as any;
    }
    return [
      paragraphBlock('{SEASON_TITLE} 報名 {TOTAL_PEOPLE} 人'),
      paragraphBlock('{ALL_MEMBERS_MENTIONS}'),
      paragraphBlock('共 {WEEK_COUNTS} 次'),
      paragraphBlock('零打 ${GUEST_FEE}'),
      paragraphBlock('付款：{PAYMENT_INFO}'),
      paragraphBlock('場租 ${COURT_PRICE} * {COURT_COUNT} = ${TOTAL_PRICE}'),
      paragraphBlock('{PLAY_DATES}'),
      paragraphBlock(DIVIDER),
      paragraphBlock('{SEASON_SHORT} 場地 {COURT_COUNT} 個場 零打名額 {GUEST_SLOTS_BASELINE}'),
      paragraphBlock(DIVIDER),
      paragraphBlock('續打：{CONTINUING_MEMBERS_MENTIONS}'),
      paragraphBlock('新朋友：{NEW_MEMBERS_MENTIONS}'),
      paragraphBlock('退費：{REFUND_MEMBERS_MENTIONS}'),
      paragraphBlock('零打金額 ${GUEST_FEE}'),
      paragraphBlock('Q{PREV_QUARTER} 結餘 $xxx'),
    ] as any;
  });

  vi.mocked(seasonRepo.findByName).mockImplementation(async (name: string) => {
    if (name === '2026-Q2') return CURRENT_SEASON;
    if (name === '2026-Q1') return PREVIOUS_SEASON;
    return null;
  });

  vi.mocked(calendarRepo.findByPageIds).mockResolvedValue([
    { pageId: 'cal-1', date: '2026-04-04T20:00:00.000+08:00', absentees: [], guests: [], isPaused: false, courts: null },
  ]);

  vi.mocked(usersRepo.findAll).mockResolvedValue([
    { pageId: 'user-1', userId: 'u1', customName: 'Alice', registeredPersonPageId: 'person-1', isAdmin: false, messageCount: 0, groups: [], multiChats: [] },
    { pageId: 'user-2', userId: 'u2', customName: 'Bob', registeredPersonPageId: 'person-2', isAdmin: false, messageCount: 0, groups: [], multiChats: [] },
    { pageId: 'user-3', userId: 'u3', customName: 'Carol', registeredPersonPageId: 'person-3', isAdmin: false, messageCount: 0, groups: [], multiChats: [] },
    // person-4 (refunded, previous-season-only) has no USERS record — must fall back to People List name.
  ]);

  vi.mocked(peopleRepo.findByPageIds).mockImplementation(async (ids: string[]) =>
    ids.map((id) => ({ pageId: id, name: id === 'person-4' ? '大衛' : id, hasPaid: true })),
  );
});

describe('handleSeasonAnnouncement', () => {
  it('rejects non-admins without touching Notion', async () => {
    await handleSeasonAnnouncement('token', false, '2026Q2');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '此指令僅限管理員使用' }]);
    expect(announcementRepo.findByName).not.toHaveBeenCalled();
  });

  it('rejects a malformed season code', async () => {
    await handleSeasonAnnouncement('token', true, 'not-a-season');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    expect((messages[0] as { text: string }).text).toContain('無法辨識季度');
    expect(announcementRepo.findByName).not.toHaveBeenCalled();
  });

  it('accepts season codes without a hyphen and with a lowercase q', async () => {
    await handleSeasonAnnouncement('token', true, '2026q2');

    expect(seasonRepo.findByName).toHaveBeenCalledWith('2026-Q2');
  });

  it('replies with an error when the NEW_SEASON template is missing', async () => {
    vi.mocked(announcementRepo.findByName).mockImplementation(async (name: string) => (name === 'PAYMENT' ? { pageId: 'ann-payment', name: 'PAYMENT' } : null));

    await handleSeasonAnnouncement('token', true, '2026Q2');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '找不到 NEW_SEASON 公告模板' }]);
  });

  it('replies with an error when the target season does not exist', async () => {
    vi.mocked(seasonRepo.findByName).mockResolvedValue(null);

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    expect((messages[0] as { text: string }).text).toContain('找不到 2026-Q2 季租資料');
  });

  it('replies with an error when the previous season does not exist, naming it explicitly', async () => {
    vi.mocked(seasonRepo.findByName).mockImplementation(async (name: string) => (name === '2026-Q2' ? CURRENT_SEASON : null));

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    expect((messages[0] as { text: string }).text).toContain('找不到上一季 2026-Q1 的季租資料');
  });

  it('replies with an error when the PAYMENT announcement is missing', async () => {
    vi.mocked(announcementRepo.findByName).mockImplementation(async (name: string) => (name === 'NEW_SEASON' ? { pageId: 'ann-template', name: 'NEW_SEASON' } : null));

    await handleSeasonAnnouncement('token', true, '2026Q2');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '找不到 PAYMENT 公告內容' }]);
  });

  it('wraps across a year boundary when looking up the previous season', async () => {
    const q1_2027 = makeSeason({ pageId: 'season-q1-2027', name: '2027-Q1', members: ['person-1'] });
    const q4_2026 = makeSeason({ pageId: 'season-q4-2026', name: '2026-Q4', members: ['person-1'] });
    vi.mocked(seasonRepo.findByName).mockImplementation(async (name: string) => {
      if (name === '2027-Q1') return q1_2027;
      if (name === '2026-Q4') return q4_2026;
      return null;
    });

    await handleSeasonAnnouncement('token', true, '2027Q1');

    expect(seasonRepo.findByName).toHaveBeenCalledWith('2026-Q4');
  });

  it('splits the reply into one LINE message per announcement block, and fills in every placeholder', async () => {
    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    expect(messages).toHaveLength(3);

    const [first, second, third] = messages.map((m) => (m as { text: string }).text);

    expect(first).toContain('2026 Q2 (4~6月) 報名 3 人');
    expect(first).toContain('@Alice @Bob @Carol');
    expect(first).toContain('共 13 次');
    expect(first).toContain('零打 $170');
    expect(first).toContain('付款：• 永豐 (807) 20201800934932\n• Line 轉帳');
    expect(first).toContain('場租 $450 * 2 = $23400');
    expect(first).toContain('4/04');

    // courts(2) * 7 - members(3) = 11
    expect(second).toContain('2026 Q2 場地 2 個場 零打名額 11');

    expect(third).toContain('續打：@Alice @Bob');
    expect(third).toContain('新朋友：@Carol');
    // person-4 has no USERS record — falls back to the People List name.
    expect(third).toContain('退費：@大衛');
    expect(third).toContain('零打金額 $170');
    expect(third).toContain('Q1 結餘 $xxx');
  });

  it('replies with an error instead of silently dropping the message when the template splits into more than 5 parts', async () => {
    // LINE reply allows at most 5 messages per call — 6 dividers means 7 segments.
    vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) => {
      if (pageId === 'ann-payment') return [bulletedListItemBlock('永豐')] as any;
      return Array.from({ length: 7 }, (_, i) => paragraphBlock(`段落 ${i}`))
        .flatMap((block, i) => (i === 0 ? [block] : [paragraphBlock(DIVIDER), block])) as any;
    });

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    expect(messages).toHaveLength(1);
    expect((messages[0] as { text: string }).text).toContain('超過 LINE 單次回覆上限');
  });
});
