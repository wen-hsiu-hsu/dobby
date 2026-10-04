import { describe, it, expect, vi, afterEach } from 'vitest';
import type { messagingApi } from '@line/bot-sdk';
import { createTestBot } from '../../test-utils/create-test-bot.js';
import { replyText } from '../../test-utils/index.js';
import { buildCommandListBubble, buildCommandListAltText } from '../command-list-card.js';
import { getCurrentSeasonName, getNextSeasonName, parseSeasonInput } from '../../utils/date-utils.js';
import { parseCommand } from '../command-parser.js';
import { CommandType } from '../../types/commands.js';

vi.mock('../../services/notion/notion-fetch.js');
vi.mock('../../config/line.js');
vi.mock('../../services/mutex.js');

const adminUsers = {
  results: [
    {
      id: 'user-page-1',
      object: 'page',
      properties: {
        user_id: { type: 'title', title: [{ plain_text: 'admin-user', type: 'text' }] },
        'Custom Name': { type: 'rich_text', rich_text: [] },
        'Registered name': { type: 'relation', relation: [{ id: 'person-1' }], has_more: false },
        is_admin: { type: 'checkbox', checkbox: true },
        message_counts: { type: 'number', number: 0 },
        groups: { type: 'multi_select', multi_select: [] },
        'multi-chat': { type: 'multi_select', multi_select: [] },
      },
    },
  ],
  has_more: false,
  next_cursor: null,
};

/** 卡片上所有可點元件送出的指令文字，依畫面順序（深度優先走訪 box）。 */
function actionTexts(component: unknown): string[] {
  const c = component as { action?: { type: string; text?: string }; contents?: unknown[] };
  const own = c.action?.type === 'message' && c.action.text ? [c.action.text] : [];
  return [...own, ...(c.contents ?? []).flatMap(actionTexts)];
}

function bodyOf(message: messagingApi.Message): unknown {
  return ((message as messagingApi.FlexMessage).contents as messagingApi.FlexBubble).body;
}

describe('command-list', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes next season in Asia/Taipei: UTC 12/31 16:30 is already 1/1 in Taipei → 2027Q2', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-31T16:30:00Z'));
    const bot = createTestBot({ users: adminUsers });
    const messages = await bot.run('@Dobby command', { userId: 'admin-user' });

    expect(actionTexts(bodyOf(messages[0]!))).toContain('@Dobby season 2027Q2');
  });

  it('replies a Flex card whose buttons send every no-argument command, without the admin section for members', async () => {
    const bot = createTestBot();
    const messages = await bot.run('@Dobby 指令', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe('flex');
    expect(actionTexts(bodyOf(messages[0]!))).toEqual([
      '@Dobby next',
      '@Dobby 報名人',
      '@Dobby 公告',
      '@Dobby 付款',
      '@Dobby 欠',
      '@Dobby +1',
      '@Dobby -1',
      '@Dobby 假',
      '@Dobby 銷假',
    ]);
    const altText = replyText(messages[0]!);
    expect(altText).toContain('@Dobby +N');
    expect(altText).not.toContain('管理員專用');
  });

  it('adds the admin section for admins, with the season-draft button pointing at next quarter', async () => {
    const bot = createTestBot({ users: adminUsers });
    const messages = await bot.run('@Dobby command', { userId: 'admin-user' });

    // 季度邊界另有固定時間的測試；這裡只確認 handler 把「今天的下一季」接到按鈕上
    const nextSeasonArg = getNextSeasonName(getCurrentSeasonName()).replace('-', '');
    const texts = actionTexts(bodyOf(messages[0]!));
    expect(texts.slice(-1)).toEqual([`@Dobby season ${nextSeasonArg}`]);
    expect(replyText(messages[0]!)).toContain('【管理員專用】');
  });

  it('every button is parsed into the command its row promises (no dead or mis-wired buttons)', () => {
    const bubble = buildCommandListBubble({ isAdmin: true, nextSeasonName: '2026-Q4' });
    const parsed = actionTexts(bubble.body).map((text) => ({ text, cmd: parseCommand(text) }));

    expect(parsed.map(({ cmd }) => cmd?.type)).toEqual([
      CommandType.NEXT_EVENT,
      CommandType.PARTICIPANTS,
      CommandType.NEWS,
      CommandType.PAYMENT,
      CommandType.OWE,
      CommandType.REGISTRATION,
      CommandType.REGISTRATION,
      CommandType.LEAVE,
      CommandType.CANCEL_LEAVE,
      CommandType.SEASON_ANNOUNCEMENT,
    ]);
    expect(parsed.filter(({ cmd }) => cmd?.type === CommandType.REGISTRATION).map(({ cmd }) => cmd?.delta)).toEqual(['+1', '-1']);
    // season 的 parser 接受任何非空白字串，季度格式要另外確認 handler 那層吃得下
    const seasonCmd = parsed.find(({ cmd }) => cmd?.type === CommandType.SEASON_ANNOUNCEMENT)?.cmd;
    expect(parseSeasonInput(seasonCmd?.seasonArg ?? '')).toBe('2026-Q4');
    // 只收 message action；若有按鈕改成別種 action，這裡的數量會對不上
    expect(JSON.stringify(bubble.body).match(/"action":/g)).toHaveLength(parsed.length);
  });

  it('writes the season-draft command without the hyphen (2027-Q1 → 2027Q1)', () => {
    const texts = actionTexts(buildCommandListBubble({ isAdmin: true, nextSeasonName: '2027-Q1' }).body);
    expect(texts).toContain('@Dobby season 2027Q1');
    expect(buildCommandListAltText({ isAdmin: true, nextSeasonName: '2027-Q1' })).toContain('@Dobby season 2027Q1');
  });
});
