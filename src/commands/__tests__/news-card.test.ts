import { describe, it, expect } from 'vitest';
import { buildNewsBubble } from '../news-card.js';

function card(sections: { heading: string; body: string }[]) {
  return buildNewsBubble({ topText: '2026 Q4（10~12月）', subtitle: '共 10 人・13 次', sections });
}

// body = 段落 box 與 separator 交錯，最後一個是按鈕列
function bodyParts(bubble: ReturnType<typeof card>): any[] {
  return (bubble.body as any).contents;
}

function sectionTexts(bubble: ReturnType<typeof card>): string[][] {
  return bodyParts(bubble)
    .slice(0, -1)
    .filter((c) => c.type === 'box')
    .map((box) => box.contents.map((t: any) => t.text));
}

function allTexts(node: any): string[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(allTexts);
  const own = node.type === 'text' ? [node.text] : [];
  return [...own, ...Object.values(node).flatMap(allTexts)];
}

describe('buildNewsBubble', () => {
  it('renders each section as heading + body with a separator between sections, in order', () => {
    const bubble = card([
      { heading: '季打費用', body: '每人 $2340\n共 13 次' },
      { heading: '場地', body: '中華科大' },
    ]);
    expect(bodyParts(bubble).map((p) => p.type)).toEqual(['box', 'separator', 'box', 'box']);
    expect(sectionTexts(bubble)).toEqual([['季打費用', '每人 $2340\n共 13 次'], ['場地', '中華科大']]);
  });

  it('wraps body text so long announcements and full name lists are never cut off', () => {
    const [section] = bodyParts(card([{ heading: '報名名單', body: '志豪、佩琪、阿翔、Amy、家豪、雅婷、宗翰、怡君、Ben、俊傑' }]));
    expect(section.contents.every((t: any) => t.wrap === true)).toBe(true);
  });

  it('omits an empty heading or body, and drops sections with neither — LINE rejects empty Flex text', () => {
    const bubble = card([
      { heading: '', body: '2026-Q4 10~12月' },
      { heading: '只有標題', body: '' },
      { heading: '  ', body: ' \n ' },
      { heading: '場地', body: '中華科大' },
    ]);
    expect(sectionTexts(bubble)).toEqual([['2026-Q4 10~12月'], ['只有標題'], ['場地', '中華科大']]);
    expect(allTexts(bubble).every((t) => t.trim().length > 0)).toBe(true);
  });

  it('still renders the hero and buttons when there are no sections', () => {
    const parts = bodyParts(card([]));
    expect(parts).toHaveLength(1);
    expect(allTexts(card([]))).toEqual(expect.arrayContaining(['本季公告', '2026 Q4（10~12月）', '共 10 人・13 次']));
  });

  it('ends with 付款資訊 / 指令清單 buttons that send the commands as message actions', () => {
    const buttons = bodyParts(card([{ heading: 'a', body: 'b' }])).at(-1).contents;
    expect(buttons.map((b: any) => b.action)).toEqual([
      { type: 'message', label: '付款資訊', text: '@Dobby 付款' },
      { type: 'message', label: '指令清單', text: '@Dobby 指令' },
    ]);
  });
});
