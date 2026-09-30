import { describe, it, expect, vi } from 'vitest';
import type { messagingApi } from '@line/bot-sdk';
import { createTestBot } from '../../test-utils/create-test-bot.js';
import { replyText } from '../../test-utils/index.js';
import { buildCommandListBubble, buildCommandListAltText } from '../command-list-card.js';
import { getCurrentSeasonName, getNextSeasonName } from '../../utils/date-utils.js';

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
  it('replies a Flex card whose buttons send every no-argument command, without the admin section for members', async () => {
    const bot = createTestBot();
    const messages = await bot.run('@Dobby 指令', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe('flex');
    expect(actionTexts(bodyOf(messages[0]!))).toEqual([
      '@Dobby 報名人',
      '@Dobby 公告',
      '@Dobby 付款',
      '@Dobby 欠',
      '@Dobby',
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

    const nextSeasonArg = getNextSeasonName(getCurrentSeasonName()).replace('-', '');
    const texts = actionTexts(bodyOf(messages[0]!));
    expect(texts.slice(-2)).toEqual(['@Dobby next', `@Dobby season ${nextSeasonArg}`]);
    expect(replyText(messages[0]!)).toContain('【管理員專用】');
  });

  it('every button text is parsed back into a real command (no dead buttons)', async () => {
    const bubble = buildCommandListBubble({ isAdmin: true, nextSeasonName: '2026-Q4' });
    const { parseCommand } = await import('../command-parser.js');
    for (const text of actionTexts(bubble.body)) {
      const parsed = parseCommand(text);
      expect(parsed, text).not.toBeNull();
      expect(parsed?.type, text).not.toBe('unknown');
    }
  });

  it('writes the season-draft command without the hyphen (2027-Q1 → 2027Q1)', () => {
    const texts = actionTexts(buildCommandListBubble({ isAdmin: true, nextSeasonName: '2027-Q1' }).body);
    expect(texts).toContain('@Dobby season 2027Q1');
    expect(buildCommandListAltText({ isAdmin: true, nextSeasonName: '2027-Q1' })).toContain('@Dobby season 2027Q1');
  });
});
