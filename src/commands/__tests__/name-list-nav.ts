import type { messagingApi } from '@line/bot-sdk';

/**
 * 名單卡（`../name-list-card.ts`）的導覽小工具，給 owe／participants 測試斷言卡片本身。
 * 路徑對應 buildNameListBubble 的結構：hero overlay 最後一個子元件是標題列那一塊。
 */
export function heroTitleOf(bubble: messagingApi.FlexBubble): { badgeColor: string; title: string; countLabel?: string } {
  const overlay = (bubble.hero as any).contents[1];
  const bottom = overlay.contents[overlay.contents.length - 1];
  const titleRow = bottom.contents[0].contents;
  return { badgeColor: titleRow[0].backgroundColor, title: titleRow[1].text, countLabel: titleRow[2]?.text };
}

/** 名單的每一列名字，依畫面順序。 */
export function listNamesOf(bubble: messagingApi.FlexBubble): string[] {
  const rows = (bubble.body as any).contents[0].contents as any[];
  return rows.map((row) => row.contents[1].text as string);
}
