import { describe, it, expect } from 'vitest';
import { parseRegistrationTarget } from '../registration/registration-parser.js';

function makeEvent(text: string, mentionees: any[] = []) {
  return {
    message: { text, mention: { mentionees } },
    source: { userId: 'actor123' },
  };
}

describe('parseRegistrationTarget', () => {
  it('returns isSelf when no target specified', () => {
    const event = makeEvent('@Dobby +1');
    const result = parseRegistrationTarget(event as any);
    expect(result.isSelf).toBe(true);
  });

  it('returns targetUserId when mention has userId (mobile)', () => {
    const event = makeEvent('@Dobby +1 @Alice', [
      { type: 'user', userId: 'u999', index: 0, length: 6 },
      { type: 'user', userId: 'u123', index: 12, length: 6 },
    ]);
    const result = parseRegistrationTarget(event as any);
    expect(result.isSelf).toBe(false);
    expect(result.targetUserId).toBe('u123');
    expect(result.targetName).toBe('Alice');
  });

  it('returns targetName only when mention has no userId (PC)', () => {
    const event = makeEvent('@Dobby +1 @Bob', [
      { type: 'user', index: 0, length: 6 }, // no userId
    ]);
    const result = parseRegistrationTarget(event as any);
    expect(result.isSelf).toBe(false);
    expect(result.targetUserId).toBeUndefined();
    expect(result.targetName).toBe('Bob');
  });

  it('returns parseError when target not prefixed with @', () => {
    const event = makeEvent('@Dobby +1 Charlie');
    const result = parseRegistrationTarget(event as any);
    expect(result.parseError).toBeDefined();
  });

  it('handles full-width ＋ character', () => {
    const event = makeEvent('@Dobby ＋1');
    const result = parseRegistrationTarget(event as any);
    expect(result.isSelf).toBe(true);
  });
});
