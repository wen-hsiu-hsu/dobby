import { describe, it, expect } from 'vitest';
import { buildNameListBubble, fitsBubbleSizeLimit } from '../name-list-card.js';
import { FLEX_ICONS } from '../../config/flex-assets.js';

function owedCard(names: string[]) {
  return buildNameListBubble({
    badgeColor: 'orange',
    badgeIcon: FLEX_ICONS.circleDollarSignDark,
    title: '未繳費名單',
    countLabel: `${names.length} 位`,
    subtitle: '付款方式請點下方「付款資訊」',
    names,
    button: { label: '付款資訊', text: '@Dobby 付款' },
  });
}

function nameTexts(bubble: ReturnType<typeof owedCard>): any[] {
  return ((bubble.body as any).contents[0].contents as any[]).map((row) => row.contents[1]);
}

describe('buildNameListBubble', () => {
  it('wraps long names instead of truncating them', () => {
    const texts = nameTexts(owedCard(['Frank 的超長英文暱稱 Christopher', 'Amy']));
    expect(texts.map((t) => t.wrap)).toEqual([true, true]);
  });

  it('shows an empty Notion name as （未命名）, since LINE rejects an empty Flex text', () => {
    expect(nameTexts(owedCard(['Alice', ''])).map((t) => t.text)).toEqual(['Alice', '（未命名）']);
  });

  it('numbers rows from 1 in order', () => {
    const rows = (owedCard(['A', 'B', 'C']).body as any).contents[0].contents as any[];
    expect(rows.map((row) => row.contents[0].contents[0].text)).toEqual(['1', '2', '3']);
  });
});

describe('fitsBubbleSizeLimit', () => {
  // validate API 實測：60 人通過，65 人回「Too large flex message ... 30 KB」
  it('accepts 60 names and rejects 65', () => {
    const names = (k: number) => Array.from({ length: k }, (_, i) => `成員${i + 1}`);
    expect(fitsBubbleSizeLimit(owedCard(names(60)))).toBe(true);
    expect(fitsBubbleSizeLimit(owedCard(names(65)))).toBe(false);
  });
});
