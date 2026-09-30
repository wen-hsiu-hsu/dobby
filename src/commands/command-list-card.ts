import type { messagingApi } from '@line/bot-sdk';
import { flexAssetUrl, FLEX_ICONS } from '../config/flex-assets.js';
import {
  CARD_BG,
  CARD_TEXT,
  CARD_SUB,
  CARD_DIVIDER,
  CARD_BUTTON_BORDER,
  badgeBox,
  messageButton,
  photoHero,
  truncateAltText,
} from './flex-card-parts.js';

/**
 * `@Dobby command`／`@Dobby 指令` 的 Flex 卡片——純 JSON 組裝，方便單元測試。
 * 版面跟報名狀態卡同一套（照片標題區、深色螢光綠），設計稿見 ADR 0012。
 *
 * 每個不需要參數的指令一列，點下去等同使用者自己打那行指令（message action）；
 * 要帶數字或名字的（`+N`、代他人操作）做不成按鈕，只放文字提示。
 */

const ROW_BG = '#1F1F1F';
const ROW_ICON_BG = '#2A2A2A';
const FOOTNOTE = '#737373';

export interface CommandListCardParams {
  isAdmin: boolean;
  /** 「下一季公告草稿」按鈕要產生的季度，canonical "YYYY-QN"（例如 "2026-Q4"）。只有 isAdmin 時用得到。 */
  nextSeasonName: string;
}

function icon(file: string): messagingApi.FlexImage {
  return { type: 'image', url: flexAssetUrl(file), size: '16px', aspectMode: 'fit', aspectRatio: '1:1', flex: 0 };
}

/** 區塊小標：16px 灰色圖示 + 文字。 */
function sectionHead(iconFile: string, label: string): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: '6px',
    alignItems: 'center',
    paddingStart: '4px',
    contents: [icon(iconFile), { type: 'text', text: label, size: 'xs', weight: 'bold', color: CARD_SUB }],
  };
}

function rowIcon(iconFile: string, bg: string): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    width: '32px',
    height: '32px',
    cornerRadius: '16px',
    flex: 0,
    backgroundColor: bg,
    justifyContent: 'center',
    alignItems: 'center',
    contents: [icon(iconFile)],
  };
}

function rowLabels(label: string, detail: string): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    contents: [
      { type: 'text', text: label, size: 'sm', weight: 'bold', color: CARD_TEXT },
      { type: 'text', text: detail, size: 'xs', color: CARD_SUB, margin: '2px', wrap: true },
    ],
  };
}

/** 可點的一列：左側圖示、中間名稱＋實際指令文字、右側箭頭；點下去送出 `command`。 */
function commandRow(iconFile: string, label: string, command: string): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    alignItems: 'center',
    paddingAll: '10px',
    cornerRadius: '10px',
    backgroundColor: ROW_BG,
    action: { type: 'message', label, text: command },
    contents: [rowIcon(iconFile, ROW_ICON_BG), rowLabels(label, command), icon(FLEX_ICONS.chevronRightDim)],
  };
}

/** 不能點的一列（要自己輸入參數的指令）：只有外框、沒有箭頭。 */
function hintRow(iconFile: string, label: string, hint: string): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    alignItems: 'center',
    paddingAll: '10px',
    cornerRadius: '10px',
    borderWidth: '1px',
    borderColor: CARD_BUTTON_BORDER,
    contents: [rowIcon(iconFile, '#222222'), rowLabels(label, hint)],
  };
}

function section(head: messagingApi.FlexBox, items: messagingApi.FlexComponent[]): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    contents: [head, { type: 'box', layout: 'vertical', spacing: '6px', contents: items }],
  };
}

function note(text: string, color: string, size: 'xs' | 'xxs'): messagingApi.FlexText {
  return { type: 'text', text, size, color, wrap: true, offsetStart: '4px' };
}

/** "2026-Q4" → "2026Q4"：跟 docs/commands.md 裡 `@Dobby season 2026Q2` 的寫法一致（兩種 parser 都吃）。 */
function seasonArg(seasonName: string): string {
  return seasonName.replace('-', '');
}

export function buildCommandListBubble({ isAdmin, nextSeasonName }: CommandListCardParams): messagingApi.FlexBubble {
  const separator: messagingApi.FlexSeparator = { type: 'separator', color: CARD_DIVIDER };

  const bodyContents: messagingApi.FlexComponent[] = [
    section(sectionHead(FLEX_ICONS.searchGray, '查詢'), [
      commandRow(FLEX_ICONS.usersLight, '本季報名人', '@Dobby 報名人'),
      commandRow(FLEX_ICONS.megaphoneLight, '最新公告', '@Dobby 公告'),
      commandRow(FLEX_ICONS.creditCardLight, '付款資訊', '@Dobby 付款'),
      commandRow(FLEX_ICONS.circleDollarSignLight, '未繳費名單', '@Dobby 欠'),
      commandRow(FLEX_ICONS.botLight, 'Dobby 自我介紹', '@Dobby'),
    ]),
    separator,
    section(sectionHead(FLEX_ICONS.calendarGray, '本週報名／請假'), [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [messageButton('+1 零打', '@Dobby +1', 1, true), messageButton('−1 零打', '@Dobby -1', 1, false)],
      },
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [messageButton('請假', '@Dobby 假', 1, false), messageButton('銷假', '@Dobby 銷假', 1, false)],
      },
      note('一次報名多位請自己輸入 @Dobby +2、+3…\n請假、銷假限季租成員', CARD_SUB, 'xs'),
    ]),
  ];

  // 管理員章節只在 isAdmin 時出現，一般成員完全看不到（跟改版前的純文字清單規則相同）。
  if (isAdmin) {
    bodyContents.push(
      separator,
      section(sectionHead(FLEX_ICONS.shieldGray, '管理員專用'), [
        commandRow(FLEX_ICONS.calendarCheckLight, '本週打球資訊', '@Dobby next'),
        commandRow(FLEX_ICONS.fileTextLight, '下一季公告草稿', `@Dobby season ${seasonArg(nextSeasonName)}`),
        hintRow(FLEX_ICONS.userPlusGray, '代他人報名／請假', '自己輸入 @Dobby +N @名字\n或 @Dobby @名字 假'),
      ])
    );
  }

  bodyContents.push(note('手動輸入時，+ 和 - 也可以用全形 ＋ －', FOOTNOTE, 'xxs'));

  return {
    type: 'bubble',
    size: 'mega',
    hero: photoHero(undefined, {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'md',
          alignItems: 'center',
          contents: [
            badgeBox('lime', FLEX_ICONS.listDark),
            { type: 'text', text: '指令清單', size: 'xl', weight: 'bold', color: '#FFFFFF', flex: 1 },
          ],
        },
        { type: 'text', text: '點一下就會送出，不用自己打字', size: 'sm', color: '#FFFFFF', margin: 'xs', wrap: true },
      ],
    }),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'lg',
      paddingTop: '16px',
      paddingBottom: '16px',
      paddingStart: '16px',
      paddingEnd: '16px',
      contents: bodyContents,
    },
    styles: {
      hero: { backgroundColor: '#000000' },
      body: { backgroundColor: CARD_BG },
    },
  };
}

/**
 * altText：LINE 推播通知、/logs、不支援 Flex 的舊版 LINE 都只看得到這段，
 * 所以列出卡片上每個指令的寫法，不只寫「指令清單」四個字。跟卡片一樣只列中文關鍵字，
 * 英文別名（owe、news、payment…）仍然能用，只是不列出來。
 */
export function buildCommandListAltText({ isAdmin, nextSeasonName }: CommandListCardParams): string {
  const lines = [
    '🛠️ 指令列表',
    '【查詢】',
    '@Dobby 報名人／公告／付款／欠',
    '@Dobby（自我介紹）',
    '【報名或請假】',
    '@Dobby +N／-N',
    '@Dobby 假／銷假（季租成員限定）',
  ];
  if (isAdmin) {
    lines.push('【管理員專用】', '@Dobby next', `@Dobby season ${seasonArg(nextSeasonName)}`, '@Dobby +N @名字', '@Dobby @名字 假／銷假');
  }
  return truncateAltText(lines.join('\n'));
}
