import { describe, it, expect } from 'vitest';
import { runWithContext, withPurpose, getReqId, getQuoteToken, getPurpose } from '../request-context.js';

describe('request-context', () => {
  it('runWithContext sets a reqId and optional quoteToken, both readable inside fn', async () => {
    await runWithContext(async () => {
      expect(getReqId()).toMatch(/^[0-9a-f]{6}$/);
      expect(getQuoteToken()).toBe('quote-1');
      expect(getPurpose()).toBeUndefined();
    }, 'quote-1');
  });

  it('withPurpose layers a purpose on top of an active reqId/quoteToken without losing them', async () => {
    await runWithContext(async () => {
      const reqIdBefore = getReqId();
      await withPurpose('查詢使用者資料', async () => {
        expect(getReqId()).toBe(reqIdBefore);
        expect(getQuoteToken()).toBe('quote-2');
        expect(getPurpose()).toBe('查詢使用者資料');
      });
      // purpose does not leak back out once withPurpose's fn resolves
      expect(getPurpose()).toBeUndefined();
      expect(getReqId()).toBe(reqIdBefore);
    }, 'quote-2');
  });

  it('withPurpose works standalone with no runWithContext active (e.g. scheduler code)', async () => {
    expect(getReqId()).toBeUndefined();
    await withPurpose('批次更新顯示名稱', async () => {
      expect(getReqId()).toBeUndefined();
      expect(getPurpose()).toBe('批次更新顯示名稱');
    });
  });

  it('nested withPurpose calls override the purpose for their own scope only', async () => {
    await withPurpose('外層目的', async () => {
      expect(getPurpose()).toBe('外層目的');
      await withPurpose('內層目的', async () => {
        expect(getPurpose()).toBe('內層目的');
      });
      expect(getPurpose()).toBe('外層目的');
    });
  });

  it('getReqId/getQuoteToken/getPurpose return undefined with no context active', () => {
    expect(getReqId()).toBeUndefined();
    expect(getQuoteToken()).toBeUndefined();
    expect(getPurpose()).toBeUndefined();
  });
});
