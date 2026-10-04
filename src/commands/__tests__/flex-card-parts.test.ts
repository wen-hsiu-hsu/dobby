import { describe, it, expect } from 'vitest';
import { truncateAltText } from '../flex-card-parts.js';

describe('truncateAltText', () => {
  it('不超過 400 字時原樣回傳', () => {
    const text = 'a'.repeat(400);
    expect(truncateAltText(text)).toBe(text);
  });

  it('超過 400 字時截到 400 字並以「…」結尾', () => {
    const result = truncateAltText('a'.repeat(500));
    expect(result).toBe('a'.repeat(399) + '…');
  });

  it('截斷點落在 emoji 中間時，不留下半個 surrogate', () => {
    // 🏸 佔 2 個 UTF-16 code unit，前半剛好是第 399 個
    const result = truncateAltText('a'.repeat(398) + '🏸' + 'b'.repeat(10));

    expect(result).toBe('a'.repeat(398) + '…');
    expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('emoji 完整落在截斷點之前時保留', () => {
    const result = truncateAltText('a'.repeat(397) + '🏸' + 'b'.repeat(10));
    expect(result).toBe('a'.repeat(397) + '🏸' + '…');
    expect(result.length).toBe(400);
  });
});
