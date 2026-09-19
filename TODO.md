# TODO

> 時區：Asia/Taipei ｜ 季度定義：Q1=1~3月, Q2=4~6月, Q3=7~9月, Q4=10~12月
>
> 前身為 `openspec/changes/bot-logic-fixes`，已改用純 Markdown TODO 追蹤，不再使用 OpenSpec 流程。
>
> 已完成且有文件記錄的項目已從這裡移除，機制細節記錄在 `docs/registration.md`、`docs/commands.md`、`docs/architecture.md`、`docs/notion/databases.md`、`docs/schedulers.md`、`docs/adr/`。開工前先看這裡＋對應文件，避免重複踩雷。

---

## /logs 頁面重構：通用渲染器 + 伺服器端流程表

> 2026-09-20 訪談定案的需求。`/logs`（`src/routes/logs.ts` 762 行 + `src/routes/log-grouping.ts` 220 行）目前有「平面模式」「流程表模式」兩種檢視，兩者都以 `groupPairedEntries()`（`log-grouping.ts:201-220`）把 Notion API 請求/回應、LINE reply/push 的「發送/送達」這類多筆 log 行合併成一個 `DisplayRow`。問題有三層：(1) 除了 `notion-call`/`line-reply`/`line-push` 這三種已知 kind，其餘所有 log 行都落入 `{ kind: 'single', entry }`，平面模式的 `renderEntry()`（`logs.ts:65-128`）只顯示 `msg` 名稱、額外欄位要點開才看得到 JSON，流程表模式的 `renderFlowMisc()`（`logs.ts:574-587`，**用戶端 JS**）連點開都沒有，只顯示裸 `msg` 字串——例如 `message-handler.ts:31` 的 `logger.debug({ userId, text, isAdmin, sourceType }, 'handleMessage')`，流程表現在只看得到「handleMessage」四個字，`text`（使用者實際打的指令）完全看不到；(2) 流程表模式整個是用戶端重新分組/重新渲染（`logs.ts:452-651` 的 `buildFlowView`/`renderFlowGroup`/`renderFlowStep`/`renderFlowEndEndpoint`/`methodBadge` 等 JS 函式），跟平面模式的 TS 版 `renderNotionCallRow`/`renderLineSendRow` 邏輯幾乎重複兩份；(3) 流程表沒有平面模式既有的 `LEVEL_COLORS`（`logs.ts:26-33`）等級色標，長 path/長內容在兩種模式都會被截斷看不全。
>
> **這份規格是唯一的需求來源，下面 4 條決定是協調者跟使用者訪談後的定案，開工前不用回頭問。** 過程中遇到的技術實作細節（不影響最終畫面/行為）由本規格直接決定；如果找到會實質影響畫面呈現或互動方式、且不在下面 4 條定案範圍內的岔路，才需要用文末「保守決定、供覆核」小節記錄的方式處理——這次規劃沒有找到需要真正回頭問使用者的岔路，文末小節列的是「已自行決定、但值得讓實作者知道有過取捨」的項目，不是懸而未決的問題。

### 已確認的決定（2026-09-20 定案，不用再問）

1. **混合式渲染策略**：`NotionCallRow`/`LineSendRow` 繼續用專屬徽章樣式（method/path/db/purpose 標籤），但「其他所有類型」（現在的 `{ kind: 'single', entry }` 後備分支）的顯示要換成通用的 key-value 渲染器——自動把該筆 entry 排除 `level`/`time`/`msg`/`reqId`/`pid`/`hostname` 這 6 個後設欄位後的其餘欄位，顯示成一排小標籤（視覺比照現有 `.tag-purpose`：小圓角背景色塊）。新增一個欄位或一種新的 log 訊息，不用再改 `logs.ts`/`log-grouping.ts`。
2. **流程表模式改成伺服器端渲染**：`renderHtml()` 一次算好平面模式 + 流程表模式兩份完整 HTML 一起送出，`setViewMode()` 純粹是切換兩個已渲染區塊（`#table-wrap`/`#flow-view`）的顯示/隱藏。通用渲染器（決定 1）、Notion call/LINE send 的渲染邏輯都只寫一份 TypeScript 函式，兩種模式共用同一份渲染結果的資料結構。移除後的用戶端 JS 只剩「切換 CSS class」「篩選/搜尋的 DOM 顯示隱藏」，不再有任何渲染/資料轉換邏輯。代價（已跟使用者說明並接受）：初始 HTML 變大，但這是僅協調者一人用的內部頁面，資料量不大，可忽略。
3. **流程表模式補上等級色標**：`flow-step`/`flow-misc`/`flow-endpoint`（含通用渲染器產生的行）都要有跟平面模式一致的等級色標，顏色沿用既有 `LEVEL_COLORS`，不新發明色票。視覺呈現方式（色條/圓點/badge）由實作者判斷哪種在流程表的縮排敘事結構裡最不突兀。
4. **微調（不是大改）既有樣式**：`.tag-path`（`logs.ts:342`）長 path 被截斷成看不出打了哪個 endpoint；`.action-content`（`logs.ts:353`）長內容被截斷成一行看不到全貌。這次要在不犧牲「一行掃過去看整體流程，需要細節再點開」這個核心互動模式的前提下改善，可用「加寬欄位」「hover tooltip 顯示完整內容」「展開內容排版優化」的組合，由實作者判斷。**明確排除**：流程表裡同一流程內偶爾出現的連續重複 Notion 呼叫（例如查兩次同一個使用者），這是程式邏輯問題不是顯示問題，這次不處理、也不加「偵測重複」UI。

### 現況程式碼定位（本次規劃當下的版本，供 diff 對照）

`log-grouping.ts`：`NotionCallRow`（3-15）、`LineSendRow`（17-26）、`DisplayRow`（28）、`processBucket`（49-173）、`representativeTime`（175-185，目前未 export）、`groupPairedEntries`（201-220，回傳依 time 升冪排序）。

`logs.ts`：`LEVEL_NAMES`/`LEVEL_COLORS`/`METHOD_COLORS`（17-40）、`escapeHtml`/`formatTime`/`statusIcon`/`reqIdCellHtml`（42-63）、`renderEntry`（65-128，平面模式「其他」後備渲染）、`notionCallDetail`/`renderNotionCallRow`（130-196）、`lineSendDetail`/`renderLineSendRow`（198-258）、`renderDisplayRow`（260-270，平面模式 dispatcher）、`renderHtml`（272-750，含内嵌 CSS 299-385 跟 client `<script>` 445-747）。Client script 內：`setViewMode`（452-461）、`methodBadge`/`escapeHtmlJs`/`formatFlowTime`/`messageLabel`/`rowReqId`/`rowTime`（463-512）、`renderFlowStepDetail`/`renderFlowStep`（514-544）、`renderFlowStartEndpoint`/`renderFlowEndEndpoint`/`renderFlowMisc`（546-587）、`renderFlowGroup`（589-624）、`buildFlowView`（626-651）、`filterLevel`/`filterTime`/`filterByReqId`/`clearReqIdFilter`/`applyFilters`（653-721）、`toggleExtra`/`copyFiltered`（723-746）。

### A. `log-grouping.ts`：新增 `FlowGroup` + `buildFlowGroups()`，`DisplayRow` 形狀不變

`NotionCallRow`/`LineSendRow`/`DisplayRow` **不需要新增 kind**（例如不需要新增 `GenericRow`）——`{ kind: 'single', entry: LogEntry }` 已經足夠讓通用渲染器（決定 1）在渲染時判斷「這是後備類型」，不需要在資料結構層面多分一種 kind。真正要新增的是「依 reqId 分組＋分類成流程表要的四個角色（起點/終點/步驟/雜項）」這個現在活在用戶端 JS（`buildFlowView`/`renderFlowGroup` 開頭那段 for 迴圈，`logs.ts:593-599`）的邏輯，把它搬到伺服器端、寫成一個回傳純資料（不是 HTML 字串）的函式，放在 `log-grouping.ts`（跟 `groupPairedEntries` 同屬「分組」關注點）：

```ts
// log-grouping.ts 新增：representativeTime 從 internal 改成 export（第 175 行的 function 加 export 關鍵字，函式本體不變）
export function representativeTime(row: DisplayRow): number { /* 現有邏輯不變 */ }

// 新增於 groupPairedEntries 之後
export interface FlowGroup {
  reqId: string;
  firstTime: number;
  /** 'Processing event'（info）——事件觸發的起點。背景/排程觸發的呼叫沒有這個。 */
  start?: LogEntry;
  /** 'Processing event detail'（debug）——起點的配對明細，可能不存在（LOG_LEVEL=info 時不會捕捉到）。 */
  startDetail?: LogEntry;
  /** 這個 reqId 流程裡的 LINE reply（回覆），一個流程最多一筆。line-push 不算終點，見下方 misc 的說明。 */
  end?: LineSendRow;
  /** 這個 reqId 流程裡依序發生的 Notion API 呼叫。 */
  steps: NotionCallRow[];
  /** 除了 start/startDetail/end/steps 以外的所有東西，依原順序（時間升冪）保留，包含 line-push（背景推播沒有終點的敘事位置，跟現有 renderFlowMisc 的處理方式一致）跟通用渲染器要處理的 single 行。 */
  misc: DisplayRow[];
}

function flowRowReqId(row: DisplayRow): string {
  switch (row.kind) {
    case 'single':
      return typeof row.entry.reqId === 'string' ? row.entry.reqId : '';
    case 'notion-call':
      return typeof row.request.reqId === 'string' ? row.request.reqId : '';
    case 'line-reply':
    case 'line-push':
      return typeof row.start.reqId === 'string' ? row.start.reqId : '';
  }
}

/**
 * 把 groupPairedEntries() 的扁平結果依 reqId 分組，並在組內分類成流程表
 * 敘事需要的四個角色（起點/終點/步驟/雜項）。這是原本活在 buildFlowView()/
 * renderFlowGroup() 用戶端 JS 裡的邏輯（logs.ts:589-651，改版前），搬到伺服
 * 器端讓 renderHtml() 可以直接算出完整流程表 HTML，不再需要瀏覽器重新分組。
 *
 * 輸入必須是 groupPairedEntries() 的輸出（已依 time 升冪排序）——因為組內
 * 順序仰賴這個前提來決定 firstTime 跟敘事順序，不會在這裡重新排序組內項目。
 * 組跟組之間依 firstTime 由新到舊排序（跟原本 buildFlowView() 的
 * `groupList.sort((a, b) => b.firstTime - a.firstTime)` 行為一致）。
 */
export function buildFlowGroups(displayRows: DisplayRow[]): FlowGroup[] {
  const buckets = new Map<string, DisplayRow[]>();
  for (const row of displayRows) {
    const reqId = flowRowReqId(row);
    let bucket = buckets.get(reqId);
    if (!bucket) {
      bucket = [];
      buckets.set(reqId, bucket);
    }
    bucket.push(row);
  }

  const groups: FlowGroup[] = [];
  for (const [reqId, rows] of buckets) {
    const group: FlowGroup = { reqId, firstTime: rows.length > 0 ? representativeTime(rows[0]) : 0, steps: [], misc: [] };
    for (const row of rows) {
      if (row.kind === 'single' && row.entry.msg === 'Processing event') { group.start = row.entry; continue; }
      if (row.kind === 'single' && row.entry.msg === 'Processing event detail') { group.startDetail = row.entry; continue; }
      if (row.kind === 'line-reply') { group.end = row; continue; }
      if (row.kind === 'notion-call') { group.steps.push(row); continue; }
      group.misc.push(row);
    }
    groups.push(group);
  }

  groups.sort((a, b) => b.firstTime - a.firstTime);
  return groups;
}
```

`log-grouping.test.ts` 既有的 `groupPairedEntries` 測試完全不受影響（沒有動到它的邏輯或輸出形狀）。

### B. 通用渲染器（決定 1）

放在 `logs.ts`，取代 `renderEntry()` 裡「額外欄位只丟進 `extraJson` 供點開查看」的部分（現有 `renderEntry` 第 109-113 行的 `expandExtra`/`extraJson` 計算保留給展開區塊用，但**平面模式的行內也要看得到摘要**——現況只有點開才看得到，這次改成不點開也能看到欄位摘要）：

```ts
const META_FIELDS = new Set(['level', 'time', 'msg', 'reqId', 'pid', 'hostname']);
const EXTRA_VALUE_MAX_LEN = 60;

function formatExtraValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))).join(' / ');
  }
  if (typeof value === 'object') {
    // value !== null，因為 null 在呼叫端已經被過濾掉（見 renderExtraFieldsHtml）
    return JSON.stringify(value);
  }
  return String(value);
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

/**
 * 通用 key-value 渲染器（決定 1）：把一筆 entry 排除後設欄位（META_FIELDS）
 * 後剩下的每個欄位渲染成一個小標籤，格式比照既有 .tag-purpose 的視覺風格。
 * 新增一個欄位或一種新的 log 訊息完全不需要碰這個函式——它不認識任何特定
 * 欄位名稱，純粹枚舉 Object.keys()。
 *
 * null/undefined 直接跳過該欄位（沒有值可顯示，顯示 "null" 標籤只會製造
 * 雜訊）。值一律截斷到 EXTRA_VALUE_MAX_LEN 字元，完整值放在 title 屬性
 * 供 hover 查看（跟決定 4 的 tooltip 手法一致，兩者共用同一個互動慣例）。
 */
function renderExtraFieldsHtml(entry: LogEntry): string {
  const tags = Object.entries(entry)
    .filter(([key, value]) => !META_FIELDS.has(key) && value !== null && value !== undefined)
    .map(([key, value]) => {
      const full = formatExtraValue(value);
      const shown = escapeHtml(truncate(full, EXTRA_VALUE_MAX_LEN));
      return `<span class="tag-field" title="${escapeHtml(full)}"><span class="tag-field-key">${escapeHtml(key)}</span>${shown}</span>`;
    });
  return tags.length > 0 ? `<div class="extra-tags">${tags.join('')}</div>` : '';
}
```

CSS 新增（緊接在 `logs.ts:341` 的 `.tag-purpose` 之後）：

```css
.tag-field { display: inline-block; margin: 2px 4px 2px 0; padding: 1px 6px; border-radius: 4px; background: #1e293b; border: 1px solid #334155; color: #cbd5e1; font-size: 11px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.tag-field-key { color: #64748b; margin-right: 4px; }
.extra-tags { margin-top: 2px; display: flex; flex-wrap: wrap; }
```

**這會取代現有 `renderEntry()` 裡 `messages: msgList` 的聊天泡泡特殊處理（`logs.ts:73`、`105-107`）**：`messages` 不在 `META_FIELDS` 排除清單裡，所以會被通用渲染器當成一個一般欄位顯示成 `tag-field`（陣列會用 `formatExtraValue` 的 `' / '` join 規則顯示）。這是決定 1 文字明確定案的必然結果（決定 1 只排除 6 個後設欄位，沒有排除 `messages`）——泡泡樣式的視覺特殊待遇拿掉，但内容本身不會消失，只是換個標籤樣式呈現，实际影响面很小（只有 `renderEntry` 的後備分支、且該筆 entry 沒被 `groupPairedEntries` 吸收成 `LineSendRow` 時才會走到這裡，依 `log-grouping.ts` 的配對邏輯這是罕見的 orphan case）。`renderEntry` 裡 `msgList`/`messagesHtml` 那兩行連同它的解構可以直接刪除。

### C. 共用渲染結構：`RowContent` + 兩種 wrapper（決定 2 核心）

現有 `renderNotionCallRow`/`renderLineSendRow` 直接組出 `<tr>` 字串，沒辦法被流程表複用。拆成「算內容」跟「包 wrapper」兩層：

```ts
interface RowContent {
  levelName: string;
  color: string;
  time: number;
  reqId: string;
  /** 已經是完整 HTML 片段（icon + label + badges + content 或 msg + extra-tags），行內顯示用。 */
  msgHtml: string;
  /** 展開/detail 區塊要放進 <pre> 的純文字（已經過 escapeHtml），沒有 detail 就是空字串。 */
  detailText: string;
  /** applyFilters() 的 search 比對用，已轉小寫。 */
  searchableText: string;
  /** 複製功能（copyFiltered）用的原始 JSON，已 escapeHtml。 */
  rawJson: string;
}

function singleRowContent(entry: LogEntry): RowContent {
  const levelNum = entry.level ?? 30;
  const levelName = LEVEL_NAMES[levelNum] ?? String(levelNum);
  const msg = escapeHtml(String(entry.msg ?? ''));
  const { level, time: _t, msg: _m, reqId: _r, pid, hostname, ...extra } = entry;
  const NOTION_API_MESSAGES = new Set([/* 同現有 renderEntry 第 80-86 行 */]);
  let notionTagsHtml = '';
  if (entry.method && NOTION_API_MESSAGES.has(String(entry.msg))) { /* 同現有 88-94 行邏輯 */ }
  const purposeHtml = entry.purpose ? ` <span class="tag-purpose">${escapeHtml(String(entry.purpose))}</span>` : '';
  const extraTagsHtml = renderExtraFieldsHtml(entry); // 決定 1
  return {
    levelName,
    color: LEVEL_COLORS[levelName] ?? '#94a3b8',
    time: entry.time ?? 0,
    reqId: String(entry.reqId ?? ''),
    msgHtml: `${msg}${notionTagsHtml}${purposeHtml}${extraTagsHtml}`,
    detailText: '', // single 行沒有獨立 detail 區塊，extra-tags 已經在行內顯示完了，不需要再點開
    searchableText: (String(entry.msg ?? '') + ' ' + JSON.stringify(extra)).toLowerCase(),
    rawJson: escapeHtml(JSON.stringify(entry)),
  };
}

function notionCallRowContent(row: NotionCallRow): RowContent {
  // 沿用現有 renderNotionCallRow（logs.ts:157-196）算 levelName/color/time/reqId/
  // methodHtml/dbHtml/pathHtml/purposeHtml/retryHtml/icon/msgHtml 的邏輯，原封不動；
  // 差別只在最後回傳 RowContent 物件而不是直接組 <tr> 字串。
  // detailText = escapeHtml(notionCallDetail(row))（notionCallDetail 函式不變）。
}

function lineSendRowContent(row: LineSendRow): RowContent {
  // 沿用現有 renderLineSendRow（logs.ts:220-258）邏輯，同上只改回傳形狀。
  // detailText = escapeHtml(lineSendDetail(row))。
}

function rowContent(row: DisplayRow): RowContent {
  switch (row.kind) {
    case 'single': return singleRowContent(row.entry);
    case 'notion-call': return notionCallRowContent(row);
    case 'line-reply':
    case 'line-push': return lineSendRowContent(row);
  }
}
```

兩個 wrapper：

```ts
function asTableRow(c: RowContent): string {
  const extraRow = c.detailText
    ? `<tr class="extra-row hidden"><td colspan="4"><pre>${c.detailText}</pre></td></tr>`
    : '';
  return `
  <tr class="log-row" data-level="${c.levelName}" data-time="${c.time}" data-msg="${escapeHtml(c.searchableText)}" data-reqid="${c.reqId}" data-raw="${c.rawJson}" onclick="toggleExtra(this)">
    <td class="time">${formatTime(c.time)}</td>
    <td><span class="badge" style="background:${c.color}">${c.levelName}</span></td>
    ${reqIdCellHtml(c.reqId)}
    <td class="msg">${c.msgHtml}</td>
  </tr>
  ${extraRow}`;
}

/** wrapperClass 是 'flow-step' | 'flow-misc'；決定 3 的等級色標用 inline style 的
 * border-left-color 實作（顏色是每一列各自的 LEVEL_COLORS 值，不是靜態 CSS class
 * 能表達的，所以用 inline style，class 本身只負責排版）。 */
function asFlowItem(c: RowContent, wrapperClass: 'flow-step' | 'flow-misc'): string {
  const detail = c.detailText ? `<div class="flow-step-detail"><pre>${c.detailText}</pre></div>` : '';
  const clickable = c.detailText ? ` onclick="event.stopPropagation(); this.classList.toggle('expanded')"` : '';
  return `<div class="${wrapperClass}" style="border-left-color:${c.color}" data-level="${c.levelName}" data-time="${c.time}" data-msg="${escapeHtml(c.searchableText)}" data-reqid="${c.reqId}"${clickable}>${c.msgHtml}${detail}</div>`;
}

/** 起點/終點用專屬 wrapper（見下方 D 節），一樣加上等級色標跟 data-* 篩選屬性。 */
function asFlowEndpoint(c: RowContent, label: string): string {
  return `<div class="flow-endpoint" style="border-left-color:${c.color}" data-level="${c.levelName}" data-time="${c.time}" data-msg="${escapeHtml(c.searchableText)}" data-reqid="${c.reqId}"><span class="flow-tag">${label}</span>${c.msgHtml}</div>`;
}
```

`.action-row` 那套 grid 版面（method/db/path 徽章 + 內容）現在會同時出現在 `<tr class="log-row">`（平面模式）跟 `<div class="flow-step">`/`<div class="flow-endpoint">`（流程表模式，縮排 32px、寬度較窄）裡——因為 `msgHtml` 是同一份字串直接複用。`.action-badges` 本來就有 `flex-wrap: wrap`，在較窄的流程表縮排下偶爾多行是預期內、可接受的（「一行掃過去」原則是指每一筆 log 好認、不是保證絕不換行）。

平面模式的 `renderDisplayRow`（`logs.ts:260-270`）改成 `(row) => asTableRow(rowContent(row))`，`renderEntry`/`renderNotionCallRow`/`renderLineSendRow` 三個舊函式的「組 `<tr>`」部分被 `singleRowContent`/`notionCallRowContent`/`lineSendRowContent` + `asTableRow` 取代，可以刪除。

### D. 流程表整組渲染（起點/終點/summary，決定 2）

```ts
function renderFlowStartEndpointHtml(entry: LogEntry, detail: LogEntry | undefined): string {
  // 完全比照現有 renderFlowStartEndpoint（logs.ts:546-562）的邏輯原樣移植成 TS：
  // 用 entry.sourceType/detail.source.type 取得來源、entry.type 取得訊息類型、
  // detail.message 取得訊息內容摘要（messageLabel 邏輯一起搬過來當內部 helper）。
  // 這是刻意保留的「起點」敘事特殊渲染，不走通用渲染器（決定 1 的通用渲染器
  // 目標是 renderFlowMisc 那種純後備顯示，起點/終點是流程表既有的敘事骨架，
  // 兩者職責不同，不合併）。
  const levelNum = entry.level ?? 30;
  const levelName = LEVEL_NAMES[levelNum] ?? String(levelNum);
  const color = LEVEL_COLORS[levelName] ?? '#94a3b8';
  const c: RowContent = {
    levelName, color, time: entry.time ?? 0, reqId: String(entry.reqId ?? ''),
    msgHtml: /* 沿用原本 '事件進來 · type · sourceType · 內容' 組字串邏輯 */ '',
    detailText: '',
    searchableText: String(entry.msg ?? '').toLowerCase(),
    rawJson: '',
  };
  return asFlowEndpoint(c, '起點');
}

function renderFlowEndEndpointHtml(row: LineSendRow): string {
  // row 一定是 kind === 'line-reply'（FlowGroup.end 的型別已經是 LineSendRow，
  // 但實務上只會塞 line-reply，line-push 一律進 misc）。
  return asFlowEndpoint(lineSendRowContent(row), '終點');
}

function renderFlowGroupHtml(group: FlowGroup): string {
  const summary = (group.start ? '事件觸發' : (group.reqId ? '(無 Processing event 記錄)' : '背景/排程作業')) +
    ' → ' + group.steps.length + ' 次 API 呼叫 → ' + (group.end ? 'LINE reply' : '(無回覆記錄)');
  const reqIdHtml = group.reqId
    ? `<span class="reqid-link" onclick="event.stopPropagation(); filterByReqId(event,'${group.reqId}'); setViewMode('flat')">${escapeHtml(group.reqId)}</span>`
    : `<span class="reqid-link" style="cursor:default;opacity:.6">(無 reqId)</span>`;

  const stepsHtml = [
    group.start ? renderFlowStartEndpointHtml(group.start, group.startDetail) : '',
    ...group.steps.map((row) => asFlowItem(notionCallRowContent(row), 'flow-step')),
    ...group.misc.map((row) => asFlowItem(rowContent(row), 'flow-misc')),
    group.end ? renderFlowEndEndpointHtml(group.end) : '',
  ].join('');

  return `<div class="flow-group">` +
    `<div class="flow-header" onclick="this.parentElement.classList.toggle('expanded')">` +
    `<span class="flow-caret">▸</span>` +
    `<span class="time">${formatTime(group.firstTime)}</span>` +
    reqIdHtml +
    `<span class="flow-summary">${escapeHtml(summary)}</span>` +
    `</div>` +
    `<div class="flow-steps">${stepsHtml}</div>` +
    `</div>`;
}

function renderFlowView(displayRows: DisplayRow[]): string {
  const groups = buildFlowGroups(displayRows);
  if (groups.length === 0) return '<div class="flow-empty">No log entries found</div>';
  return groups.map(renderFlowGroupHtml).join('');
}
```

`renderHtml()`（`logs.ts:272-750`）的改動：

```ts
function renderHtml(entries: LogEntry[]): string {
  const displayRows = groupPairedEntries(entries);
  const flatRows = [...displayRows].reverse();

  const rows = flatRows.length > 0
    ? flatRows.map((row) => asTableRow(rowContent(row))).join('')
    : '<tr><td colspan="4" class="empty">No log entries found</td></tr>';

  const flowHtml = renderFlowView(displayRows);

  // 不再需要 <script type="application/json" id="display-rows-data"> ——
  // 兩種模式的 HTML 都已經在伺服器端算好，用戶端不用再重新分組/渲染。
  return `<!DOCTYPE html>...
    <div class="table-wrap" id="table-wrap">...${rows}...</div>
    <div id="flow-view">${flowHtml}<div id="flow-no-results">No matching log entries</div></div>
    <script>...(見 E 節)...</script>
  </html>`;
}
```

### E. 用戶端 JS：只剩 view 切換 + 篩選（決定 2）

**整段刪除**：`METHOD_COLORS_JS`/`MESSAGE_TYPE_LABELS_JS`/`methodBadge`/`escapeHtmlJs`/`formatFlowTime`/`messageLabel`/`rowReqId`/`rowTime`/`renderFlowStepDetail`/`renderFlowStep`/`renderFlowStartEndpoint`/`renderFlowEndEndpoint`/`renderFlowMisc`/`renderFlowGroup`/`buildFlowView`（`logs.ts:463-651`，共約 189 行），以及 `flowBuilt` 變數跟 `setViewMode()` 裡呼叫 `buildFlowView()` 的那個 `if` 分支（`logs.ts:449-450`、`457-460`）——流程表現在一開頁就已經是完整 HTML，不需要「第一次切到 flow 模式才 build」的 lazy-build 機制。

`setViewMode()` 簡化成純 class 切換（拿掉 flowBuilt 相關邏輯，其餘不變）：

```js
function setViewMode(mode) {
  viewMode = mode;
  document.querySelectorAll('#view-mode-filters button').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
  document.getElementById('table-wrap').classList.toggle('flow-hidden', mode === 'flow');
  document.getElementById('flow-view').classList.toggle('active', mode === 'flow');
}
```

`applyFilters()`（現有 `logs.ts:679-721`）要同時套用到平面模式的 `tr.log-row` **跟**流程表模式巢狀結構裡的 `flow-step`/`flow-misc`/`flow-endpoint`（決定 2 明確要求解決的技術問題——這是這次改動裡真正需要新設計的部分，不是單純搬程式碼）。設計：

- `asFlowItem`/`asFlowEndpoint`（C、D 節）已經幫每個流程表項目都加上跟 `tr.log-row` 完全一樣的四個篩選屬性：`data-level`/`data-time`/`data-msg`/`data-reqid`。
- 篩選邏輯本身（level/time 範圍/search/reqId 是否符合）抽成一個共用的判斷函式，`tr.log-row` 跟流程表項目都呼叫它，避免兩份判斷邏輯漂移。
- 流程表是巢狀的（`flow-group` > `flow-steps` > 個別項目），單一項目被篩掉不代表整組要消失；但如果一個 `flow-group` 底下**所有**項目都被篩掉，才隱藏整個 `flow-group`（rollup）。這跟平面模式「單一列符合條件就顯示」的語意是一致的，只是流程表多一層「這組還有沒有東西可看」的彙總判斷。
- reqId 篩選：跟平面模式一樣直接用 `data-reqid` 比對——因為流程表項目本來就是照 reqId 分組，篩到某個 reqId 時，同組其他項目的 `data-reqid` 也是同一個值，所以「篩掉不符合 reqId 的項目」跟「篩掉不符合 reqId 的整組」在流程表這裡會自然得到一致的結果（一組要嘛全符合、要嘛全不符合，不會組內一半符合一半不符合）。
- `flow-header` 點擊 reqId 連結時**維持現況**直接 `setViewMode('flat')` 跳去平面模式（不在流程表內原地套用篩選再展示）——這是既有互動，這次沒有理由改掉它，詳見文末「已自行決定」小節。

```js
function matchesFilters(el, cutoff, endCutoff, search) {
  const level = el.dataset.level;
  const time = Number(el.dataset.time);
  const msg = el.dataset.msg;
  const reqId = el.dataset.reqid;
  const levelMatch = activeLevel === 'all' || level === activeLevel;
  const timeMatch = time >= cutoff && time < endCutoff;
  const searchMatch = !search || msg.includes(search);
  const reqIdMatch = !activeReqId || reqId === activeReqId;
  return levelMatch && timeMatch && searchMatch && reqIdMatch;
}

function applyFilters() {
  const search = document.getElementById('search').value.toLowerCase();
  const now = Date.now();
  let cutoff;
  if (activeRange === 1) { const d = new Date(); d.setHours(0,0,0,0); cutoff = d.getTime(); }
  else if (activeRange === 2) { const d = new Date(); d.setHours(0,0,0,0); cutoff = d.getTime() - 86400000; }
  else { cutoff = now - activeRange * 86400000; }
  let endCutoff = Infinity;
  if (activeRange === 2) { const d = new Date(); d.setHours(0,0,0,0); endCutoff = d.getTime(); }

  // 平面模式（邏輯不變，只是改用共用的 matchesFilters）
  let visible = 0;
  document.querySelectorAll('#log-body tr.log-row').forEach(row => {
    const show = matchesFilters(row, cutoff, endCutoff, search);
    const nextRow = row.nextElementSibling;
    const isExtra = nextRow && nextRow.classList.contains('extra-row');
    row.classList.toggle('hidden', !show);
    row.classList.toggle('reqid-highlight', show && !!activeReqId);
    if (isExtra && !show) nextRow.classList.add('hidden');
    if (show) visible++;
  });
  document.getElementById('count-label').textContent = visible + ' entries';
  document.getElementById('no-results').style.display = visible === 0 ? 'block' : 'none';

  // 流程表模式：先逐項篩選，再依 flow-group 做 rollup
  document.querySelectorAll('#flow-view [data-level]').forEach(el => {
    el.classList.toggle('hidden', !matchesFilters(el, cutoff, endCutoff, search));
  });
  let visibleGroups = 0;
  document.querySelectorAll('#flow-view .flow-group').forEach(group => {
    const hasVisibleItem = group.querySelector('[data-level]:not(.hidden)') !== null;
    group.classList.toggle('hidden', !hasVisibleItem);
    if (hasVisibleItem) visibleGroups++;
  });
  const flowNoResults = document.getElementById('flow-no-results');
  if (flowNoResults) flowNoResults.style.display = visibleGroups === 0 ? 'block' : 'none';
}
```

`toggleExtra`/`copyFiltered`/`filterLevel`/`filterTime`/`filterByReqId`/`clearReqIdFilter` 不變（都已經是純 DOM 操作，不涉及渲染）。

### F. CSS 調整（決定 3 + 決定 4）

決定 3（等級色標，左側色條）：

```css
.flow-step, .flow-misc, .flow-endpoint { border-left: 3px solid #64748b; } /* 預設灰色，實際顏色由 inline style 的 border-left-color 覆蓋（每列各自的 LEVEL_COLORS 值，見 C/D 節的 asFlowItem/asFlowEndpoint） */
```

決定 4（截斷微調）：

```css
/* .tag-path 加寬（原本 max-width: 150px，logs.ts:342） */
.tag-path { /* 其餘屬性不變 */ max-width: 320px; }
```

`.action-content`（`logs.ts:353`）維持 `white-space: nowrap` + `text-overflow: ellipsis`（不放棄「一行掃過去」），但補上 `title` 屬性顯示完整未截斷內容——這需要在 `notionCallRowContent`/`lineSendRowContent` 組 `msgHtml` 時，把 `<span class="action-content">` 加上 `title="${escapeHtml(fullContentText)}"`（Notion 呼叫的 `fullContentText` 是 `purpose` 全文，本來就不長，加 title 主要是保險；LINE 呼叫的 `fullContentText` 是完整訊息內容拼接，目前的顯示是 `.slice(0, 80)` 截斷版——這裡把顯示截斷長度從 80 放寬到 160 字元，同時無論長度多少都加上完整內容的 title）。這兩處都是 `logs.ts` 既有程式碼裡的既存字面量，改動時原地調整即可，不影響函式簽名。

### G. 測試策略

**`src/routes/__tests__/logs.test.ts`（現有 7 個測試）**：
- 「renders log timestamps」「shows method/db badges」「shows the API endpoint path」「shows a purpose tag」「shows method/path badges...fully paired LINE reply」「shows the LOG_LEVEL=debug hint」這 6 個測試斷言的是平面模式 HTML 裡有沒有特定 class/文字（`tag-method`、`tag-db`、`tag-path`、`/pages/abc`、`tag-purpose`、`測試訊息內容A`、開 debug 提示文字）——這次改動後平面模式的 `<tr>` 內容形狀不變（只是產生路徑從「一個函式直接組字串」變成「`rowContent()` + `asTableRow()` 兩步」），這 6 個測試**應該原封不動繼續通過**，不需要改。
- 「renders a view-mode toggle」測試斷言 `id="flow-view"` 存在——這個字串仍然會出現，繼續通過；但這個測試現在應該**加強**，因為流程表模式終於變成可以用 supertest 直接驗證內容的伺服器端 HTML 了（改版前流程表是空 `<div id="flow-view"></div>`，內容要等瀏覽器跑 JS 才會出現，`res.text` 驗證不到，所以現有測試才只驗證按鈕跟空殼存在）。

**新增測試（`logs.test.ts`）**：
- 通用渲染器（決定 1）：mock 一筆帶額外欄位的 entry（例如比照 `message-handler.ts:31` 的真實案例：`{ msg: 'handleMessage', userId: 'u1', text: '@Dobby +1', isAdmin: false, sourceType: 'group' }`），斷言 `res.text` 同時包含 `tag-field` class、`text` 這個 key 名稱、以及 `@Dobby +1` 這個 value（不用點開任何東西就看得到，驗證決定 1 說的「不點開也能看到」）。同時斷言 `level`/`time`/`msg`/`reqId`/`pid`/`hostname` 這些後設欄位本身不會被渲染成 `tag-field`（可以另外 mock 一筆只有後設欄位、沒有額外欄位的 entry，斷言它不出現 `tag-field`）。
- 通用渲染器的值格式化：分別 mock 陣列值（如 `tags: ['a', 'b']`，斷言渲染出 `a / b`）跟物件值（如 `meta: { x: 1 }`，斷言渲染出 JSON 字串）跟 `null`/`undefined` 值（斷言完全不出現該欄位的 tag）。
- 流程表伺服器端渲染（決定 2）：用既有的 mock fixture（`req-2` 那組 Notion call、`req-5`/`req-6` 那兩組 LINE reply）斷言流程表模式的 HTML（不透過任何 JS 執行，直接檢查 `res.text`）包含 `flow-group`、`flow-step`（Notion call 那組）、`flow-endpoint`（LINE reply 終點）、以及正確的 reqId 分組——例如斷言 `req-2` 那組跟 `req-5`/`req-6` 那組各自形成獨立的 `flow-group`，而不是全部混在一起。
- 流程表等級色標（決定 3）：斷言流程表項目的 HTML 裡有 `border-left-color` inline style 且不是統一的同一個顏色值（至少驗證 error/warn 等級的項目跟 info/debug 等級的項目色碼不同，避免退化成「加了 style 屬性但值都一樣」的假通過）。
- 決定 4 微調：斷言 Notion call 的 `action-content`/LINE send 的 `action-content` 有 `title` 屬性且內容跟顯示文字一致或更完整。

**`log-grouping.test.ts` 新增 `buildFlowGroups` 測試**：
- 兩筆不同 reqId 的 entries 分成兩個獨立 `FlowGroup`，且新的（`firstTime` 較大的）排在陣列前面（驗證「組跟組之間新的在前」）。
- 含 `'Processing event'` + `'Processing event detail'` 的一組，驗證兩者分別落進 `group.start`/`group.startDetail`，不落進 `group.misc`。
- 含一筆 `notion-call` 跟一筆 `line-reply` 的一組，驗證 `notion-call` 落進 `group.steps`、`line-reply` 落進 `group.end`。
- 一筆沒有配對到 `Processing event`/`notion-call`/`line-reply` 的 single 行（例如 `handleMessage`），驗證落進 `group.misc`，且**組內順序維持原本的時間升冪**（不會被搬到最前面或最後面）。
- 一筆 `line-push`（沒有 reqId，落在 `''` 桶）驗證落進 `group.misc` 而不是 `group.end`（`line-push` 不算流程終點，只有 `line-reply` 算）。

**測試範圍外、需人工驗證的部分**：`applyFilters()`/`matchesFilters()` 這些用戶端 JS 篩選邏輯無法用現有 vitest 設定（`vitest.config.ts` 是 `environment: 'node'`，沒有 jsdom/happy-dom，`supertest` 只送 HTTP request 不執行回應裡的 `<script>`）驗證，這是這次改動前後都存在的既有限制，不在這次規格新增測試涵蓋範圍。實作完成後，比照 `MEMORY.md` 記錄的既有手動驗證流程（ngrok 接真實帳號），開 `/logs` 頁面手動測試：切換平面/流程表模式、四種 level 篩選、三種時間範圍篩選、search 輸入、點某一列的 reqId 連結再確認流程表模式下對應的組會被正確篩選/高亮。

### 已自行決定、非懸而未決問題（供實作者參考，不用回頭問使用者）

以下都是本規格明確定案、或決定 1-4 文字裡已經明講「由實作者判斷」的地方，記錄下來只是讓實作者知道有考慮過取捨、不用自己再猶豫一次：

- **`messages` 陣列欄位不再有專屬聊天泡泡樣式，改走通用渲染器的 `tag-field`。** 這不是我自己發明的取捨——決定 1 的後設欄位排除清單明確只有 6 個（`level`/`time`/`msg`/`reqId`/`pid`/`hostname`），沒有排除 `messages`，逐字照做的結果就是如此；且這個路徑只有 `groupPairedEntries` 沒吸收成 `LineSendRow` 的 orphan case 才會走到，影響面很小。
- **通用渲染器的截斷長度（60 字元）、LINE 內容預覽長度（80→160 字元）、`.tag-path` 寬度（150→320px）**：這些數字都是決定 4 文字裡明說「由實作者判斷哪種組合最合理」的範圍，選這幾個數字是為了在「一行掃過去」的密度跟「看得到足夠內容」之間取平衡，不是隨意拍板；如果實作後發現太寬/太窄，之後可以再微調，不影響整體架構。
- **等級色標選左側色條（`border-left`），不是圓點或 badge。** 決定 3 文字裡明說由實作者判斷哪種視覺在流程表的縮排敘事結構裡最不突兀——色條在既有的 `.flow-step`/`.flow-misc`/`.flow-endpoint` 這種一行一行往下排的區塊裡最不會搶走原本內容的視覺焦點，且跟現有 `.flow-group` 的邊框視覺語言（`border: 1px solid`）一致，不算新發明一套視覺系統。
- **流程表模式的 Notion call/LINE send 項目重用跟平面模式一樣的 `.action-row` grid 版面**，不是流程表原本那種更精簡的單行敘事（`renderFlowStep` 原本只顯示 `icon + purpose + methodBadge`，比平面模式簡省）。這是決定 2「只寫一份 TypeScript 函式，兩種模式共用同一份渲染結果」的必然結果——`msgHtml` 是同一個字串直接複用，沒有另外維護一份更精簡的流程表專用版面。代價是流程表在窄縮排下偶爾會有徽章換行，判斷是可接受的（`.action-badges` 本來就有 `flex-wrap`）。
- **流程表 `flow-header` 的 reqId 連結維持現況直接跳去平面模式（`setViewMode('flat')`），不會在流程表內原地套用篩選。** 這是既有互動（改版前就是這樣），這次决定 2 的篩選需求（文末技術問題）是「兩種模式都要能被篩選」，不是「流程表要新增一個原地篩選的入口」——現有入口跳去平面模式仍然可以達成同樣的篩選效果（因為 `applyFilters()` 现在两个模式都会套用同一份 filter state），沒有必要為此新增互動或改變既有連結的行為。

### 驗收標準

- [ ] `renderHtml()` 產生的 HTML 一次包含平面模式跟流程表模式兩份完整內容，`#flow-view` 不再是空殼、不再依賴 `<script type="application/json" id="display-rows-data">`（這個 `<script>` 標籤整個移除）。
- [ ] `logs.ts` 的 client `<script>` 區塊裡不再有任何 HTML 字串組裝/JSON.parse 邏輯，只剩 DOM class 切換跟篩選判斷。
- [ ] 任一筆帶有非既知欄位（例如 `text`/`isAdmin`）的 log entry，不點開就能在平面模式跟流程表模式看到那些欄位值，且新增一種欄位不需要改 `logs.ts`/`log-grouping.ts` 任何一行。
- [ ] 流程表模式的每一列都有跟平面模式一致、來源同一份 `LEVEL_COLORS` 的等級色標。
- [ ] 長 Notion path/長 LINE 訊息內容在兩種模式下都至少能透過 hover tooltip 看到完整內容，不需要每次都點開展開區塊。
- [ ] Level/Time/Search/reqId 四種篩選在流程表模式下都能正確運作，包含「一個 flow-group 底下所有項目都被篩掉時，整組隱藏」的 rollup 行為。
- [ ] `npm run test`（或對應的 vitest 指令）全數通過，含本規格列出的新增測試。
- [ ] 手動用 ngrok 打開 `/logs` 驗證一輪（平面/流程表切換、四種篩選、reqId 連結跳轉）。

---

## 手動測試追蹤（ngrok 接真實 LINE 帳號測試）

> 每項測完打勾，機器人實際回應貼進該項下方的 code block（原文照貼、保留換行），有問題另加「備註：」說明差異。

- [ ] 全形 `＋`/`－` 符號 —— 程式碼已支援（`command-parser.ts`／`registration-parser.ts` 的 `normalizeFullWidth()`），只需要實際傳 `@Dobby ＋1` 這種全形指令驗證一次即可，不需要改 code
- [ ] 清除測試產生的 Notion 假資料

---

## 已評估、不採納

- **表格驅動指令解析與路由**（`/improve-codebase-architecture` 報告候選 3，Speculative）— 評估後不採納。理由：(1) 各 command handler 簽名不一致（7 種不同形狀，從 `(replyToken, botId)` 到 `(event, delta, botId, isAdmin)`），單一表格 row 形狀塞不下這些差異；(2) 報告自己也承認 deletion test 不明確，拆掉 `command-parser.ts`/`command-router.ts` 可能只是把 switch 搬位置，不會真正集中複雜度；(3) 唯一有具體壞味道支撐的症狀（courtOverride 解析邏輯被拆到兩個 module）已用小範圍修法解決，`next?c=N` what-if 預覽見 `docs/commands.md`。若未來新增指令的頻率明顯提高、且 handler 簽名先被拉齊，可重新評估。
- **[1.2] `people-repository.ts`/`season-repository.ts`/`announcement-repository.ts` 查詢分頁處理** — 評估後不採納。目前社團規模（未結清人數、season 數、公告內容）遠低於 Notion 單頁 100 筆上限，此狀況實務上不會發生，不需為此增加分頁邏輯的複雜度。
- **[2.1] `member-joined-handler.ts` 多人同時加入群組時用 `pushMessage` 補發歡迎訊息** — 評估後不採納，不修正。原因：此專案原則上不使用 `pushMessage`（唯一例外是既有的 `weekly-push.ts` 週報推播，見 `CLAUDE.md` 專案慣例），不為此問題新增 push 用法。第一位以外的成員收不到歡迎訊息維持現況。

---

## 程式碼審查待修問題（2026-09-17 分模組審查）

> 全專案依模組（Notion 資料層 / LINE 整合 / 指令系統 / 報名請假核心 / 排程與基礎設施）分開派 subagent 審查。**完整技術細節、程式碼片段、每個模組「確認沒問題」的部分見 [`docs/code-review-2026-09-17.md`](docs/code-review-2026-09-17.md)**，章節編號（如 `[4.1]`）與下方清單一一對應。已修復且有文件記錄的項目已移除，見對應 `docs/*.md`／`docs/adr/*.md`。

### 🟢 Low

- [ ] **[1.5] `users-repository.ts:78-82` `incrementMessageCount` + `user-management.ts:47` 讀取→計算→寫回沒套 `withMutex`，連續訊息可能遺失計數。** 僅影響統計欄位，非報名核心邏輯，優先度低。
- [ ] **[1.6] `blocks-to-text.ts` 不遞迴處理 `has_children` 區塊，公告若用 toggle/巢狀清單會整段被靜默丟掉。**
- [ ] **[1.7] `season-repository.ts:32-35` `findAll()` 全專案找不到呼叫點，疑似死碼，建議清掉或補上呼叫端。**
- [ ] **[2.4] `member-joined-handler.ts:16` 來源是 `room`（非 `group`）時跳過 profile 查詢，歡迎訊息直接顯示 userId 而非暱稱，其實 `getProfile` 支援不帶 groupId 查詢。**
- [ ] **[2.5] `webhook.ts:12-13` `req.body.events` 用 `as` 斷言掩蓋型別，沒有執行期防呆，欄位缺失會同步拋 TypeError。**
- [ ] **[2.6] `index.ts:14` 直接讀 `process.env['NODE_ENV']`，沒有走 `env.ts`，違反慣例（目前無實害）。**
- [ ] **[3.3] `command-parser.ts:37-45` mention 分支用無錨點 regex（`/[+\-]\d+/`、`/假\|銷假/`）掃整個 body，若代操作目標的暱稱含 `-1`/`+2`/「假」字可能誤判指令類型。**
- [ ] **[3.4] `command-parser.ts:63` `body.startsWith('next')` 沒有字界檢查，任何 next 開頭訊息都被當 NEXT_EVENT（非安全問題，UX 小瑕疵）。**
- [ ] **[3.5] 指令系統測試覆蓋缺口：`command-router.ts`/`command-list.ts`/`owe.ts`/`participants.ts`/`payment.ts`/`introduce.ts` 都沒有對應測試檔。**
- [ ] **[4.5] `capacity-calculator.ts:46-52` 名額為負數時錯誤訊息顯示負數（如「剩餘 -3 個名額」），純顯示問題。**
- [ ] **[4.6] `delta=0`（`+0`/`-0`）邊界情況：目標已有報名時仍會多打一次無意義的 Notion 寫入並回「取消報名成功」，但實際什麼都沒變；目標無報名時則正常回錯誤，行為不一致。**
- [ ] **[4.7] 一般成員打錯目標語法（漏了 `@`）會收到「你不是管理員」而非「指令格式錯誤」——`handleRegistration` 的管理員檢查順序在 `parseError` 檢查之前，容易誤導使用者，非安全問題。**
- [ ] **[5.8] `utils/logger.ts:4` 直接讀 `process.env['NODE_ENV']`，繞過 `env.ts`（目前因 import 順序無實害）。**
- [ ] **[5.9] `env.ts:15` `PORT` 是 `z.string()` 用 `parseInt` 轉型，填非數字字串會得到 `NaN` 導致 `app.listen(NaN)` 監聽隨機 port 而非 fail-fast。建議改 `z.coerce.number().int().positive()`。**
- [ ] **[5.10] `data/auto-reply.json` 多組 trigger 重複出現兩次以上（「朋友」「雙胞胎」及多個哈利波特咒語），後面那組（疑似改寫成療癒語氣的版本）永遠是死碼，`findReply` 抓第一個符合就回傳。需與內容維護者確認是否刻意設計。**
- [ ] **[5.11] `user-management.ts:16-47` `_trackUserAsync` 讀取→計算→寫回沒套 `withMutex`，fire-and-forget 下同一使用者連續發訊息可能漏算訊息計數/群組清單，僅影響統計。**
