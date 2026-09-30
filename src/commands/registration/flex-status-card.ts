import type { messagingApi } from '@line/bot-sdk';
import { flexAssetUrl, FLEX_ICONS } from '../../config/flex-assets.js';

/**
 * 報名／請假結果的 Flex 狀態卡——純 JSON 組裝，不打任何 Notion／LINE API，
 * 方便單元測試。設計稿（LINE Flex Message Simulator 驗證過）見
 * PR 說明／commit 訊息；這裡的顏色、padding、spacing、size 都照抄設計稿，
 * 只把暫代的文字符號徽章換成真的 PNG 圖示、範例資料換成呼叫端傳入的真實資料。
 */

const BG = '#161616';
const TXT = '#F5F5F5';
const SUB = '#A3A3A3';
const DIV = '#2E2E2E';
const LIME = '#A3E635'; // 也是進度條／主按鈕／「新增」標記的強調色
const NEW_ENTRY_BG = '#26331A';
const EMPTY_ROW_BG = '#222222';

/** 徽章底色，key 是 event-status-message.ts 呼叫端要指定的名稱。 */
export const BADGE_COLORS = {
  lime: LIME,
  gray: '#737373',
  orange: '#FB923C',
  blue: '#60A5FA',
} as const;
export type BadgeColorName = keyof typeof BADGE_COLORS;

export interface StatusCardParams {
  /** 活動日 "YYYY-MM-DD"（下週六）。 */
  date: string;
  /**
   * altText（精簡文字版）用的既有 headline，例如「報名成功 ✅」「找不到 Alice 的報名紀錄」。
   * 卡片本身不顯示這個字串——卡片用 title/subtitle。
   */
  headline: string;
  badgeColor: BadgeColorName;
  /** FLEX_ICONS 的檔名，例如 FLEX_ICONS.checkDark。 */
  badgeIcon: string;
  title: string;
  subtitle: string;
  /** 這次操作後的完整零打名單，依序。 */
  guests: string[];
  /**
   * `guests` 陣列尾端有幾筆是這次新增的條目（標「新增」+ 列底色）。
   * 只有報名成功（含被截斷）時非 0；calculateAddCapacity 把新條目接在既有
   * 條目後面，呼叫端可以直接用 `updatedGuests.length - freshEvent.guests.length`。
   */
  newGuestCount: number;
  totalSlots: number;
  presentSeasonMembers: number;
  guestFee: number;
  /** 已查好姓名的請假名單，依序；永遠完整列出，不截斷。 */
  absenteeNames: string[];
  /**
   * 暫停週卡片專用（見 `../weekly-status-message.ts`）。true 時只保留 hero 的照片／
   * 日期與費用行／徽章／標題，拿掉標題列右側「剩 N 位／已額滿」與副標題、進度條；
   * body 拿掉零打名單／請假／本週出席三段，改顯示 `pausedNote` 一行灰字；footer
   * 三顆按鈕整個拿掉（暫停週沒有可操作的動作）。
   *
   * 預設 `undefined`（視同 `false`）——報名／請假的所有結束分支都不會設這個欄位，
   * 輸出跟這個欄位加入前完全相同，不需要另外改呼叫端。
   */
  paused?: boolean;
  /** `paused=true` 時 body 顯示的說明文字，例如「本週因故暫停，恢復後另行公告」。`paused` 為 false／undefined 時忽略。 */
  pausedNote?: string;
}

function numberBox(n: number): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    width: '16px',
    flex: 0,
    justifyContent: 'center',
    contents: [{ type: 'text', text: String(n), size: 'xs', color: SUB, align: 'end' }],
  };
}

function guestRow(n: number, name: string, isNew: boolean): messagingApi.FlexBox {
  const contents: messagingApi.FlexComponent[] = [
    numberBox(n),
    { type: 'text', text: name, size: 'sm', color: TXT, flex: 1, gravity: 'center' },
  ];
  if (isNew) {
    contents.push({ type: 'text', text: '新增', size: 'xxs', weight: 'bold', color: LIME, flex: 0, gravity: 'center' });
  }
  const row: messagingApi.FlexBox = {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    paddingStart: '8px',
    paddingEnd: '8px',
    paddingTop: '4px',
    paddingBottom: '4px',
    cornerRadius: '6px',
    contents,
  };
  if (isNew) row.backgroundColor = NEW_ENTRY_BG;
  return row;
}

function emptyRow(label: string): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    paddingStart: '8px',
    paddingEnd: '8px',
    paddingTop: '4px',
    paddingBottom: '4px',
    cornerRadius: '6px',
    backgroundColor: EMPTY_ROW_BG,
    contents: [
      { type: 'box', layout: 'vertical', width: '16px', flex: 0, contents: [{ type: 'filler' }] },
      { type: 'text', text: label, size: 'xs', color: SUB, flex: 1, gravity: 'center', wrap: true },
    ],
  };
}

/** 「零打名單」「請假」小標：16px 灰色圖示 + 文字，跟右側數量文字左右分開。 */
function headRow(iconFile: string, label: string, right: string): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: '6px',
        alignItems: 'center',
        contents: [
          { type: 'image', url: flexAssetUrl(iconFile), size: '16px', aspectMode: 'fit', aspectRatio: '1:1', flex: 0 },
          { type: 'text', text: label, size: 'xs', weight: 'bold', color: SUB },
        ],
      },
      { type: 'text', text: right, size: 'xs', weight: 'bold', color: SUB, align: 'end' },
    ],
  };
}

function footerButton(label: string, text: string, flex: number, primary: boolean): messagingApi.FlexBox {
  // Flex 的 button component 不能設粗體，所以三顆都自己用 box + text 畫。
  const b: messagingApi.FlexBox = {
    type: 'box',
    layout: 'vertical',
    flex,
    height: '40px',
    cornerRadius: '8px',
    justifyContent: 'center',
    action: { type: 'message', label, text },
    contents: [{ type: 'text', text: label, size: 'sm', weight: 'bold', align: 'center', color: primary ? '#111111' : TXT }],
  };
  if (primary) {
    b.backgroundColor = LIME;
  } else {
    b.borderWidth = '1px';
    b.borderColor = '#3F3F3F';
  }
  return b;
}

function badgeBox(colorName: BadgeColorName, iconFile: string): messagingApi.FlexBox {
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

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * "2026-10-03" → "10/3（六）"。實際永遠是週六（下週六），但仍從日期字串算
 * 出來，不寫死「六」——跟 getSeasonNameForDate() 一樣直接解析日期字串，不經過
 * 會受時區影響的 Date 建構子。
 */
function formatCardDateLabel(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid date: ${date}`);
  const [, y, m, d] = match;
  const weekday = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay();
  return `${Number(m)}/${d}（${WEEKDAY_LABELS[weekday]}）`;
}

export function buildStatusCardBubble(params: StatusCardParams): messagingApi.FlexBubble {
  const {
    date,
    badgeColor,
    badgeIcon,
    title,
    subtitle,
    guests,
    newGuestCount,
    totalSlots,
    presentSeasonMembers,
    guestFee,
    absenteeNames,
    paused = false,
    pausedNote,
  } = params;

  const filled = guests.length;
  const remaining = Math.max(0, totalSlots - filled);
  // totalSlots 理論上可能因季資料異動算出 0 或負數（見 capacity-calculator.ts:45-47，
  // 例如 courts=0）。displayTotalSlots 只給顯示用，避免卡片出現「0 / -1」這種負數名額；
  // 名額判斷本身仍然用原始 totalSlots（calculateAddCapacity 已經處理過負數的情況）。
  const displayTotalSlots = Math.max(0, totalSlots);
  // 這裡防除以 0／負數導致 pct 變成 NaN 或負百分比。
  const pct = totalSlots > 0 ? Math.round(Math.min(1, filled / totalSlots) * 100) : 0;

  const barInnerContents: messagingApi.FlexComponent[] =
    pct > 0
      ? [
          {
            type: 'box',
            layout: 'vertical',
            width: `${pct}%`,
            height: '4px',
            cornerRadius: '2px',
            backgroundColor: LIME,
            contents: [{ type: 'filler' }],
          },
        ]
      : [{ type: 'filler' }];

  const bar: messagingApi.FlexBox = {
    type: 'box',
    layout: 'vertical',
    height: '4px',
    cornerRadius: '2px',
    backgroundColor: '#FFFFFF4D',
    margin: 'md',
    contents: barInnerContents,
  };

  // guests 尾端 newGuestCount 筆是這次新增的（calculateAddCapacity 接在既有條目後面）。
  const newStartIndex = filled - newGuestCount;
  const guestSectionContents: messagingApi.FlexComponent[] = [
    headRow(FLEX_ICONS.usersGray, '零打名單', `${filled} / ${displayTotalSlots}`),
    ...guests.map((name, i) => guestRow(i + 1, name, newGuestCount > 0 && i >= newStartIndex)),
  ];
  if (remaining > 0) {
    guestSectionContents.push(
      emptyRow(filled === 0 ? `尚無人報名・${remaining} 個名額都還空著` : `還有 ${remaining} 個空位`)
    );
  }

  const absenteeText = absenteeNames.length > 0 ? absenteeNames.join('、') : '無';

  // 暫停週：標題列只留徽章＋標題，不顯示「剩 N 位／已額滿」；innerBox 底下也不接
  // 副標題、進度條——這三個都是「還能不能報名」的資訊，暫停週沒有這個概念。
  const titleRowContents: messagingApi.FlexComponent[] = [
    badgeBox(badgeColor, badgeIcon),
    { type: 'text', text: title, size: 'xl', weight: 'bold', color: '#FFFFFF', flex: 1 },
  ];
  if (!paused) {
    titleRowContents.push({
      type: 'text',
      text: remaining > 0 ? `剩 ${remaining} 位` : '已額滿',
      size: 'md',
      weight: 'bold',
      color: '#FFFFFF',
      align: 'end',
      flex: 0,
    });
  }

  const innerBoxContents: messagingApi.FlexComponent[] = [
    { type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', contents: titleRowContents },
  ];
  if (!paused) {
    innerBoxContents.push(
      { type: 'text', text: subtitle, size: 'sm', color: '#FFFFFF', margin: 'xs', wrap: true },
      bar
    );
  }

  // 暫停週：body 拿掉零打名單／請假／本週出席三段，改放一行灰字說明；footer 三顆
  // 按鈕整個拿掉（暫停週沒有可操作的動作，見 StatusCardParams.paused 的說明）。
  const bodyContents: messagingApi.FlexComponent[] = paused
    ? [{ type: 'text', text: pausedNote ?? '', size: 'sm', color: SUB, wrap: true }]
    : [
        { type: 'box', layout: 'vertical', spacing: 'xs', contents: guestSectionContents },
        { type: 'separator', color: DIV },
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          contents: [
            headRow(FLEX_ICONS.calendarXGray, '請假', `${absenteeNames.length} 人`),
            { type: 'text', text: absenteeText, size: 'sm', color: TXT, wrap: true },
          ],
        },
        { type: 'separator', color: DIV },
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              spacing: '6px',
              alignItems: 'center',
              flex: 0,
              contents: [
                {
                  type: 'image',
                  url: flexAssetUrl(FLEX_ICONS.userCheckGray),
                  size: '16px',
                  aspectMode: 'fit',
                  aspectRatio: '1:1',
                  flex: 0,
                },
                { type: 'text', text: '本週出席', size: 'xs', weight: 'bold', color: SUB },
              ],
            },
            {
              type: 'text',
              align: 'end',
              flex: 1,
              contents: [
                { type: 'span', text: String(presentSeasonMembers + filled), size: 'lg', weight: 'bold', color: TXT },
                { type: 'span', text: ` 人（季租 ${presentSeasonMembers}・零打 ${filled}）`, size: 'xs', color: SUB },
              ],
            },
          ],
        },
      ];

  const bubble: messagingApi.FlexBubble = {
    type: 'bubble',
    size: 'mega',
    hero: {
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
          justifyContent: 'space-between',
          background: {
            type: 'linearGradient',
            angle: '0deg',
            startColor: '#000000D9',
            centerColor: '#0000001A',
            endColor: '#00000059',
            centerPosition: '65%',
          },
          contents: [
            { type: 'text', text: `${formatCardDateLabel(date)}・零打 $${guestFee}/人`, size: 'sm', weight: 'bold', color: '#FFFFFF' },
            { type: 'box', layout: 'vertical', contents: innerBoxContents },
          ],
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'lg',
      paddingTop: '14px',
      paddingBottom: '8px',
      paddingStart: '20px',
      paddingEnd: '20px',
      contents: bodyContents,
    },
    styles: {
      hero: { backgroundColor: '#000000' },
      body: { backgroundColor: BG },
      ...(paused ? {} : { footer: { backgroundColor: BG } }),
    },
  };

  if (!paused) {
    bubble.footer = {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      paddingTop: '10px',
      paddingBottom: '16px',
      paddingStart: '16px',
      paddingEnd: '16px',
      contents: [
        footerButton('+1 零打', '@Dobby +1', 2, true),
        footerButton('−1 零打', '@Dobby -1', 1, false),
        footerButton('請假', '@Dobby 假', 1, false),
      ],
    };
  }

  return bubble;
}

const ALT_TEXT_MAX = 400;

/**
 * altText（精簡文字版）：LINE 推播通知跟 /logs 都只看得到這個字串，不是卡片
 * JSON。保留 headline（含 ✅ 等既有措辭）、日期、零打名額與費用、只列已報名者
 * 的編號名單（不含空位）、剩餘名額、請假名單、總人數——比舊版 buildEventStatusMessage
 * 少了空位列和「若要報名請輸入 @Dobby +1」。
 */
export function buildStatusCardAltText(params: StatusCardParams): string {
  const { headline, date, totalSlots, guestFee, guests, presentSeasonMembers, absenteeNames, paused, pausedNote } = params;

  // 暫停週沒有名額／零打名單／請假可講，altText 只留 headline＋日期＋說明文字。
  if (paused) {
    const pausedLines = [headline, '', date];
    if (pausedNote) pausedLines.push(pausedNote);
    const pausedText = pausedLines.join('\n');
    return pausedText.length > ALT_TEXT_MAX ? pausedText.slice(0, ALT_TEXT_MAX - 1) + '…' : pausedText;
  }

  const remaining = Math.max(0, totalSlots - guests.length);
  // 同 buildStatusCardBubble：totalSlots 可能因資料異動算出負數，顯示用一律 clamp 到 0。
  const displayTotalSlots = Math.max(0, totalSlots);
  const guestLines = guests.map((g, i) => `${i + 1}. ${g}`).join('\n');
  const absenteeText = absenteeNames.length > 0 ? absenteeNames.join('、') : '無';
  const totalPeople = presentSeasonMembers + guests.length;

  const lines = [headline, '', date, `零打名額 ${displayTotalSlots} 人 | $${guestFee}/人`];
  if (guestLines) lines.push(guestLines);
  lines.push(`剩餘名額：${remaining} 人`, `請假：${absenteeText}`, `總人數：共 ${totalPeople} 人`);

  const text = lines.join('\n');
  return text.length > ALT_TEXT_MAX ? text.slice(0, ALT_TEXT_MAX - 1) + '…' : text;
}
