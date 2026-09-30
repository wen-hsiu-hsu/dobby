import type { messagingApi } from '@line/bot-sdk';

type FlexBubble = messagingApi.FlexBubble;

const NEW_ENTRY_BG = '#26331A';

/**
 * 卡片標題列（badge 底色／圖示 URL／標題／副標題），供 registration-handler.test.ts、
 * leave-handler.test.ts 斷言卡片 contents 本身，不只 altText。導覽路徑跟
 * flex-status-card.test.ts 的 heroOverlay／heroTitleRow 一致，見該檔案；這裡只是給
 * 跨測試檔共用的版本，避免各自重寫一份巢狀路徑。
 */
export function cardHeroSummary(bubble: FlexBubble): {
  badgeColor: string;
  badgeIconUrl: string;
  title: string;
  subtitle: string;
} {
  const overlay = (bubble.hero as any).contents[1];
  const innerBox = overlay.contents[1];
  const titleRow = innerBox.contents[0];
  const subtitleText = innerBox.contents[1];
  const badge = titleRow.contents[0];
  const titleText = titleRow.contents[1];

  return {
    badgeColor: badge.backgroundColor,
    badgeIconUrl: badge.contents[0].url,
    title: titleText.text,
    subtitle: subtitleText.text,
  };
}

/**
 * 零打名單的編號列（跳過抬頭列與空位合併列），用來確認「新增」底色只標在這次
 * 新增的條目上。用 numberBox 內層是 text（有編號）而不是 filler（空位合併行）
 * 來分辨編號列，見 flex-status-card.ts 的 numberBox／emptyRow。
 */
export function guestRows(bubble: FlexBubble): { name: string; isNew: boolean }[] {
  const rows = (bubble.body as any).contents[0].contents as any[];
  return rows
    .slice(1)
    .filter((row) => row.contents[0]?.contents?.[0]?.type === 'text')
    .map((row) => ({ name: row.contents[1].text as string, isNew: row.backgroundColor === NEW_ENTRY_BG }));
}
