# Dobby

羽球社 LINE bot。TypeScript + Express，Notion 為主要資料庫。詳細文件見 [`docs/README.md`](docs/README.md) — 不要在這裡重複那邊已有的內容。

## 開發前必讀

依任務內容找對應文件，不要全讀 → [`docs/README.md`](docs/README.md) 的目錄表有「什麼情境該讀」欄位。

另外開工前用任務關鍵字 grep `TODO.md`（已知問題 / 待確認事項），避免重複踩雷；只讀命中的條目，不要整份讀。提出重構、效能優化、新機制之前，先 grep `docs/rejected-proposals.md` 確認沒被否決過。

## 專案慣例

- **新增指令**：`types/commands.ts` 加枚舉 → `command-parser.ts` 解析 → `commands/` 建 handler → `command-router.ts` 掛路由 → 決定是否列進指令清單卡 `command-list-card.ts`（若列出，是否為管理員限定）→ 更新 `docs/commands.md`（6 步驟，見 `docs/development.md`）。
- **Notion 存取一律走 repository**（`src/services/notion/*-repository.ts`），不要在 handler 裡直接呼叫 Notion SDK。
- **新增 repository 的 export 入口函式**（會被 command handler 直接呼叫的那個，不是內部 helper）要用 `withPurpose('...')`（`src/utils/request-context.ts`）包住函式本體，`/logs` 頁面的事件時間軸才看得到這次 Notion 呼叫的目的。不用改函式簽名、不用改呼叫端。理由見 `docs/adr/0005-purpose-context-layered-on-reqid.md`。
- 上面幾條能用 grep 判斷的（`pushMessage`、Notion SDK 直接 import、`process.env`、repository export 沒包 `withPurpose`）由 `scripts/check-conventions.sh` 檢查，編輯 `.ts` 後和 commit 前的 hook 會自動跑。只轉呼叫其他已標註函式的 repository export（例如快取包裝），在 export 上一行加 `// purpose-exempt: <理由>`。
- **讀取 → 計算 → 寫回的操作用 `withMutex`**（`src/services/mutex.ts`），key 用活動日期字串（例如 `2026-05-09`），不用 Notion 頁面 ID（避免多一次查詢才能知道 lock key）。報名、請假都遵循此模式。
- **環境變數只能加在 `src/config/env.ts` 的 zod schema**，缺值要 fail-fast，不要用 `?? fallback` 掩蓋。
- Notion API 有 rate limit（~3 req/s），批次操作間要加 delay（參考 `schedulers/display-name-update.ts` 的 400ms）。
- **回覆一律用 `replyMessage`，不用 `pushMessage`**：bot 用的是 LINE 免費方案，push 訊息每月有額度上限，而指令都是透過 webhook 觸發，用 replyToken 回覆就夠了。replyToken 用盡等邊界情況也不改用 push 補發。唯一例外是既有的 `schedulers/weekly-push.ts` 週報推播。

## 開發流程

- **TODO.md 項目完成後即刪除**：確認機制已落實且有對應文件記錄，直接從 `TODO.md` 移除該項目，不要留著打勾當紀錄（歷史脈絡交給 git commit / docs 保留）。
- **TODO 條目分兩級，先判斷再寫**：預計下一個 session 就要處理的，只寫一行（標題＋檔案:行號＋一句現象），不派驗證 agent——在長 session 尾端寫完整條目約 0.3M token，常比直接修還貴。要先討論再實作的事，也不要「先寫進 TODO 再實作」，決策在實作後寫進 ADR。會擱置一段時間、或牽涉多模組的，才用下面的完整格式。
- **完整格式的「問題／技術債觀察」TODO 條目**（非單純打勾清單，如「手動測試追蹤」那種），要讓全新、無背景的 session 只讀這條文字就能接手，不能預設讀者知道這次對話的來龍去脈。至少包含：(1) 具體檔案路徑＋行號，不是抽象描述問題；(2) 明講是否為 bug、有無不一致／出錯風險——「現在沒事」的理由要寫清楚，若有未來風險（例如之後改動忘記同步）要具體寫出風險情境會長怎樣，不能只停在「暫時沒事」；(3) 修復方向用條件句（「如果要處理...」）而非指令句，已知陷阱要明講（例如「不能無腦合併，因為兩處吃的資料形狀不同」），避免後續 agent 誤判成急件或做出超出範圍的修改。條目牽涉多個模組、或修復方向有容易誤判的陷阱時，寫完可以派一個全新、無背景的 subagent 只讀這條 TODO 文字，驗證事實是否正確、單看文字是否足以理解範圍與風險，再依回饋修文字；單一檔案、範圍明確的小條目不用派。
- **功能等級變更完成後用 subagent 做 code review**：新增指令、新增/修改 repository 方法、修改報名/請假/容量計算等核心邏輯，都要透過 Agent 工具（或 `/code-review`）審查後才算完成；純文件修正、typo、單純補測試不在此限。程式審查和文件同步檢查合併成**一個** agent（檢查清單照 `/doc-sync` 的項目），不要分開派兩個各自從頭讀同一批檔案。「docs 其他地方還有沒有矛盾」這類廣域掃描，由主 session 先 grep 一次，把命中的檔案:行號貼進 prompt，不要讓 agent 開放式搜尋。範圍小、不碰核心邏輯的修正可以指定 `model: "sonnet"`；動到 mutex、報名／請假、容量計算時維持預設模型。整套收尾（review → 修正 → doc-sync → commit）可以用 `/ship` 一次跑完。
- **功能確認完成後同步文件**：跑 `/doc-sync`（`.claude/skills/doc-sync/SKILL.md`），照清單修正 `docs/` 對應文件（README 目錄表 + 相關 `docs/*.md`／ADR）與 `TODO.md`，避免產生新的文件/程式碼落差。
- **一個行為只在一份主文件描述**（主文件對照見 `/doc-sync` 第 2 步），其他文件一句話加連結，不重述細節，否則每次改動要同步 5–8 份文件。**ADR 是當時決策的快照**，後續改動推翻或補充時不改本文，只在標題下加一行「後續變更：見 ADR 00NN」。`docs/archive/` 是歷史快照，不同步。
- **派 subagent 前備妥背景知識**：prompt 需包含相關檔案路徑/行號、已排除的方案與原因、既有慣例限制，不要只給任務標題，避免 subagent 重新摸索或做錯方向。跟任務相關的 `TODO.md` 條目直接把原文貼進 prompt，並註明不用整份讀 `TODO.md`。

## 測試

用 `createTestBot`（`src/test-utils/`）一行驅動 bot 並斷言 LINE 回覆內容 + Notion 呼叫。測試檔開頭需 mock `notion-fetch.js`、`config/line.js`、`services/mutex.js`（見 `src/test-utils/README.md`）。不要用 `npm run record-fixtures` 覆蓋 `src/test-utils/fixtures/` 下手寫的合成 fixture。

跑測試一律用 `npm run test:brief`（可接 `-- <檔案>` 或 `-- -t "名稱"`）：固定 `--dir src`、通過只印摘要、失敗只印失敗報告，不要自己組 `npx vitest ... | grep` 管線；派 subagent 時 prompt 也寫這個指令。`git commit` 前有 hook（`.claude/hooks/pre-commit-check.sh`）自動跑 tsc＋測試，失敗會擋下。

## 永遠用繁體中文回應
