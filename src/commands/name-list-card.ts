import type { messagingApi } from '@line/bot-sdk';
import {
  CARD_BG,
  CARD_TEXT,
  CARD_SUB,
  badgeBox,
  messageButton,
  photoHero,
  type BadgeColorName,
} from './flex-card-parts.js';

/**
 * 名單卡：未繳費名單（`owe.ts`）跟本季報名人（`participants.ts`）共用的 Flex 版面——
 * 照片標題區（徽章＋標題＋右側人數＋可選副標題）＋編號單欄名單＋可選的一顆按鈕。
 * 純 JSON 組裝，方便單元測試。設計取捨見 ADR 0013。
 *
 * 名單一律完整列出、單欄、名字過長就換行，不截斷也不用「…」／「等 N 人」。
 * `names` 是空陣列時整張卡只剩標題區（空狀態），不畫 body。
 *
 * 每列約 450 bytes，LINE 單一 bubble 的 JSON 上限 30KB，大約 60 人就會超過；超過時 LINE
 * 會整則退回，而 reply-service 只記 warn，使用者什麼都收不到。呼叫端要先用
 * `fitsBubbleSizeLimit()` 檢查，超過就改回純文字。
 */

const ROW_BG = '#1F1F1F';
// LINE 規定單一 bubble 的 JSON 最多 30KB（validate API 實測 65 人時回「Too large flex message」）。
// 抓 30000 bytes，比 30KB 略保守。
const BUBBLE_MAX_BYTES = 30000;
// Notion 的 Name 沒填時會是空字串，Flex 的 text 不能是空字串（LINE 會整則退回）。
const UNNAMED = '（未命名）';

export function fitsBubbleSizeLimit(bubble: messagingApi.FlexBubble): boolean {
  return Buffer.byteLength(JSON.stringify(bubble), 'utf8') <= BUBBLE_MAX_BYTES;
}

export interface NameListCardParams {
  /** 照片左上角的小字，例如季度；不給就不顯示。 */
  topText?: string;
  badgeColor: BadgeColorName;
  /** FLEX_ICONS 的檔名。 */
  badgeIcon: string;
  title: string;
  /** 標題列右側的人數文字，例如「5 位」；不給就不顯示。 */
  countLabel?: string;
  subtitle?: string;
  names: string[];
  /** 名單下方的一顆主按鈕（message action）。只在 names 非空時顯示。 */
  button?: { label: string; text: string };
}

function nameRow(n: number, name: string): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: '8px',
    paddingTop: '6px',
    paddingBottom: '6px',
    paddingStart: '10px',
    paddingEnd: '10px',
    cornerRadius: '6px',
    backgroundColor: ROW_BG,
    contents: [
      // 固定寬度讓兩位數編號也對齊；名字換行時編號留在第一行
      {
        type: 'box',
        layout: 'vertical',
        width: '20px',
        flex: 0,
        paddingTop: '1px',
        contents: [{ type: 'text', text: String(n), size: 'xs', color: CARD_SUB, align: 'end' }],
      },
      { type: 'text', text: name || UNNAMED, size: 'sm', color: CARD_TEXT, flex: 1, wrap: true },
    ],
  };
}

export function buildNameListBubble(params: NameListCardParams): messagingApi.FlexBubble {
  const { topText, badgeColor, badgeIcon, title, countLabel, subtitle, names, button } = params;

  const titleRow: messagingApi.FlexComponent[] = [
    badgeBox(badgeColor, badgeIcon),
    { type: 'text', text: title, size: 'xl', weight: 'bold', color: '#FFFFFF', flex: 1 },
  ];
  if (countLabel !== undefined) {
    titleRow.push({ type: 'text', text: countLabel, size: 'md', weight: 'bold', color: '#FFFFFF', align: 'end', flex: 0 });
  }
  const heroBottom: messagingApi.FlexComponent[] = [
    { type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', contents: titleRow },
  ];
  if (subtitle) {
    heroBottom.push({ type: 'text', text: subtitle, size: 'sm', color: '#FFFFFF', margin: 'xs', wrap: true });
  }

  const bubble: messagingApi.FlexBubble = {
    type: 'bubble',
    size: 'mega',
    hero: photoHero(topText, { type: 'box', layout: 'vertical', contents: heroBottom }),
    styles: { hero: { backgroundColor: '#000000' } },
  };

  if (names.length > 0) {
    const bodyContents: messagingApi.FlexComponent[] = [
      { type: 'box', layout: 'vertical', spacing: '4px', contents: names.map((name, i) => nameRow(i + 1, name)) },
    ];
    if (button) {
      bodyContents.push({
        type: 'box',
        layout: 'horizontal',
        margin: 'lg',
        contents: [messageButton(button.label, button.text, 1, true)],
      });
    }
    bubble.body = {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      contents: bodyContents,
    };
    bubble.styles = { ...bubble.styles, body: { backgroundColor: CARD_BG } };
  }

  return bubble;
}
