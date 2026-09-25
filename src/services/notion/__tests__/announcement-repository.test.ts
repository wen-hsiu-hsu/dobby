import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionGet, notionPost } from '../notion-fetch.js';
import { findByName, getBlocks } from '../announcement-repository.js';

vi.mock('../notion-fetch.js');

const notionGetMock = vi.mocked(notionGet);
const notionPostMock = vi.mocked(notionPost);

function block(
  type: string,
  text: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `${type}-${text}`,
    type,
    has_children: false,
    [type]: { rich_text: [{ plain_text: text }] },
    ...overrides,
  };
}

describe('announcement-repository', () => {
  beforeEach(() => {
    notionGetMock.mockReset();
    notionPostMock.mockReset();
  });

  describe('findByName', () => {
    it('returns null when no results', async () => {
      notionPostMock.mockResolvedValue({ results: [] });
      const result = await findByName('missing');
      expect(result).toBeNull();
    });
  });

  describe('getBlocks', () => {
    it('returns flat blocks as-is when none have children', async () => {
      notionGetMock.mockResolvedValue({
        results: [block('paragraph', 'hello'), block('paragraph', 'world')],
      });

      const blocks = await getBlocks('page-1');

      expect(notionGetMock).toHaveBeenCalledTimes(1);
      expect(notionGetMock).toHaveBeenCalledWith('/blocks/page-1/children');
      expect(blocks).toHaveLength(2);
      expect(blocks[0]?.children).toBeUndefined();
    });

    it('recurses into has_children blocks and attaches their children', async () => {
      notionGetMock.mockImplementation(async (path: string) => {
        if (path === '/blocks/page-1/children') {
          return {
            results: [
              block('paragraph', 'intro'),
              block('toggle', '詳細規則', { has_children: true, id: 'toggle-1' }),
            ],
          };
        }
        if (path === '/blocks/toggle-1/children') {
          return { results: [block('bulleted_list_item', '第一條')] };
        }
        throw new Error(`unexpected path: ${path}`);
      });

      const blocks = await getBlocks('page-1');

      expect(blocks).toHaveLength(2);
      expect(blocks[0]?.children).toBeUndefined();
      const toggle = blocks[1] as any;
      expect(toggle.id).toBe('toggle-1');
      expect(toggle.children).toHaveLength(1);
      expect(toggle.children[0].type).toBe('bulleted_list_item');
    });

    it('recurses through multiple nesting levels', async () => {
      notionGetMock.mockImplementation(async (path: string) => {
        if (path === '/blocks/page-1/children') {
          return { results: [block('toggle', 'L1', { has_children: true, id: 'l1' })] };
        }
        if (path === '/blocks/l1/children') {
          return {
            results: [block('bulleted_list_item', 'L2', { has_children: true, id: 'l2' })],
          };
        }
        if (path === '/blocks/l2/children') {
          return { results: [block('paragraph', 'L3')] };
        }
        throw new Error(`unexpected path: ${path}`);
      });

      const blocks = await getBlocks('page-1');

      const l1 = blocks[0] as any;
      const l2 = l1.children[0];
      expect(l2.children).toHaveLength(1);
      expect(l2.children[0].type).toBe('paragraph');
    });

    it('waits 400ms between each recursive /blocks/*/children call to respect the Notion rate limit', async () => {
      vi.useFakeTimers();
      try {
        const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
        notionGetMock.mockImplementation(async (path: string) => {
          if (path === '/blocks/page-1/children') {
            return {
              results: [
                block('toggle', 'A', { has_children: true, id: 'child-a' }),
                block('toggle', 'B', { has_children: true, id: 'child-b' }),
              ],
            };
          }
          return { results: [] };
        });

        const promise = getBlocks('page-1');
        await vi.advanceTimersByTimeAsync(2000);
        await promise;

        // 3 total calls (root + 2 children), so 2 delays — none before the first call.
        expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
        for (const call of setTimeoutSpy.mock.calls) {
          expect(call[1]).toBe(400);
        }
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
