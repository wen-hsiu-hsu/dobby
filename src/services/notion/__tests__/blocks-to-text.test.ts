import { describe, it, expect } from 'vitest';
import { blocksToText } from '../blocks-to-text.js';

function paragraph(text: string) {
  return { type: 'paragraph', paragraph: { rich_text: [{ plain_text: text }] } };
}

function bulletedListItem(text: string) {
  return { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: text }] } };
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
});
