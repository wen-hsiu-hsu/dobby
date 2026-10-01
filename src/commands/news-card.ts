import type { messagingApi } from '@line/bot-sdk';
import { FLEX_ICONS } from '../config/flex-assets.js';
import type { TextSection } from '../services/notion/blocks-to-text.js';
import { CARD_BG, CARD_TEXT, CARD_SUB, CARD_DIVIDER, badgeBox, messageButton, photoHero } from './flex-card-parts.js';

/**
 * 公告卡（`@Dobby 公告`）：照片標題區（季度＋徽章＋「本季公告」＋人數／次數）＋依 Notion
 * NEWS_TEMPLATE 的標題切出來的段落（`blocksToSections`）＋底部兩顆按鈕。
 * 純 JSON 組裝，方便單元測試。設計取捨見 ADR 0015。
 *
 * 每段的標題是灰色小字、內文是 Notion 文字原樣（換行保留、自動折行），段落之間畫細線。
 * 版面只認「標題」「分隔線」，內容全部照管理員在 Notion 打的字，不由程式決定。
 *
 * Flex 的 text 不能是空字串（LINE 會整則退回）：只有空白的標題／內文不畫，兩者都空的段落整段略過。
 * 公告很長時 bubble 可能超過 30KB，呼叫端要用 `fitsBubbleSizeLimit()` 檢查，超過就改送純文字。
 */

export interface NewsCardParams {
  /** 照片左上角的小字，例如「2026 Q4（10~12月）」。 */
  topText: string;
  /** 標題下的副標題，例如「共 10 人・13 次」。 */
  subtitle: string;
  /** 已經代入 placeholder 的段落。 */
  sections: TextSection[];
}

function sectionBox(heading: string, body: string): messagingApi.FlexBox {
  const contents: messagingApi.FlexComponent[] = [];
  if (heading) contents.push({ type: 'text', text: heading, size: 'xs', weight: 'bold', color: CARD_SUB, wrap: true });
  if (body) contents.push({ type: 'text', text: body, size: 'sm', color: CARD_TEXT, wrap: true });
  return { type: 'box', layout: 'vertical', spacing: '4px', paddingStart: '4px', paddingEnd: '4px', contents };
}

export function buildNewsBubble(params: NewsCardParams): messagingApi.FlexBubble {
  const { topText, subtitle, sections } = params;

  const sectionBoxes = sections
    .map((s) => ({ heading: s.heading.trim(), body: s.body.trim() ? s.body : '' }))
    .filter((s) => s.heading || s.body)
    .map((s) => sectionBox(s.heading, s.body));

  const bodyContents: messagingApi.FlexComponent[] = [];
  sectionBoxes.forEach((box, i) => {
    if (i > 0) bodyContents.push({ type: 'separator', color: CARD_DIVIDER });
    bodyContents.push(box);
  });
  bodyContents.push({
    type: 'box',
    layout: 'horizontal',
    spacing: '8px',
    margin: 'lg',
    contents: [messageButton('付款資訊', '@Dobby 付款', 1, true), messageButton('指令清單', '@Dobby 指令', 1, false)],
  });

  return {
    type: 'bubble',
    size: 'mega',
    hero: photoHero(topText, {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'md',
          alignItems: 'center',
          contents: [
            badgeBox('lime', FLEX_ICONS.megaphoneDark),
            { type: 'text', text: '本季公告', size: 'xl', weight: 'bold', color: '#FFFFFF', flex: 1 },
          ],
        },
        { type: 'text', text: subtitle, size: 'sm', color: '#FFFFFF', margin: 'xs', wrap: true },
      ],
    }),
    body: { type: 'box', layout: 'vertical', spacing: '12px', paddingAll: '16px', contents: bodyContents },
    styles: { hero: { backgroundColor: '#000000' }, body: { backgroundColor: CARD_BG } },
  };
}
