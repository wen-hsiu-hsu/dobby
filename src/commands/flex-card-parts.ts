import type { messagingApi } from '@line/bot-sdk';
import { flexAssetUrl, FLEX_ICONS } from '../config/flex-assets.js';

/**
 * 深色螢光綠 Flex 卡片的共用色票與元件。報名／請假／週報狀態卡
 * （`registration/flex-status-card.ts`）、指令清單卡（`command-list-card.ts`）、
 * 名單卡（`name-list-card.ts`：欠費、報名人）共用同一張照片標題區、同樣的徽章與按鈕，
 * 改這裡所有卡片會一起變。
 */

export const CARD_BG = '#161616';
export const CARD_TEXT = '#F5F5F5';
export const CARD_SUB = '#A3A3A3';
export const CARD_DIVIDER = '#2E2E2E';
export const CARD_LIME = '#A3E635'; // 主按鈕／強調色
export const CARD_BUTTON_BORDER = '#3F3F3F';

/** 徽章底色，key 是呼叫端要指定的名稱。 */
export const BADGE_COLORS = {
  lime: CARD_LIME,
  gray: '#737373',
  orange: '#FB923C',
  blue: '#60A5FA',
} as const;
export type BadgeColorName = keyof typeof BADGE_COLORS;

export function badgeBox(colorName: BadgeColorName, iconFile: string): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    width: '28px',
    height: '28px',
    cornerRadius: '14px',
    flex: 0,
    backgroundColor: BADGE_COLORS[colorName],
    justifyContent: 'center',
    alignItems: 'center',
    contents: [{ type: 'image', url: flexAssetUrl(iconFile), size: '16px', aspectMode: 'fit', aspectRatio: '1:1' }],
  };
}

/** 按下去等同使用者自己打 `text` 的按鈕。Flex 的 button component 不能設粗體，所以用 box + text 畫。 */
export function messageButton(label: string, text: string, flex: number, primary: boolean): messagingApi.FlexBox {
  const b: messagingApi.FlexBox = {
    type: 'box',
    layout: 'vertical',
    flex,
    height: '40px',
    cornerRadius: '8px',
    justifyContent: 'center',
    action: { type: 'message', label, text },
    contents: [{ type: 'text', text: label, size: 'sm', weight: 'bold', align: 'center', color: primary ? '#111111' : CARD_TEXT }],
  };
  if (primary) {
    b.backgroundColor = CARD_LIME;
  } else {
    b.borderWidth = '1px';
    b.borderColor = CARD_BUTTON_BORDER;
  }
  return b;
}

/**
 * 照片標題區（bubble 的 hero）：羽球照片（300:170）＋由下往上變暗的漸層，文字壓在照片上。
 * `topText` 放左上角；不給就只有底部的 `bottom`（徽章＋標題＋副標題那一塊）。
 * 照片比例固定 300:170，所有卡片共用同一張 `header-shuttle.jpg`，不要為單一卡片改比例。
 */
export function photoHero(topText: string | undefined, bottom: messagingApi.FlexBox): messagingApi.FlexBox {
  const overlayContents: messagingApi.FlexComponent[] = [];
  if (topText !== undefined) {
    overlayContents.push({ type: 'text', text: topText, size: 'sm', weight: 'bold', color: '#FFFFFF' });
  }
  overlayContents.push(bottom);

  return {
    type: 'box',
    layout: 'vertical',
    paddingAll: '0px',
    contents: [
      {
        type: 'image',
        url: flexAssetUrl(FLEX_ICONS.headerShuttle),
        size: 'full',
        aspectMode: 'cover',
        aspectRatio: '300:170',
      },
      {
        type: 'box',
        layout: 'vertical',
        position: 'absolute',
        offsetTop: '0px',
        offsetBottom: '0px',
        offsetStart: '0px',
        offsetEnd: '0px',
        paddingTop: '14px',
        paddingBottom: '14px',
        paddingStart: '20px',
        paddingEnd: '20px',
        justifyContent: topText !== undefined ? 'space-between' : 'flex-end',
        background: {
          type: 'linearGradient',
          angle: '0deg',
          startColor: '#000000D9',
          centerColor: '#0000001A',
          endColor: '#00000059',
          centerPosition: '65%',
        },
        contents: overlayContents,
      },
    ],
  };
}

const ALT_TEXT_MAX = 400;

/**
 * altText 統一截在 400 字（沿用改 Flex 前就有的上限），超過就截斷並補「…」。
 * 長度以 UTF-16 code unit 計算；截斷點落在 emoji（surrogate pair）中間時，去掉孤立的前半個 surrogate，
 * 否則通知預覽會在「…」前多一個亂碼字元。ZWJ 組合 emoji 仍可能被拆成幾個獨立 emoji，不會變亂碼，不另處理。
 */
export function truncateAltText(text: string): string {
  if (text.length <= ALT_TEXT_MAX) return text;
  return text.slice(0, ALT_TEXT_MAX - 1).replace(/[\uD800-\uDBFF]$/, '') + '…';
}
