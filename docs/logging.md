# 日誌查看器（/logs）

`GET /logs` 是內建的日誌查看頁面（需要 `LOGS_ACCESS_TOKEN`，見 `docs/development.md` 的環境變數表）。日誌檔案本身的保留機制、時區、Docker log driver 限制記錄在 `docs/overview.md` 的「日誌」小節——這份文件只講這個網頁本身怎麼用。

## 兩種檢視模式

頁面上方 View 區塊可切換：

- **平面模式**（預設）：所有 log 依時間排序的表格，支援 level/時間範圍/關鍵字搜尋、點擊 `reqId` 篩選出同一個事件的所有記錄、「Copy filtered logs」一鍵複製目前篩選結果。要跨事件搜尋（例如找某個錯誤訊息出現過幾次）用這個。
- **流程表模式**：把同一個 `reqId`（同一次 LINE 事件的完整處理過程）收合成一組，由新到舊排列，組內依時間順序顯示「事件進來 → 中間的 API 呼叫 → LINE 回覆」。要看「這次使用者的指令實際觸發了哪些步驟」用這個，不用自己在平面模式裡手動比對時間。

## 合併顯示

一次 Notion API 呼叫在底層其實會產生好幾行 log（輕量的 info 摘要 + 完整內容的 debug payload，request 跟 response 各一組），LINE 回覆/推播也是「準備送出」跟「已送出/失敗」各一行。兩種模式都會把這些行自動合併成一個項目顯示，不會讓你在表格裡看到一堆片段的行要自己對應：

- **Notion API 呼叫**：顯示成功/失敗/尚無回應（✓/✕/⏳ 圖示）、method 徽章、資料庫名稱（能猜到的話，見下方「endpoint path」）、目的標籤（`withPurpose()` 設的，說明這次呼叫是為了什麼）。點擊該列可展開看完整的 request/response 內容——如果當時 `LOG_LEVEL` 不是 `debug`，這部分只記錄了摘要沒有完整內容，展開會看到提示文字（例如「開 LOG_LEVEL=debug 才能看到完整回應內容」），不會是空白。
- **LINE 回覆/推播**：跟 Notion API 呼叫一樣現在也有 method/path 徽章（例如 `POST /v2/bot/message/reply`），顯示成功/失敗圖示 + 訊息內容預覽，點擊展開看完整訊息陣列跟失敗原因（如果有）。配對同一次呼叫的「準備送出」跟「已送出/失敗」兩行時，底層用的是呼叫當下產生的專屬 `sendId`（不是比對 `to`/`messages` 內容），所以兩個內容完全相同但不同次的呼叫不會被誤配對成同一次。

## 訊息內容跟身分識別資訊只在 debug 層

LINE 回覆/推播的訊息全文，以及 groupId/userId 這類身分識別資訊，比照 Notion API 的 body 一樣搬到 `debug` 層記錄。預設 `LOG_LEVEL=info` 下，`/logs` 頁面的平面模式跟流程表模式都只會看到 method/path 徽章跟「開 `LOG_LEVEL=debug` 才能看到訊息內容」的提示，看不到訊息原文——**這是刻意的設計，不是 bug**。要看訊息實際內容（除錯用），把環境變數 `LOG_LEVEL` 設成 `debug` 再重啟服務即可。

`profile-service.ts` 的 `getProfile()` 現在也有一行摘要 log（`'LINE get profile'`，成功/失敗都有），但沒有被流程表特別合併/配對顯示——會以一般單行的形式出現在平面模式的表格列裡，流程表模式則會落在雜項（misc）區塊。

## 429 重試怎麼顯示

Notion API 回應 429（rate limit）時程式會自動重試，同一次呼叫因此會在底層產生好幾行 request log。這些重試會被辨識成同一次呼叫、合併成**一個**項目，不會變成好幾個各自獨立、容易讓人誤以為是不同呼叫的項目；合併後的項目上會標「重試 N 次」。

## Endpoint path

Notion API 呼叫的方法/資料庫徽章旁邊會顯示實際打的 path。這對 `GET /pages/{id}` 這類呼叫特別重要——這種 path 裡不含任何資料庫 ID（頁面 ID 跟資料庫 ID 是兩回事），所以猜不出資料庫名稱、不會有資料庫徽章，path 是唯一能看出「這次到底打了哪個 endpoint」的資訊。Path 太長時畫面上會截斷，完整內容可以滑鼠 hover 看，或展開該列的完整明細。

耗時（`durationMs`）也記錄在 Notion API 呼叫的展開明細裡（`耗時: Xms`）——量的是單次 HTTP 呼叫本身的時間，429 重試時每次 attempt 各自獨立量測，不含重試等待時間。

## reqId 篩選

平面模式表格裡任何一列的 `reqId` 都可以點擊，會篩選出同一個 `reqId` 底下的所有記錄；流程表模式的每個分組標題也可以點擊 reqId 直接跳回平面模式並套用同樣的篩選。這個機制底層是 `request-context.ts` 的 `runWithContext`，同一次事件處理過程中所有 log 都會自動帶上同一個 `reqId`（見 `docs/architecture.md` 的「Request Correlation ID」小節）。
