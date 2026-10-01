import type { messagingApi } from '@line/bot-sdk';
import { FLEX_ICONS } from '../config/flex-assets.js';
import { CARD_BG, CARD_TEXT, CARD_SUB, CARD_DIVIDER, CARD_LIME, badgeBox, photoHero } from './flex-card-parts.js';
import { sectionBox } from './news-card.js';

/**
 * 季公告卡（`@Dobby season`）：NEW_SEASON 模板用 `————————` 切出來的每一段（`{NEW_SEASON_NEWS}` 那段除外）
 * 各畫成一張。照片標題區只有徽章＋標題，標題是該段第一行（例如「中華科大 - 2026 Q4 (10~12月)」）。
 * 內文依模板內容由上到下排，三種項目：
 * - `section`：一般文字，跟公告卡一樣（灰色小標＋內文）。
 * - `stats`：數據格。每格是小標＋大數字（前後綴小字）＋備註；`wide` 的格子佔滿一列，
 *   其他的依順序兩兩一列，落單的佔半格。
 * - `highlights`：螢光大數字。`highlight` 的列是螢光綠實心標籤＋螢光綠金額＋備註＋名單；
 *   其他列是小字，依順序兩兩一列。
 * 項目之間畫細線。設計取捨見 ADR 0016，mockup 見 https://claude.ai/artifact/88WHEHW8c8V8htGL3wjSSe 。
 *
 * 沒有按鈕：卡片是管理員轉傳到群組用的。Flex 的 text 不能是空字串，所以空的欄位整個不畫；
 * 呼叫端要保證 items 至少有一項（全空的 body 會讓 LINE 退回整則），也要用 `fitsBubbleSizeLimit()` 檢查大小。
 */

const TILE_BG = '#1F1F1F';
const NOTE_COLOR = '#8A8A8A';
const MENTION_COLOR = '#D4D4D4';

export interface StatTile {
  title: string;
  prefix: string;
  value: string;
  suffix: string;
  note: string;
  wide: boolean;
}

export interface HighlightRow {
  title: string;
  amount: string;
  content: string;
  note: string;
  highlight: boolean;
}

export type SeasonCardItem =
  // fromTable：認不得的表格轉成的文字（見 season-announcement.ts 的 tableItem），不拿來當卡片標題
  | { kind: 'section'; heading: string; body: string; fromTable?: boolean }
  | { kind: 'stats'; tiles: StatTile[] }
  | { kind: 'highlights'; rows: HighlightRow[] };

export interface SeasonCardParams {
  title: string;
  /** 已經代入 placeholder 的內容；呼叫端先濾掉空的項目。 */
  items: SeasonCardItem[];
}

/** 依順序兩兩一列；`alone` 為 true 的獨佔一列。 */
function pairUp<T>(list: T[], alone: (x: T) => boolean): T[][] {
  const lines: T[][] = [];
  let pending: T | null = null;
  for (const x of list) {
    if (alone(x)) {
      if (pending) lines.push([pending]);
      pending = null;
      lines.push([x]);
    } else if (pending) {
      lines.push([pending, x]);
      pending = null;
    } else {
      pending = x;
    }
  }
  if (pending) lines.push([pending]);
  return lines;
}

/** 一列的格子：`full` 佔滿；否則固定兩格，落單時右邊補空的 box 佔位，寬度才會是半格。 */
function gridLine(boxes: messagingApi.FlexBox[], full: boolean): messagingApi.FlexBox {
  const contents: messagingApi.FlexComponent[] = boxes.map((b) => ({ ...b, flex: 1 }));
  if (!full && contents.length === 1) contents.push({ type: 'box', layout: 'vertical', flex: 1, contents: [] });
  return { type: 'box', layout: 'horizontal', spacing: '8px', contents };
}

function spans(parts: messagingApi.FlexSpan[]): messagingApi.FlexSpan[] {
  return parts.filter((s) => s.text);
}

function statTileBox(t: StatTile): messagingApi.FlexBox {
  const contents: messagingApi.FlexComponent[] = [];
  if (t.title) contents.push({ type: 'text', text: t.title, size: 'xs', weight: 'bold', color: CARD_SUB, wrap: true });
  const value = spans([
    { type: 'span', text: t.prefix, size: 'xs', color: CARD_SUB },
    { type: 'span', text: t.value, size: 'xl', weight: 'bold', color: CARD_TEXT },
    { type: 'span', text: t.suffix ? ` ${t.suffix}` : '', size: 'xs', color: CARD_SUB },
  ]);
  if (value.length > 0) contents.push({ type: 'text', text: value.map((s) => s.text).join(''), contents: value, wrap: true });
  if (t.note) contents.push({ type: 'text', text: t.note, size: 'xxs', color: NOTE_COLOR, wrap: true });
  return {
    type: 'box',
    layout: 'vertical',
    spacing: '2px',
    backgroundColor: TILE_BG,
    cornerRadius: '10px',
    paddingTop: '10px',
    paddingBottom: '10px',
    paddingStart: '12px',
    paddingEnd: '12px',
    contents,
  };
}

function statsBox(tiles: StatTile[]): messagingApi.FlexBox {
  const lines = pairUp(tiles, (t) => t.wide).map((line) => gridLine(line.map(statTileBox), line.length === 1 && line[0]!.wide));
  return { type: 'box', layout: 'vertical', spacing: '8px', contents: lines };
}

function highlightRowBox(r: HighlightRow): messagingApi.FlexBox {
  const head: messagingApi.FlexComponent[] = [];
  if (r.title) {
    head.push({
      type: 'box',
      layout: 'vertical',
      flex: 0,
      backgroundColor: CARD_LIME,
      cornerRadius: '10px',
      paddingTop: '2px',
      paddingBottom: '2px',
      paddingStart: '10px',
      paddingEnd: '10px',
      contents: [{ type: 'text', text: r.title, size: 'xs', weight: 'bold', color: '#111111', wrap: true }],
    });
  }
  // 標籤和金額都 wrap：標題或金額很長時換行，不要被截成「$2…」
  if (r.amount) head.push({ type: 'text', text: r.amount, size: 'xl', weight: 'bold', color: CARD_LIME, align: 'end', flex: 1, wrap: true });

  const contents: messagingApi.FlexComponent[] = [];
  if (head.length > 0) contents.push({ type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'md', contents: head });
  if (r.note) contents.push({ type: 'text', text: r.note, size: 'xxs', color: NOTE_COLOR, align: 'end', wrap: true });
  if (r.content) contents.push({ type: 'text', text: r.content, size: 'xs', color: MENTION_COLOR, wrap: true });
  return { type: 'box', layout: 'vertical', spacing: '6px', contents };
}

function minorRowBox(r: HighlightRow): messagingApi.FlexBox {
  const contents: messagingApi.FlexComponent[] = [];
  if (r.title) contents.push({ type: 'text', text: r.title, size: 'xs', color: CARD_SUB, wrap: true });
  if (r.amount) contents.push({ type: 'text', text: r.amount, size: 'lg', weight: 'bold', color: CARD_TEXT, wrap: true });
  if (r.note) contents.push({ type: 'text', text: r.note, size: 'xxs', color: NOTE_COLOR, wrap: true });
  if (r.content) contents.push({ type: 'text', text: r.content, size: 'xs', color: MENTION_COLOR, wrap: true });
  return { type: 'box', layout: 'vertical', spacing: '4px', contents };
}

function highlightsBox(rows: HighlightRow[]): messagingApi.FlexBox {
  // 突顯的列各佔一列；一般列依順序兩兩並排（連續的才並排，中間夾著突顯列就分開）
  const lines = pairUp(rows, (r) => r.highlight).map((line) =>
    line[0]!.highlight ? highlightRowBox(line[0]!) : gridLine(line.map(minorRowBox), false),
  );
  const contents: messagingApi.FlexComponent[] = [];
  lines.forEach((line, i) => {
    if (i > 0) contents.push({ type: 'separator', color: CARD_DIVIDER });
    contents.push(line);
  });
  return { type: 'box', layout: 'vertical', spacing: '14px', paddingStart: '4px', paddingEnd: '4px', contents };
}

function itemBox(item: SeasonCardItem): messagingApi.FlexBox {
  if (item.kind === 'stats') return statsBox(item.tiles);
  if (item.kind === 'highlights') return highlightsBox(item.rows);
  return sectionBox(item.heading, item.body);
}

export function buildSeasonBubble(params: SeasonCardParams): messagingApi.FlexBubble {
  const { title, items } = params;

  const bodyContents: messagingApi.FlexComponent[] = [];
  items.forEach((item, i) => {
    if (i > 0) bodyContents.push({ type: 'separator', color: CARD_DIVIDER });
    bodyContents.push(itemBox(item));
  });

  return {
    type: 'bubble',
    size: 'mega',
    hero: photoHero(undefined, {
      type: 'box',
      layout: 'horizontal',
      spacing: 'md',
      alignItems: 'center',
      contents: [
        badgeBox('lime', FLEX_ICONS.megaphoneDark),
        { type: 'text', text: title, size: 'lg', weight: 'bold', color: '#FFFFFF', flex: 1, wrap: true },
      ],
    }),
    body: { type: 'box', layout: 'vertical', spacing: '12px', paddingAll: '16px', contents: bodyContents },
    styles: { hero: { backgroundColor: '#000000' }, body: { backgroundColor: CARD_BG } },
  };
}

/** 「標題 值 (備註)」，空的部分不留多餘空白。 */
function textLine(...partsThenNote: string[]): string {
  const note = partsThenNote.pop()!;
  const head = partsThenNote.filter(Boolean).join(' ');
  if (!note) return head;
  return head ? `${head} (${note})` : note;
}

/** 卡片的純文字版：altText，以及卡片太大時改送的內容。項目之間空一行，跟卡片上的細線對應。 */
export function seasonCardToText(params: SeasonCardParams): string {
  const blocks = params.items.map((item) => {
    if (item.kind === 'section') return [item.heading.trim(), item.body.trim()];
    if (item.kind === 'stats') {
      return item.tiles.map((t) => textLine(t.title, `${t.prefix}${t.value}${t.suffix ? ` ${t.suffix}` : ''}`, t.note));
    }
    return item.rows.flatMap((r) => [textLine(r.title, r.amount, r.note), r.content]);
  });
  return [params.title, ...blocks.map((lines) => lines.filter(Boolean).join('\n'))].filter(Boolean).join('\n\n');
}
