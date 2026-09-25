import { describe, it, expect } from 'vitest';
import { blocksToText } from '../blocks-to-text.js';

function paragraph(text: string) {
  return { type: 'paragraph', paragraph: { rich_text: [{ plain_text: text }] } };
}

function bulletedListItem(text: string) {
  return { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: text }] } };
}

describe('blocksToText', () => {
  it('joins paragraph blocks with newlines, unprefixed', () => {
    const text = blocksToText([paragraph('hello'), paragraph('world')] as any);
    expect(text).toBe('hello\nworld');
  });

  it('prefixes bulleted_list_item blocks with "• "', () => {
    const text = blocksToText([paragraph('付款方式'), bulletedListItem('永豐銀行'), bulletedListItem('現金')] as any);
    expect(text).toBe('付款方式\n• 永豐銀行\n• 現金');
  });

  it('skips blocks with empty or missing rich_text', () => {
    const text = blocksToText([
      paragraph(''),
      { type: 'divider', divider: {} },
      paragraph('kept'),
    ] as any);
    expect(text).toBe('kept');
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
});
