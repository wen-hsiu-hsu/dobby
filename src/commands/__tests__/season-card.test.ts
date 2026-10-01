import { describe, it, expect } from 'vitest';
import { buildSeasonBubble, seasonCardToText } from '../season-card.js';
import type { StatTile, HighlightRow } from '../season-card.js';

function tile(title: string, overrides: Partial<StatTile> = {}): StatTile {
  return { title, prefix: '', value: '1', suffix: '', note: '', wide: false, ...overrides };
}

function row(title: string, overrides: Partial<HighlightRow> = {}): HighlightRow {
  return { title, amount: '$1', content: '', note: '', highlight: false, ...overrides };
}

// Flex 的 text 不能是空字串，LINE 會整則退回
function emptyTexts(node: unknown): unknown[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(emptyTexts);
  const n = node as Record<string, unknown>;
  const self = (n['type'] === 'text' || n['type'] === 'span') && !n['text'] ? [n] : [];
  return [...self, ...Object.values(n).flatMap(emptyTexts)];
}

function texts(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(texts);
  const n = node as Record<string, unknown>;
  return [...(n['type'] === 'text' && !n['contents'] ? [n['text'] as string] : []), ...Object.values(n).flatMap(texts)];
}

describe('buildSeasonBubble', () => {
  it('pairs narrow stat tiles two per line, gives a wide tile its own line, and pads a lone narrow tile to half width', () => {
    const bubble = buildSeasonBubble({
      title: 'T',
      items: [{ kind: 'stats', tiles: [tile('a'), tile('b'), tile('c'), tile('wide', { wide: true }), tile('d')] }],
    });

    const lines = (bubble.body!.contents[0] as any).contents;
    // a+b、c 落單（wide 前面）補空格、wide 獨佔、d 落單補空格
    expect(lines.map((l: any) => l.contents.length)).toEqual([2, 2, 1, 2]);
    expect(lines[1].contents[1]).toEqual({ type: 'box', layout: 'vertical', flex: 1, contents: [] });
    expect(texts(lines[2])).toEqual(['wide']);
  });

  it('renders prefix/value/suffix as spans and skips the empty ones and an empty note', () => {
    const bubble = buildSeasonBubble({
      title: 'T',
      items: [{ kind: 'stats', tiles: [tile('場地', { value: '2', suffix: '個場' }), tile('零打', { prefix: '$', value: '190', note: '備註' })] }],
    });

    expect(emptyTexts(bubble)).toEqual([]);
    const [court, guest] = (bubble.body!.contents[0] as any).contents[0].contents;
    expect(court.contents[1].contents.map((s: any) => s.text)).toEqual(['2', ' 個場']);
    expect(court.contents[1].text).toBe('2 個場');
    expect(guest.contents.map((c: any) => c.text)).toEqual(['零打', '$190', '備註']);
  });

  it('draws highlighted rows with a lime title pill and pairs consecutive plain rows', () => {
    const bubble = buildSeasonBubble({
      title: 'T',
      items: [
        {
          kind: 'highlights',
          rows: [
            row('續打', { highlight: true, amount: '$2200', note: '已扣除退費 $140', content: '@A @B' }),
            row('零打金額'),
            row('結餘'),
          ],
        },
      ],
    });

    expect(emptyTexts(bubble)).toEqual([]);
    const [first, separator, plain] = (bubble.body!.contents[0] as any).contents;
    const pill = first.contents[0].contents[0];
    expect(pill.backgroundColor).toBe('#A3E635');
    expect(pill.contents[0].text).toBe('續打');
    expect(texts(first)).toEqual(['續打', '$2200', '已扣除退費 $140', '@A @B']);
    expect(separator.type).toBe('separator');
    expect(plain.layout).toBe('horizontal');
    expect(texts(plain)).toEqual(['零打金額', '$1', '結餘', '$1']);
  });

  it('handles highlight tables with only highlighted rows, an odd number of plain rows, and a highlighted row with only content', () => {
    const bubble = buildSeasonBubble({
      title: 'T',
      items: [
        { kind: 'highlights', rows: [row('', { amount: '', content: '@A', highlight: true }), row('x'), row('y'), row('z')] },
        { kind: 'stats', tiles: [tile('只有標題', { value: '' })] },
      ],
    });

    expect(emptyTexts(bubble)).toEqual([]);
    const lines = (bubble.body!.contents[0] as any).contents.filter((c: any) => c.type !== 'separator');
    // 突顯列沒有標題和金額：只剩名單，沒有空的標籤列
    expect(lines[0].contents.map((c: any) => c.text)).toEqual(['@A']);
    // x+y 並排、z 落單補空格
    expect(lines.slice(1).map((l: any) => l.contents.length)).toEqual([2, 2]);
    expect(texts(bubble.body!.contents[2])).toEqual(['只有標題']);
  });

  it('draws a payment item as the 付款方式 heading, the payment card rows and the extra text', () => {
    const bubble = buildSeasonBubble({
      title: 'T',
      items: [
        {
          kind: 'payment',
          methods: [
            { name: '永豐銀行', account: '123', note: '請備註名字' },
            { name: '現金', account: '', note: '' },
          ],
          extraText: '補充說明',
        },
      ],
    });

    expect(emptyTexts(bubble)).toEqual([]);
    const [heading, rows, extra] = (bubble.body!.contents[0] as any).contents;
    expect(heading.text).toBe('付款方式');
    expect(rows.contents).toHaveLength(2);
    expect(rows.contents[0].contents[1].action.clipboardText).toBe('123');
    expect(extra.text).toBe('補充說明');
    expect(
      seasonCardToText({ title: 'T', items: [{ kind: 'payment', methods: [{ name: '現金', account: '', note: '' }], extraText: '' }] }),
    ).toBe('T\n\n付款方式\n現金');
    expect(
      seasonCardToText({ title: 'T', items: [{ kind: 'payment', methods: [{ name: '現金', account: '', note: '' }], extraText: '補充說明' }] }),
    ).toBe('T\n\n付款方式\n現金\n補充說明');
  });

  it('puts a separator between items and keeps text sections as heading + body', () => {
    const bubble = buildSeasonBubble({
      title: 'T',
      items: [
        { kind: 'stats', tiles: [tile('a', { wide: true })] },
        { kind: 'section', heading: '時間', body: '13 次' },
      ],
    });

    expect(bubble.body!.contents.map((c) => c.type)).toEqual(['box', 'separator', 'box']);
    expect(texts(bubble.body!.contents[2])).toEqual(['時間', '13 次']);
  });
});

describe('seasonCardToText', () => {
  it('writes one line per tile/row, notes in parentheses and mentions on their own line', () => {
    expect(
      seasonCardToText({
        title: '標題',
        items: [
          { kind: 'stats', tiles: [tile('場地', { value: '2', suffix: '個場' }), tile('場租', { prefix: '$', value: '23400', note: '算式', wide: true })] },
          { kind: 'highlights', rows: [row('續打', { amount: '$2200', note: '已扣除退費 $140', content: '@A', highlight: true }), row('結餘')] },
          { kind: 'section', heading: '時間', body: '13 次' },
        ],
      }),
    ).toBe(['標題', '', '場地 2 個場', '場租 $23400 (算式)', '', '續打 $2200 (已扣除退費 $140)', '@A', '結餘 $1', '', '時間', '13 次'].join('\n'));
  });

  it('does not leave a leading space when a row has only a note or only content', () => {
    expect(
      seasonCardToText({
        title: 'T',
        items: [{ kind: 'highlights', rows: [row('', { amount: '', note: '只有備註', content: '@A' })] }],
      }),
    ).toBe('T\n\n只有備註\n@A');
  });
});
