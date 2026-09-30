import { describe, it, expect } from 'vitest';
import { summarizeMessageForLog } from '../message-summary.js';

describe('summarizeMessageForLog', () => {
  it('returns .text for text messages', () => {
    expect(summarizeMessageForLog({ type: 'text', text: 'hello' } as any)).toBe('hello');
  });

  it('returns "[flex] <altText>" for flex messages, not just "[flex]"', () => {
    const result = summarizeMessageForLog({
      type: 'flex',
      altText: '本週打球・不能到請喊聲',
      contents: { type: 'bubble' },
    } as any);
    expect(result).toBe('[flex] 本週打球・不能到請喊聲');
  });

  it('falls back to "[type]" for other message types', () => {
    expect(summarizeMessageForLog({ type: 'sticker', packageId: '1', stickerId: '2' } as any)).toBe('[sticker]');
  });
});
