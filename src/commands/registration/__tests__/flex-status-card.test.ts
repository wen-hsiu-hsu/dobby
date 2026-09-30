import { describe, it, expect } from 'vitest';
import { buildStatusCardBubble, buildStatusCardAltText, BADGE_COLORS, type StatusCardParams } from '../flex-status-card.js';
import { FLEX_ASSET_ROOT, FLEX_ICONS } from '../../../config/flex-assets.js';

function baseParams(overrides: Partial<StatusCardParams> = {}): StatusCardParams {
  return {
    date: '2026-10-03',
    headline: '報名成功 ✅',
    badgeColor: 'lime',
    badgeIcon: FLEX_ICONS.checkDark,
    title: '報名成功',
    subtitle: 'Alice 報名 1 位',
    guests: ['Alice的朋友', 'Bob'],
    newGuestCount: 1,
    totalSlots: 6,
    presentSeasonMembers: 8,
    guestFee: 200,
    absenteeNames: ['志豪', '佩琪'],
    ...overrides,
  };
}

// ── 導覽用小工具：卡片是巢狀 box/contents，測試只在乎特定節點存不存在、值對不對 ──

function heroOverlay(bubble: ReturnType<typeof buildStatusCardBubble>): any {
  return (bubble.hero as any).contents[1];
}

function heroTitleRow(bubble: ReturnType<typeof buildStatusCardBubble>): any {
  return heroOverlay(bubble).contents[1].contents[0];
}

function guestSectionRows(bubble: ReturnType<typeof buildStatusCardBubble>): any[] {
  return (bubble.body as any).contents[0].contents;
}

function footerButtons(bubble: ReturnType<typeof buildStatusCardBubble>): any[] {
  return (bubble.footer as any).contents;
}

describe('buildStatusCardBubble', () => {
  describe('徽章顏色／圖示／標題（依狀態）', () => {
    it.each([
      ['報名成功', 'lime', FLEX_ICONS.checkDark],
      ['取消報名成功', 'gray', FLEX_ICONS.minusWhite],
      ['名額不足', 'orange', FLEX_ICONS.banDark],
      ['請假成功', 'blue', FLEX_ICONS.calendarXDark],
      ['銷假成功', 'lime', FLEX_ICONS.calendarCheckDark],
      ['已經請過假', 'gray', FLEX_ICONS.infoWhite],
    ] as const)('%s → badgeColor=%s, badgeIcon=%s', (title, badgeColor, badgeIcon) => {
      const bubble = buildStatusCardBubble(baseParams({ title, badgeColor, badgeIcon, newGuestCount: 0 }));
      const titleRow = heroTitleRow(bubble);
      const badge = titleRow.contents[0];
      const titleText = titleRow.contents[1];

      expect(badge.backgroundColor).toBe(BADGE_COLORS[badgeColor]);
      expect(badge.contents[0]).toMatchObject({ type: 'image', url: `${FLEX_ASSET_ROOT}${badgeIcon}`, aspectMode: 'fit', aspectRatio: '1:1' });
      expect(titleText).toMatchObject({ type: 'text', text: title });
    });

    it('副標題（subtitle）出現在徽章列下方，不是 headline', () => {
      const bubble = buildStatusCardBubble(baseParams({ subtitle: 'Alice 報名 1 位（名額已滿，原本要求 2 位）', headline: '報名成功 ✅（名額已達上限，僅報名 1 位，您原本要求 2 位）' }));
      const subtitleText = heroOverlay(bubble).contents[1].contents[1];
      expect(subtitleText).toMatchObject({ type: 'text', text: 'Alice 報名 1 位（名額已滿，原本要求 2 位）' });
    });
  });

  describe('標題列日期／費用／剩餘名額', () => {
    it('日期從 YYYY-MM-DD 算出週幾，不是寫死「六」', () => {
      // 2026-10-03 is a Saturday
      const bubble = buildStatusCardBubble(baseParams({ date: '2026-10-03', guestFee: 200 }));
      const dateText = heroOverlay(bubble).contents[0];
      expect(dateText.text).toBe('10/03（六）・零打 $200/人');
    });

    it('週幾隨日期改變（用同一個函式算，不是固定值）', () => {
      // 2026-10-04 is a Sunday
      const bubble = buildStatusCardBubble(baseParams({ date: '2026-10-04' }));
      const dateText = heroOverlay(bubble).contents[0];
      expect(dateText.text).toBe('10/04（日）・零打 $200/人');
    });

    it('剩餘 > 0 顯示「剩 N 位」', () => {
      const bubble = buildStatusCardBubble(baseParams({ guests: ['A', 'B'], totalSlots: 6, newGuestCount: 0 }));
      const titleRow = heroTitleRow(bubble);
      expect(titleRow.contents[2]).toMatchObject({ text: '剩 4 位' });
    });

    it('剩餘 = 0 顯示「已額滿」', () => {
      const bubble = buildStatusCardBubble(baseParams({ guests: ['A', 'B', 'C', 'D', 'E', 'F'], totalSlots: 6, newGuestCount: 0 }));
      const titleRow = heroTitleRow(bubble);
      expect(titleRow.contents[2]).toMatchObject({ text: '已額滿' });
    });
  });

  describe('totalSlots 為 0／負數時（資料異動，見 capacity-calculator.ts）不顯示負數或 NaN', () => {
    it('headRow 的名額顯示 clamp 到 0，不是「0 / -1」', () => {
      const bubble = buildStatusCardBubble(baseParams({ guests: [], totalSlots: -1, newGuestCount: 0 }));
      const rows = guestSectionRows(bubble);
      expect(rows[0].contents[1]).toMatchObject({ text: '0 / 0' });
    });

    it('剩餘名額不是負數，顯示「已額滿」', () => {
      const bubble = buildStatusCardBubble(baseParams({ guests: [], totalSlots: -1, newGuestCount: 0 }));
      const titleRow = heroTitleRow(bubble);
      expect(titleRow.contents[2]).toMatchObject({ text: '已額滿' });
    });

    it('進度條不是 NaN%（totalSlots <= 0 時維持 0 條）', () => {
      const bubble = buildStatusCardBubble(baseParams({ guests: [], totalSlots: 0, newGuestCount: 0 }));
      const bar = heroOverlay(bubble).contents[1].contents[2];
      expect(bar.contents).toEqual([{ type: 'filler' }]);
    });

    it('altText 的零打名額顯示也 clamp 到 0', () => {
      const altText = buildStatusCardAltText(baseParams({ guests: [], totalSlots: -1, newGuestCount: 0 }));
      expect(altText).toContain('零打名額 0 人');
      expect(altText).not.toContain('零打名額 -1');
    });
  });

  describe('進度條', () => {
    it('零打數為 0 時不放內層 filled bar（只有 filler）', () => {
      const bubble = buildStatusCardBubble(baseParams({ guests: [], totalSlots: 6, newGuestCount: 0 }));
      const bar = heroOverlay(bubble).contents[1].contents[2];
      expect(bar.contents).toEqual([{ type: 'filler' }]);
    });

    it('零打數 > 0 時內層 bar 寬度 = min(1, 零打數/總名額) 的百分比', () => {
      const bubble = buildStatusCardBubble(baseParams({ guests: ['A', 'B', 'C'], totalSlots: 6, newGuestCount: 0 }));
      const bar = heroOverlay(bubble).contents[1].contents[2];
      expect(bar.contents[0]).toMatchObject({ width: '50%' });
    });

    it('零打數超過總名額時，寬度不超過 100%（clamp）', () => {
      const bubble = buildStatusCardBubble(baseParams({ guests: ['A', 'B', 'C', 'D'], totalSlots: 2, newGuestCount: 0 }));
      const bar = heroOverlay(bubble).contents[1].contents[2];
      expect(bar.contents[0]).toMatchObject({ width: '100%' });
    });
  });

  describe('零打名單：只列已報名者，空位合併成一行', () => {
    it('零打數 0 時顯示「尚無人報名・N 個名額都還空著」', () => {
      const bubble = buildStatusCardBubble(baseParams({ guests: [], totalSlots: 6, newGuestCount: 0 }));
      const rows = guestSectionRows(bubble);
      // rows[0] is the "零打名單" head row; no numbered guest rows follow, then the merged empty row
      expect(rows).toHaveLength(2);
      expect(rows[1]).toMatchObject({ backgroundColor: '#222222' });
      expect(rows[1].contents[1]).toMatchObject({ text: '尚無人報名・6 個名額都還空著' });
    });

    it('部分報名時顯示「還有 N 個空位」，且不列空位本身的編號行', () => {
      const bubble = buildStatusCardBubble(baseParams({ guests: ['Alice的朋友', 'Bob'], totalSlots: 6, newGuestCount: 0 }));
      const rows = guestSectionRows(bubble);
      // head + 2 guest rows + 1 merged empty row = 4
      expect(rows).toHaveLength(4);
      expect(rows[3].contents[1]).toMatchObject({ text: '還有 4 個空位' });
    });

    it('額滿時不出現空位合併行', () => {
      const bubble = buildStatusCardBubble(baseParams({ guests: ['A', 'B', 'C', 'D', 'E', 'F'], totalSlots: 6, newGuestCount: 0 }));
      const rows = guestSectionRows(bubble);
      // head + 6 guest rows, no trailing empty row
      expect(rows).toHaveLength(7);
    });
  });

  describe('「新增」標記', () => {
    it('只標在這次新增的條目（guests 尾端 newGuestCount 筆）', () => {
      const bubble = buildStatusCardBubble(
        baseParams({ guests: ['Alice的朋友', 'Bob', 'Cathy'], totalSlots: 6, newGuestCount: 2 })
      );
      const rows = guestSectionRows(bubble);
      const [, row1, row2, row3] = rows; // head, Alice的朋友, Bob, Cathy

      expect(row1.backgroundColor).toBeUndefined();
      expect(row1.contents.map((c: any) => c.text)).not.toContain('新增');

      expect(row2.backgroundColor).toBe('#26331A');
      expect(row2.contents.at(-1)).toMatchObject({ text: '新增', color: '#A3E635' });

      expect(row3.backgroundColor).toBe('#26331A');
      expect(row3.contents.at(-1)).toMatchObject({ text: '新增' });
    });

    it('非報名成功分支（newGuestCount=0）完全沒有「新增」標記', () => {
      const bubble = buildStatusCardBubble(baseParams({ guests: ['Alice的朋友', 'Bob'], newGuestCount: 0 }));
      const rows = guestSectionRows(bubble);
      for (const row of rows) {
        expect(row.backgroundColor).not.toBe('#26331A');
      }
    });
  });

  describe('請假名單：永遠完整列出，不截斷', () => {
    it('15 個人名全部都在，text wrap 但沒有 maxLines', () => {
      const names = Array.from({ length: 15 }, (_, i) => `假人${i + 1}`);
      const bubble = buildStatusCardBubble(baseParams({ absenteeNames: names }));
      const leaveSection = (bubble.body as any).contents[2];
      const leaveText = leaveSection.contents[1];

      expect(leaveText.text).toBe(names.join('、'));
      expect(leaveText.wrap).toBe(true);
      expect(leaveText.maxLines).toBeUndefined();

      const headRow = leaveSection.contents[0];
      expect(headRow.contents[1]).toMatchObject({ text: '15 人' });
    });

    it('沒人請假顯示「無」', () => {
      const bubble = buildStatusCardBubble(baseParams({ absenteeNames: [] }));
      const leaveSection = (bubble.body as any).contents[2];
      expect(leaveSection.contents[1].text).toBe('無');
      expect(leaveSection.contents[0].contents[1]).toMatchObject({ text: '0 人' });
    });

    it('Notion 名字空白的請假人顯示「（未命名）」，避免只有一人時出現 LINE 會退回的空字串 text', () => {
      const bubble = buildStatusCardBubble(baseParams({ absenteeNames: [''] }));
      expect((bubble.body as any).contents[2].contents[1].text).toBe('（未命名）');
    });
  });

  describe('本週出席', () => {
    it('span 顯示大數字 + 說明文字', () => {
      const bubble = buildStatusCardBubble(baseParams({ guests: ['A', 'B'], presentSeasonMembers: 8, newGuestCount: 0 }));
      const presentRow = (bubble.body as any).contents[4];
      const spans = presentRow.contents[1].contents;
      expect(spans[0]).toMatchObject({ type: 'span', text: '10' });
      expect(spans[1]).toMatchObject({ type: 'span', text: ' 人（季租 8・零打 2）' });
    });
  });

  describe('按鈕：message action 的精確文字', () => {
    it('三顆按鈕的 label／action text 完全符合指令語法', () => {
      const bubble = buildStatusCardBubble(baseParams());
      const [plusOne, minusOne, leave] = footerButtons(bubble);

      expect(plusOne.action).toEqual({ type: 'message', label: '+1 零打', text: '@Dobby +1' });
      expect(minusOne.action).toEqual({ type: 'message', label: '−1 零打', text: '@Dobby -1' });
      expect(leave.action).toEqual({ type: 'message', label: '請假', text: '@Dobby 假' });

      // −1 用的是減號 U+2212，不是連字號
      expect(minusOne.action.label.codePointAt(0)).toBe(0x2212);
    });

    it('按鈕用 box 自繪，不是 Flex 的 button component（不能設粗體）', () => {
      const bubble = buildStatusCardBubble(baseParams());
      for (const b of footerButtons(bubble)) {
        expect(b.type).toBe('box');
      }
    });
  });

  describe('3 面場極端情況（17 名額、12 零打、6 請假）', () => {
    const extreme = baseParams({
      guests: Array.from({ length: 12 }, (_, i) => `零打${i + 1}的一個很長很長的暱稱`),
      newGuestCount: 3,
      totalSlots: 17,
      presentSeasonMembers: 15,
      absenteeNames: ['假人1', '假人2', '假人3', '假人4', '假人5', '假人6'],
    });

    it('JSON.stringify 後小於 30KB', () => {
      const bubble = buildStatusCardBubble(extreme);
      const bytes = Buffer.byteLength(JSON.stringify(bubble), 'utf8');
      expect(bytes).toBeLessThan(30 * 1024);
    });

    it('altText 不超過 400 字', () => {
      const altText = buildStatusCardAltText(extreme);
      expect(altText.length).toBeLessThanOrEqual(400);
    });
  });
});

describe('buildStatusCardBubble（paused，週報／next 暫停週卡片用，見 weekly-status-message.ts）', () => {
  function pausedParams(overrides: Partial<StatusCardParams> = {}): StatusCardParams {
    return baseParams({
      title: '本週活動暫停',
      badgeColor: 'gray',
      badgeIcon: FLEX_ICONS.banDark,
      guests: [],
      newGuestCount: 0,
      absenteeNames: [],
      paused: true,
      pausedNote: '本週因故暫停，恢復後另行公告',
      ...overrides,
    });
  }

  it('標題列只有徽章＋標題，沒有「剩 N 位／已額滿」', () => {
    const bubble = buildStatusCardBubble(pausedParams());
    const titleRow = heroTitleRow(bubble);
    expect(titleRow.contents).toHaveLength(2);
    expect(titleRow.contents[1]).toMatchObject({ text: '本週活動暫停' });
  });

  it('沒有副標題、沒有進度條（innerBox 只有標題列一個元素）', () => {
    const bubble = buildStatusCardBubble(pausedParams());
    const innerBox = heroOverlay(bubble).contents[1];
    expect(innerBox.contents).toHaveLength(1);
  });

  it('日期與費用行仍然保留（跟正常週同格式）', () => {
    const bubble = buildStatusCardBubble(pausedParams({ date: '2026-10-03', guestFee: 200 }));
    const dateText = heroOverlay(bubble).contents[0];
    expect(dateText.text).toBe('10/03（六）・零打 $200/人');
  });

  it('body 沒有零打名單／請假／本週出席三段，只有一行灰字說明', () => {
    const bubble = buildStatusCardBubble(pausedParams());
    const rows = (bubble.body as any).contents;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'text', text: '本週因故暫停，恢復後另行公告', color: '#A3A3A3' });
  });

  it('沒有 footer（暫停週沒有可操作的按鈕）', () => {
    const bubble = buildStatusCardBubble(pausedParams());
    expect(bubble.footer).toBeUndefined();
    expect((bubble.styles as any).footer).toBeUndefined();
  });
});

describe('buildStatusCardAltText（paused）', () => {
  it('只含 headline、日期、pausedNote，沒有名額／零打名單／請假', () => {
    const altText = buildStatusCardAltText(
      baseParams({
        headline: '本週活動暫停',
        date: '2026-09-26',
        paused: true,
        pausedNote: '本週因故暫停，恢復後另行公告',
      })
    );

    expect(altText).toBe('本週活動暫停\n\n2026-09-26\n本週因故暫停，恢復後另行公告');
  });
});

describe('buildStatusCardAltText', () => {
  it('保留 headline、日期、零打名額與費用、剩餘名額、請假、總人數', () => {
    const altText = buildStatusCardAltText(baseParams({ newGuestCount: 0 }));

    expect(altText).toContain('報名成功 ✅');
    expect(altText).toContain('2026-10-03');
    expect(altText).toContain('零打名額 6 人 | $200/人');
    expect(altText).toContain('1. Alice的朋友');
    expect(altText).toContain('2. Bob');
    expect(altText).toContain('剩餘名額：4 人');
    expect(altText).toContain('請假：志豪、佩琪');
    expect(altText).toContain('總人數：共 10 人');
  });

  it('不含空位列，也不含「若要報名請輸入 @Dobby +1」', () => {
    const altText = buildStatusCardAltText(baseParams({ guests: ['Alice的朋友'], totalSlots: 6, newGuestCount: 0 }));
    expect(altText).not.toContain('若要報名');
    expect(altText).not.toContain('3. ');
  });

  it('超過 400 字時截斷並以「…」結尾', () => {
    const manyAbsentees = Array.from({ length: 200 }, (_, i) => `一個很長很長的假人名字編號${i + 1}`);
    const altText = buildStatusCardAltText(baseParams({ absenteeNames: manyAbsentees }));

    expect(altText.length).toBe(400);
    expect(altText.endsWith('…')).toBe(true);
  });
});
