import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestBot } from '../test-utils/index.js';

vi.mock('../services/notion/notion-fetch.js');
vi.mock('../config/line.js');
vi.mock('../services/mutex.js');

describe('Command routing integration', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('@Dobby command → replies with command list text', async () => {
    const bot = createTestBot();
    const messages = await bot.run('@Dobby command', { userId: 'user-alice' });

    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toMatchObject({ type: 'text' });
  });

  it('@Dobby command（一般成員）→ 不含管理員限定指令', async () => {
    const bot = createTestBot();
    const messages = await bot.run('@Dobby command', { userId: 'user-alice' });

    const text = (messages[0] as any)?.text ?? '';
    expect(text).not.toContain('next');
    expect(text).not.toContain('season');
    expect(text).not.toContain('代為報名');
    expect(text).not.toContain('管理員專用');
  });

  it('@Dobby command（管理員）→ 包含管理員限定指令', async () => {
    const bot = createTestBot({
      users: {
        results: [
          {
            id: 'admin-page',
            object: 'page',
            properties: {
              user_id: { type: 'title', title: [{ plain_text: 'admin-user' }] },
              'Custom Name': { type: 'rich_text', rich_text: [] },
              'Registered name': { type: 'relation', relation: [], has_more: false },
              is_admin: { type: 'checkbox', checkbox: true },
              message_counts: { type: 'number', number: 0 },
              groups: { type: 'multi_select', multi_select: [] },
              'multi-chat': { type: 'multi_select', multi_select: [] },
            },
          },
        ],
      },
    });
    const messages = await bot.run('@Dobby command', { userId: 'admin-user' });

    const text = (messages[0] as any)?.text ?? '';
    expect(text).toContain('管理員專用');
    expect(text).toContain('@Dobby next');
    expect(text).toContain('@Dobby season 2026Q2');
    expect(text).toContain('代為報名');
  });

  it('@Dobby → replies with introduce text from announcement fixture', async () => {
    const bot = createTestBot();
    const messages = await bot.run('@Dobby', { userId: 'user-alice' });

    expect(messages.length).toBeGreaterThan(0);
    // The introduce handler uses textV2 with substitution
    const msg = messages[0] as any;
    expect(['text', 'textV2']).toContain(msg.type);
  });

  it('@Dobby → replies with error when no INTRODUCE announcement', async () => {
    const bot = createTestBot({ announcement: { results: [] } });
    const messages = await bot.run('@Dobby', { userId: 'user-alice' });

    expect(messages.length).toBeGreaterThan(0);
    const msg = messages[0] as any;
    expect(msg.text).toContain('找不到');
  });

  it('non-command text → no reply (user not in auto-reply triggers)', async () => {
    const bot = createTestBot();
    const messages = await bot.run('隨便說說話xyz123', { userId: 'user-alice' });

    expect(messages).toHaveLength(0);
  });

  it('auto-reply trigger → replies with matched response', async () => {
    const bot = createTestBot();
    // "請假" is a known auto-reply trigger in the JSON
    const messages = await bot.run('我想請假', { userId: 'user-alice' });

    expect(messages.length).toBeGreaterThan(0);
    const msg = messages[0] as any;
    expect(msg.text).toBe('喔不');
  });

  it('admin user → skips auto-reply', async () => {
    const bot = createTestBot({
      users: {
        results: [
          {
            id: 'admin-page',
            object: 'page',
            properties: {
              user_id: { type: 'title', title: [{ plain_text: 'admin-user' }] },
              'Custom Name': { type: 'rich_text', rich_text: [] },
              'Registered name': { type: 'relation', relation: [], has_more: false },
              is_admin: { type: 'checkbox', checkbox: true },
              message_counts: { type: 'number', number: 0 },
              groups: { type: 'multi_select', multi_select: [] },
              'multi-chat': { type: 'multi_select', multi_select: [] },
            },
          },
        ],
      },
    });

    const messages = await bot.run('我想請假', { userId: 'admin-user' });
    expect(messages).toHaveLength(0);
  });
});
