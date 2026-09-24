import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleNews } from '../news.js';
import * as announcementRepo from '../../services/notion/announcement-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import * as peopleRepo from '../../services/notion/people-repository.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import { replyMessage } from '../../services/line/reply-service.js';

vi.mock('../../services/notion/announcement-repository.js');
vi.mock('../../services/notion/season-repository.js');
vi.mock('../../services/notion/people-repository.js');
vi.mock('../../services/notion/calendar-repository.js');
vi.mock('../../services/line/reply-service.js');

function paragraphBlock(text: string) {
  return { type: 'paragraph', paragraph: { rich_text: [{ plain_text: text }] } };
}

function bulletedListItemBlock(text: string) {
  return { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: text }] } };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(announcementRepo.findByName).mockResolvedValue({ pageId: 'ann-1', name: 'NEWS_TEMPLATE' });
  vi.mocked(seasonRepo.findByName).mockResolvedValue({
    pageId: 'season-1',
    name: '2026-Q3',
    members: ['person-1', 'person-2'],
    courts: 2,
    guestFee: 170,
    location: '中華科大',
    weekCounts: 13,
    pricePerPersonForSeason: 2127.2727272727273,
    pricePerPersonOverride: null,
    totalPrice: 23400,
    playDatePageIds: ['cal-2', 'cal-1'],
  });
  vi.mocked(peopleRepo.findByPageIds).mockResolvedValue([
    { pageId: 'person-1', name: '許文修', hasPaid: true, lineUserId: '' },
    { pageId: 'person-2', name: '陳玟育', hasPaid: true, lineUserId: '' },
  ]);
  // Returned out of order on purpose — handler must sort by date before rendering.
  vi.mocked(calendarRepo.findByPageIds).mockResolvedValue([
    { pageId: 'cal-2', date: '2026-10-03T20:00:00.000+08:00', absentees: [], guests: [], isPaused: false, courts: null },
    { pageId: 'cal-1', date: '2026-09-26T20:00:00.000+08:00', absentees: [], guests: [], isPaused: false, courts: null },
  ]);
  vi.mocked(announcementRepo.getBlocks).mockResolvedValue([
    paragraphBlock('{SEASON} {FROM_TO_MONTH}'),
    paragraphBlock('共 {TOTAL_PEOPLE} 人'),
    paragraphBlock('{LIST_ALL_PEOPLE}'),
    paragraphBlock('每人 ${PRICE_PER_PERSON_FOR_SEASON}'),
    paragraphBlock('共 {WEEK_COUNTS} 次'),
    paragraphBlock('每人每次 ${PRICE_PER_PERSON_FOR_ONCE}'),
    paragraphBlock('{COURT_COUNT} 面，共 ${TOTAL_PRICE}'),
    paragraphBlock('{LIST_ALL_DATES}'),
    paragraphBlock('{LOCATION}'),
    bulletedListItemBlock('永豐 (807) 20201800934932'),
    bulletedListItemBlock('Line 轉帳'),
  ] as any);
});

describe('handleNews', () => {
  it('looks up the NEWS_TEMPLATE announcement, not NEWS', async () => {
    await handleNews('token');

    expect(announcementRepo.findByName).toHaveBeenCalledWith('NEWS_TEMPLATE');
  });

  it('substitutes all season/date placeholders with live data', async () => {
    await handleNews('token');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;

    expect(text).toContain('2026-Q3 7~9月');
    expect(text).toContain('共 2 人');
    expect(text).toContain('許文修、陳玟育');
    // Math.ceil(2127.27...) = 2128
    expect(text).toContain('每人 $2128');
    expect(text).toContain('共 13 次');
    expect(text).toContain('每人每次 $170');
    expect(text).toContain('2 面，共 $23400');
    // Sorted ascending and grouped by month despite being returned out of order
    expect(text).toContain('9/26\n10/03');
    expect(text).toContain('中華科大');
    // bulleted_list_item blocks get a "• " prefix that plain paragraphs don't
    expect(text).toContain('• 永豐 (807) 20201800934932\n• Line 轉帳');
  });

  it('replies "找不到公告內容" when NEWS_TEMPLATE does not exist', async () => {
    vi.mocked(announcementRepo.findByName).mockResolvedValue(null);

    await handleNews('token');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '找不到公告內容' }]);
    expect(seasonRepo.findByName).not.toHaveBeenCalled();
  });

  it('replies with a season-not-found message when the current season is missing', async () => {
    vi.mocked(seasonRepo.findByName).mockResolvedValue(null);

    await handleNews('token');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;
    expect(text).toContain('季租資料');
  });
});
