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
});
