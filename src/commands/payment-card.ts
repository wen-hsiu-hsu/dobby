import type { messagingApi } from '@line/bot-sdk';
import { FLEX_ICONS, flexAssetUrl } from '../config/flex-assets.js';
import { CARD_BG, CARD_TEXT, CARD_SUB, CARD_LIME, badgeBox, photoHero } from './flex-card-parts.js';
import type { PaymentMethod } from '../services/notion/payment-methods.js';

/**
 * 付款資訊卡（`@Dobby 付款`）：照片標題區（徽章＋「付款資訊」＋幾種付款方式）＋每種方式一格，
 * 有填帳號的那格右邊放「複製」按鈕（clipboard action，按下去把帳號原字串複製到剪貼簿）。
 * 純 JSON 組裝，方便單元測試。設計取捨見 ADR 0014。
 *
 * Flex 卡片不能長按複製文字，所以帳號一定要靠按鈕複製；clipboard action 要 LINE 14.0.0 以上。
 * `extraText` 是頁面上表格以外的內容（已轉成純文字），有的話放在列表下方，避免管理員
 * 在表格外補充的說明被吃掉。
 */

const ROW_BG = '#1F1F1F';
// LINE 規定 clipboard action 的 clipboardText 最多 1000 字，超過會整則退回。帳號格貼了長文時就不放按鈕。
const CLIPBOARD_MAX = 1000;
// Notion 的名稱格沒填（只填了帳號）時用這個，Flex 的 text 不能是空字串（LINE 會整則退回）。
const UNNAMED = '（未命名）';

/** 按下去把 `clipboardText` 複製到剪貼簿的小按鈕。Flex 的 button component 不能設粗體，所以用 box + text 畫。 */
function copyButton(clipboardText: string): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'horizontal',
    flex: 0,
    height: '36px',
    paddingStart: '12px',
    paddingEnd: '12px',
    spacing: '4px',
    cornerRadius: '8px',
    backgroundColor: CARD_LIME,
    justifyContent: 'center',
    alignItems: 'center',
    action: { type: 'clipboard', label: '複製帳號', clipboardText },
    contents: [
      { type: 'image', url: flexAssetUrl(FLEX_ICONS.copyDark), size: '14px', aspectMode: 'fit', aspectRatio: '1:1', flex: 0 },
      { type: 'text', text: '複製', size: 'sm', weight: 'bold', color: '#111111', flex: 0 },
    ],
  };
}

function methodRow(method: PaymentMethod): messagingApi.FlexBox {
  const info: messagingApi.FlexComponent[] = [
    { type: 'text', text: method.name || UNNAMED, size: 'md', weight: 'bold', color: CARD_TEXT, wrap: true },
  ];
  if (method.account) info.push({ type: 'text', text: method.account, size: 'md', color: CARD_TEXT, wrap: true });
  if (method.note) info.push({ type: 'text', text: method.note, size: 'xs', color: CARD_SUB, wrap: true });

  const contents: messagingApi.FlexComponent[] = [
    { type: 'box', layout: 'vertical', flex: 1, spacing: '2px', contents: info },
  ];
  if (method.account && method.account.length <= CLIPBOARD_MAX) contents.push(copyButton(method.account));

  return {
    type: 'box',
    layout: 'horizontal',
    spacing: '10px',
    alignItems: 'center',
    paddingAll: '12px',
    cornerRadius: '8px',
    backgroundColor: ROW_BG,
    contents,
  };
}

export function buildPaymentBubble(methods: PaymentMethod[], extraText: string): messagingApi.FlexBubble {
  const heroBottom: messagingApi.FlexBox = {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        alignItems: 'center',
        contents: [
          badgeBox('lime', FLEX_ICONS.creditCardDark),
          { type: 'text', text: '付款資訊', size: 'xl', weight: 'bold', color: '#FFFFFF', flex: 1 },
        ],
      },
      { type: 'text', text: `共 ${methods.length} 種付款方式`, size: 'sm', color: '#FFFFFF', margin: 'xs' },
    ],
  };

  const bodyContents: messagingApi.FlexComponent[] = [
    { type: 'box', layout: 'vertical', spacing: '6px', contents: methods.map(methodRow) },
  ];
  if (extraText) {
    bodyContents.push({ type: 'text', text: extraText, size: 'sm', color: CARD_SUB, wrap: true, margin: 'lg' });
  }

  return {
    type: 'bubble',
    size: 'mega',
    hero: photoHero(undefined, heroBottom),
    body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: bodyContents },
    styles: { hero: { backgroundColor: '#000000' }, body: { backgroundColor: CARD_BG } },
  };
}
