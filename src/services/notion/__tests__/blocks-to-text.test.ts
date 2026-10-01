import { describe, it, expect } from 'vitest';
import { blocksToText, blocksToSections, readHeaderTable } from '../blocks-to-text.js';

function paragraph(text: string) {
  return { type: 'paragraph', paragraph: { rich_text: [{ plain_text: text }] } };
}

function bulletedListItem(text: string) {
  return { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: text }] } };
}

function numberedListItem(text: string, extra: Record<string, unknown> = {}) {
  return { type: 'numbered_list_item', numbered_list_item: { rich_text: text ? [{ plain_text: text }] : [], ...extra } };
}

function toDo(text: string, checked: boolean) {
  return { type: 'to_do', to_do: { rich_text: [{ plain_text: text }], checked } };
}

// Real Notion empty paragraphs come back with an empty rich_text array
const emptyParagraph = { type: 'paragraph', paragraph: { rich_text: [] } };

describe('blocksToText', () => {
  it('joins paragraph blocks with newlines, unprefixed', () => {
    const text = blocksToText([paragraph('hello'), paragraph('world')] as any);
    expect(text).toBe('hello\nworld');
  });

  it('prefixes bulleted_list_item blocks with "• "', () => {
    const text = blocksToText([paragraph('付款方式'), bulletedListItem('永豐銀行'), bulletedListItem('現金')] as any);
    expect(text).toBe('付款方式\n• 永豐銀行\n• 現金');
  });

  it('skips non-paragraph blocks with empty or missing rich_text', () => {
    const text = blocksToText([
      paragraph('a'),
      bulletedListItem(''),
      { type: 'image', image: { type: 'external', external: { url: 'https://x/y.png' } } },
      paragraph('b'),
    ] as any);
    expect(text).toBe('a\nb');
  });

  it('renders divider blocks as "—", matching the templates\' hand-typed separator', () => {
    const text = blocksToText([paragraph('上段'), { type: 'divider', divider: {} }, paragraph('下段')] as any);
    expect(text).toBe('上段\n—\n下段');
  });

  it('keeps empty paragraphs between content as blank lines', () => {
    const text = blocksToText([paragraph('上段'), paragraph(''), paragraph(''), paragraph('下段')] as any);
    expect(text).toBe('上段\n\n\n下段');
  });

  it('drops leading and trailing empty paragraphs', () => {
    const text = blocksToText([paragraph(''), paragraph('現金'), paragraph('')] as any);
    expect(text).toBe('現金');
  });

  it('returns an empty string when every block is an empty paragraph', () => {
    expect(blocksToText([paragraph(''), paragraph('')] as any)).toBe('');
  });

  it('indents nested children under their parent, right after the parent line', () => {
    const toggle = {
      type: 'toggle',
      toggle: { rich_text: [{ plain_text: '詳細規則' }] },
      children: [bulletedListItem('第一條'), bulletedListItem('第二條')],
    };
    const text = blocksToText([paragraph('公告'), toggle, paragraph('結尾')] as any);
    expect(text).toBe('公告\n詳細規則\n  • 第一條\n  • 第二條\n結尾');
  });

  it('indents nested bulleted sub-lists two spaces deeper per level', () => {
    const nested = bulletedListItem('外層') as any;
    nested.children = [bulletedListItem('內層')];
    const text = blocksToText([nested] as any);
    expect(text).toBe('• 外層\n  • 內層');
  });

  it('still renders children even when the parent block itself has no text', () => {
    const emptyToggle = {
      type: 'toggle',
      toggle: { rich_text: [] },
      children: [bulletedListItem('子項')],
    };
    const text = blocksToText([emptyToggle] as any);
    expect(text).toBe('  • 子項');
  });

  it('keeps the indent on nested dividers', () => {
    const toggle = { type: 'toggle', toggle: { rich_text: [{ plain_text: '規則' }] }, children: [{ type: 'divider', divider: {} }] };
    expect(blocksToText([toggle] as any)).toBe('規則\n  —');
  });

  it('renders nested empty paragraphs as truly empty lines, without indent', () => {
    const toggle = {
      type: 'toggle',
      toggle: { rich_text: [{ plain_text: '規則' }] },
      children: [paragraph('a'), emptyParagraph, paragraph('b')],
    };
    expect(blocksToText([toggle] as any)).toBe('規則\n  a\n\n  b');
  });

  it('drops a leading blank line without trimming the next line\'s indent', () => {
    const emptyToggle = { type: 'toggle', toggle: { rich_text: [] }, children: [bulletedListItem('子項')] };
    expect(blocksToText([emptyParagraph, emptyToggle] as any)).toBe('  • 子項');
  });

  describe('numbered_list_item', () => {
    it('numbers consecutive items from 1', () => {
      const text = blocksToText([numberedListItem('報名'), numberedListItem('付款'), numberedListItem('打球')] as any);
      expect(text).toBe('1. 報名\n2. 付款\n3. 打球');
    });

    it('restarts at 1 after any other block interrupts the list', () => {
      const text = blocksToText([
        numberedListItem('a'),
        numberedListItem('b'),
        paragraph('中斷'),
        numberedListItem('c'),
      ] as any);
      expect(text).toBe('1. a\n2. b\n中斷\n1. c');
    });

    it('skips empty items without leaving a gap in the numbering', () => {
      const text = blocksToText([numberedListItem('a'), numberedListItem(''), numberedListItem('b')] as any);
      expect(text).toBe('1. a\n2. b');
    });

    it('uses letters then roman numerals for nested levels, like Notion', () => {
      const l3 = numberedListItem('第三層') as any;
      const l2 = numberedListItem('第二層') as any;
      l2.children = [numberedListItem('i-1'), l3];
      const l1 = numberedListItem('第一層') as any;
      l1.children = [numberedListItem('a-1'), l2];
      const deepest = numberedListItem('第四層') as any;
      l3.children = [deepest];
      expect(blocksToText([l1] as any)).toBe(
        '1. 第一層\n  a. a-1\n  b. 第二層\n    i. i-1\n    ii. 第三層\n      1. 第四層',
      );
    });

    it('continues letters past z as aa, ab, …', () => {
      const parent = numberedListItem('外層') as any;
      parent.children = Array.from({ length: 28 }, (_, i) => numberedListItem(`項${i + 1}`));
      const lines = blocksToText([parent] as any).split('\n');
      expect(lines[26]).toBe('  z. 項26');
      expect(lines[27]).toBe('  aa. 項27');
      expect(lines[28]).toBe('  ab. 項28');
    });

    it('starts at "1." inside a toggle or column — only numbered ancestors change the format', () => {
      const toggle = { type: 'toggle', toggle: { rich_text: [{ plain_text: '規則' }] }, children: [numberedListItem('x')] };
      const column = { type: 'column', column: {}, children: [numberedListItem('y')] };
      const columnList = { type: 'column_list', column_list: {}, children: [column] };
      expect(blocksToText([toggle, columnList] as any)).toBe('規則\n  1. x\n    1. y');
    });

    it('goes back to the default format once a list_format run is interrupted', () => {
      const text = blocksToText([
        numberedListItem('x', { list_format: 'roman' }),
        paragraph('中斷'),
        numberedListItem('y'),
      ] as any);
      expect(text).toBe('i. x\n中斷\n1. y');
    });

    it('reads list_start_index and list_format from an empty first item', () => {
      const text = blocksToText([
        numberedListItem('', { list_start_index: 5, list_format: 'roman' }),
        numberedListItem('x'),
      ] as any);
      expect(text).toBe('v. x');
    });

    it('treats a list_start_index below 1 as 1', () => {
      const text = blocksToText([numberedListItem('x', { list_start_index: 0 }), numberedListItem('y')] as any);
      expect(text).toBe('1. x\n2. y');
    });

    it('honours list_start_index and list_format on the first item when Notion sends them', () => {
      const text = blocksToText([
        numberedListItem('x', { list_start_index: 4, list_format: 'roman' }),
        numberedListItem('y'),
      ] as any);
      expect(text).toBe('iv. x\nv. y');
    });
  });

  it('prefixes to_do blocks with an unchecked or checked box', () => {
    const text = blocksToText([toDo('帶球', false), toDo('繳費', true)] as any);
    expect(text).toBe('☐ 帶球\n☑ 繳費');
  });
});

function heading(level: 1 | 2 | 3, text: string, children?: unknown[]) {
  const type = `heading_${level}`;
  return { type, [type]: { rich_text: text ? [{ plain_text: text }] : [] }, ...(children ? { children } : {}) };
}

const divider = { type: 'divider', divider: {} };

describe('blocksToSections', () => {
  it('starts a section at every heading level and uses the heading text as its title', () => {
    const sections = blocksToSections([
      heading(1, '一'), paragraph('a'),
      heading(2, '二'), bulletedListItem('b'),
      heading(3, '三'), paragraph('c'),
    ] as any);
    expect(sections).toEqual([
      { heading: '一', body: 'a' },
      { heading: '二', body: '• b' },
      { heading: '三', body: 'c' },
    ]);
  });

  it('keeps content before the first heading as an untitled section', () => {
    const sections = blocksToSections([paragraph('{SEASON} {FROM_TO_MONTH}'), heading(2, '報名名單'), paragraph('x')] as any);
    expect(sections).toEqual([
      { heading: '', body: '{SEASON} {FROM_TO_MONTH}' },
      { heading: '報名名單', body: 'x' },
    ]);
  });

  it('treats a divider as a section break, drops the divider itself, and skips empty sections', () => {
    // The live NEWS_TEMPLATE shape: divider, heading, body, divider, heading, …
    const sections = blocksToSections([
      heading(2, 'A'), paragraph('a'), divider,
      heading(2, 'B'), paragraph('b'), divider, divider,
      paragraph('after divider'),
    ] as any);
    expect(sections).toEqual([
      { heading: 'A', body: 'a' },
      { heading: 'B', body: 'b' },
      { heading: '', body: 'after divider' },
    ]);
  });

  it('keeps a heading with nothing under it, with an empty body', () => {
    expect(blocksToSections([heading(2, '只有標題'), divider] as any)).toEqual([{ heading: '只有標題', body: '' }]);
  });

  it('converts each section body like blocksToText: list numbering, blank lines in between, trimmed ends', () => {
    const sections = blocksToSections([
      heading(2, '規則'), emptyParagraph, numberedListItem('第一'), numberedListItem('第二'), emptyParagraph, paragraph('備註'), emptyParagraph,
    ] as any);
    expect(sections).toEqual([{ heading: '規則', body: '1. 第一\n2. 第二\n\n備註' }]);
  });

  it('puts a toggleable heading\'s children in its body, unindented', () => {
    const sections = blocksToSections([heading(2, '展開', [paragraph('內容'), bulletedListItem('項目')])] as any);
    expect(sections).toEqual([{ heading: '展開', body: '內容\n• 項目' }]);
  });

  it('restarts numbering after a toggleable heading\'s numbered children, matching blocksToText', () => {
    const blocks = [heading(2, '規則', [numberedListItem('a'), numberedListItem('b')]), numberedListItem('c')];
    expect(blocksToText(blocks as any)).toBe('規則\n  1. a\n  2. b\n1. c');
    expect(blocksToSections(blocks as any)).toEqual([{ heading: '規則', body: '1. a\n2. b\n1. c' }]);
  });

  it('does not split on headings nested inside a toggle', () => {
    const toggle = { type: 'toggle', toggle: { rich_text: [{ plain_text: '說明' }] }, children: [heading(2, '內層標題')] };
    expect(blocksToSections([heading(2, '外層'), toggle] as any)).toEqual([{ heading: '外層', body: '說明\n  內層標題' }]);
  });

  it('treats a heading with empty text as an untitled section start', () => {
    expect(blocksToSections([paragraph('a'), heading(2, ''), paragraph('b')] as any)).toEqual([
      { heading: '', body: 'a' },
      { heading: '', body: 'b' },
    ]);
  });

  it('returns no sections for no blocks', () => {
    expect(blocksToSections([])).toEqual([]);
  });
});

describe('readHeaderTable', () => {
  function row(...cells: string[]) {
    return { type: 'table_row', table_row: { cells: cells.map((c) => (c ? [{ plain_text: c }] : [])) } };
  }
  function table(hasHeader: boolean, ...rows: ReturnType<typeof row>[]) {
    return { type: 'table', table: { table_width: 3, has_column_header: hasHeader }, children: rows } as any;
  }

  it('keys each data row by the header text, trimming cells and filling short rows with ""', () => {
    const t = table(true, row('標題', '內容', 'column'), row(' 場地 ', '{COURT_COUNT}', 'narrow'), row('場租'));

    expect(readHeaderTable(t)).toEqual([
      { 標題: '場地', 內容: '{COURT_COUNT}', column: 'narrow' },
      { 標題: '場租', 內容: '', column: '' },
    ]);
  });

  it('gives [] for a header-only table, null for a table with no rows, and lets a later duplicate column win', () => {
    expect(readHeaderTable(table(true, row('標題', '內容')))).toEqual([]);
    expect(readHeaderTable(table(true))).toBeNull();
    expect(readHeaderTable(table(true, row('備註', '備註'), row('a', 'b')))).toEqual([{ 備註: 'b' }]);
  });

  it('returns null without a header row or for a non-table block, since columns have no names then', () => {
    expect(readHeaderTable(table(false, row('a', 'b')))).toBeNull();
    expect(readHeaderTable({ type: 'paragraph', paragraph: { rich_text: [] } } as any)).toBeNull();
  });
});
