# 日誌查看器（/logs）

`GET /logs` 是內建的日誌查看頁面（需要 `LOGS_ACCESS_TOKEN`，見 `docs/development.md` 的環境變數表）。日誌檔案本身的保留機制、時區、Docker log driver 限制記錄在 `docs/overview.md` 的「日誌」小節——這份文件只講這個網頁本身怎麼用。頁面明明沒東西可看、但 bot 其實還在正常處理流量（`docker compose logs app` 有動靜），通常不是這個頁面的問題，是 log 檔案本身出了狀況，見 `docs/overview.md`「日誌」小節裡「千萬不要對正在跑的容器直接 `rm` log 檔案」那段。

## 主從式版面：事件列表 + 處理過程時間軸

頁面左側是「事件」列表，每個事件對應同一個 `reqId` 底下的完整處理過程（一次 LINE 事件、一次排程執行，或一筆完全無關聯的系統層級訊息）；點一個事件，右側會顯示它的完整處理過程時間軸。不是「先看扁平表格、再切換到流程表」的兩段式設計——一次只看一個事件的完整故事，跟 `docs/architecture.md`「Request Correlation ID」小節說的 reqId 分組概念直接對應。

左側列表上方有五個分頁：

- **全部**：所有事件，由新到舊排列。
- **需要注意**：只顯示狀態不是「完成」的事件（降級／警告／失敗）。
- **訊息**：LINE 事件觸發的事件——指令、一般對話（自動回覆）、成員加入都算在內。
- **排程**：排程觸發的事件（`weekly-push`/`display-name-update`，見下方「事件種類」）。
- **系統**：跟任何一次事件處理都無關的系統層級訊息（例如 webhook 簽章驗證失敗）。

搜尋框比對的是事件標題、預覽內容、`reqId`、使用者顯示名稱/userId、「來自」欄位，不是逐行比對 log 訊息文字。

事件卡片跟時間軸的完整內容都是伺服器端一次算好、跟著頁面一起送出，切換分頁、搜尋、選擇事件都只是顯示/隱藏已經渲染好的區塊，不需要等瀏覽器重新整理或重新計算。

## 事件種類

每個事件會被分類成五種之一，決定列表上的標籤樣式跟分頁歸屬：

| 種類 | 判斷依據 | 分頁 |
|------|----------|------|
| 指令 | 有 `Processing event`（`type: 'message'`），且底下有 `Routing command` 或 `Message looks like command but failed to parse`（兩者都只會從 `isCommand(text)` 判定為真的分支發出，即使後者代表解析失敗也一樣算指令） | 訊息 |
| 對話 | 有 `Processing event`（`type: 'message'`），但不是指令——通常是自動回覆（`services/auto-reply.ts`，靜態 JSON） | 訊息 |
| 加入 | `Processing event` 的 `type` 是 `join` 或 `memberJoined` | 訊息 |
| 排程 | 沒有 `Processing event`，但有 `reqId`——`weekly-push.ts`/`display-name-update.ts` 各自用 `runWithContext` 包住整次執行（見下方「排程事件的 reqId」） | 排程 |
| 系統 | 完全沒有 `reqId`，且不是伺服器生命週期訊息（見下方「服務重啟分隔線」）——目前有三種已知情況：LINE webhook 簽章驗證失敗（`index.ts` 的全域錯誤處理，發生在事件處理、也就是 reqId 產生之前，真正的異常）、`webhook.ts` 一次收到兩筆以上事件時的批次提示（正常、預期內的情況，不是錯誤）、`log-upload.ts` 在 R2 未設定時於啟動時記一次的提示（debug 層，非錯誤）。這三種各有各自的「來自」文案，其餘未知的無 reqId 訊息會退回一個通用的「（未知系統來源）」 | 系統 |

**指令 vs 對話只有在 `LOG_LEVEL=debug` 才能準確判斷**——`Routing command`/`Auto-reply lookup`/`Skipping auto-reply for admin` 全部是 debug 層。`LOG_LEVEL=info` 下這些線都不存在，程式碼退而用「這個流程有沒有 Notion API 呼叫」猜測（指令通常會查/寫 Notion，單純聊天不會），可能誤判，不是決定性的依據。

## 每個事件卡片顯示什麼

列表裡每張卡片顯示：狀態圓點（綠/黃/紅）、種類標籤、標題、時間、使用者顯示名稱與 userId（有才顯示，預設遮蔽，見下方）、內容預覽、來源、總耗時、以及重試次數/失敗種類的小標記（如果有）。

- **標題**：訊息類事件用 `Processing event detail`（debug 層）解析出的指令/對話文字加引號；加入事件顯示事件類型；排程/系統事件用它自己第一筆摘要 log 的訊息名稱當標題。
- **來源**：訊息類事件顯示群組／多人聊天室／1 對 1；排程顯示「排程 · cron」；系統顯示「HTTP · POST /webhook」。
- **來自**（詳情頁欄位）：指令類事件顯示 `Routing command` 的 `command.type`（debug 層才有，否則顯示「（未知，需要 LOG_LEVEL=debug）」）；對話顯示「自動回覆（非指令）」；加入顯示事件類型（`join`/`memberJoined`）；排程顯示排程檔案的短名稱（`weekly-push`/`display-name-update`，靠比對已知的摘要 log 訊息辨認，猜不到就顯示「排程作業」）；系統顯示「index.ts 錯誤處理」。
- **狀態**（完成／完成（有降級）／警告／失敗）：見下一節。

## 狀態判定：完成／降級／警告／失敗

狀態不是單純看 log level 最高到哪裡，判斷順序如下（愈前面優先權愈高）：

1. **失敗**：Notion API 呼叫失敗，或 LINE 回覆/推播失敗——不論那筆失敗 log 實際記錄的 level 是 warn 還是 error，一律算失敗。
2. **警告**：看起來像指令（見上方「事件種類」），但整個流程從頭到尾沒有送出任何 LINE 回覆——通常代表指令解析失敗（例如日期格式不符），使用者完全沒收到反應。這種「安靜的失敗」跟真正的錯誤分開標示，方便定期檢查指令說明是不是不夠清楚。這個規則只套用在指令類事件，不套用在對話（自動回覆本來就常常沒有關鍵字命中、不回覆是正常行為，不該被標成警告）。
3. **完成（有降級）**：流程仍然正常送出了回覆，但過程中出現已知的、不影響最終結果的降級訊息——目前認得三種：

   | 訊息 | 什麼情況 |
   |------|----------|
   | `Could not get user profile` | LINE profile API 呼叫失敗，只能用 userId 顯示，看不到顯示名稱 |
   | `buildMemberJoinedWelcome error, using fallback` | 從 Notion 讀取歡迎詞失敗，送出的是內建備用文案 |
   | `User tracking failed (non-blocking)` | 使用者訊息計數/群組清單更新失敗，不影響這次回覆 |

   出現這些訊息時，詳情頁標題下方會有一塊黃色的降級原因說明。這個判定故意跟 log level 分開處理——`buildMemberJoinedWelcome error, using fallback` 是 `logger.error`，但歡迎訊息其實正常送出了，全部算「失敗」會蓋掉「其實有正常運作，只是走了備援路徑」這個更重要的訊息。
4. 剩下的才照這個事件底下所有 log 行的最高等級（warn → 警告，error/fatal → 失敗）判定；都沒有就是「完成」。

## 處理過程時間軸

點開一個事件，右側依時間順序畫出這個事件的完整處理過程（`stepsHeading` 依種類略有不同：訊息類是「處理過程」，排程是「執行過程」，系統是「發生了什麼」），每一步左側有跟等級對應的色點（綠 info、藍 debug、黃 warn、紅 error），不用點開也看得出哪一步異常。時間軸嚴格依時間排序（Notion 呼叫、其他 log、LINE 收發全部混在一起排，不是先列完所有 Notion 呼叫、再列雜項）。

同一次 Notion API 呼叫底層會產生好幾行 log（輕量 info 摘要 + 完整內容的 debug payload，request 跟 response 各一組），LINE 回覆/推播也是「準備送出」跟「已送出/失敗」各一行；時間軸會把這些自動合併成一步：

- **Notion API 呼叫**：步驟標題優先顯示 `withPurpose()` 設的目的（沒有的話退回「Notion API 呼叫」），旁邊顯示實際打的 `method path`跟耗時。點擊該步驟可展開看完整的 request/response 內容——顯示成可以逐層收合/展開的 JSON 樹，超過兩層巢狀預設收合。`LOG_LEVEL` 不是 `debug` 時只記錄了摘要，展開會看到提示文字（例如「開 LOG_LEVEL=debug 才能看到完整回應內容」），不會是空白。失敗時標題不變、下方會多一塊紅色的錯誤提示（含 HTTP 狀態碼）。
- **LINE 回覆/推播**：標題是「LINE 回覆已送出/失敗」或「LINE 推播已送出/失敗」，旁邊顯示 `method path`。成功且抓得到訊息內容（`LOG_LEVEL=debug`）時，下方會有一個引用框顯示 Dobby 實際送出的訊息全文；失敗時引用框標題改成「這則訊息沒有送出」，上方另有一塊紅色的失敗原因。點擊步驟一樣可以展開看完整明細。

配對「準備送出」跟「已送出/失敗」兩行時，底層用的是呼叫當下產生的專屬 `sendId`（不是比對 `to`/`messages` 內容），所以兩個內容完全相同但不同次的呼叫不會被誤配對成同一次。

「起點」（收到訊息）這一步現在也帶 LINE 遞送層級的兩個欄位——`webhookEventId`（這次 webhook 事件的唯一識別碼）跟 `isRedelivery`（LINE 是不是在重送同一筆事件）。這兩個都是 info 層，不用開 `LOG_LEVEL=debug` 就看得到；它們本來記在 `webhook.ts` 收到整批 webhook payload 時的一行獨立摘要（`'Webhook received'`），但因為一次 webhook 幾乎永遠只有一筆事件，那行摘要跟緊接著的「起點」幾乎是重複資訊，還沒有 `reqId` 可用，所以直接搬進「起點」這一步；只有在 LINE 真的一次遞送兩筆以上事件時（極少見），才會另外看到一行 `Webhook received multiple events`。

點擊「起點」這一步可以展開看這次 webhook 事件的完整原始內容（`Processing event`/`Processing event detail`——後者是 debug 層才有的完整 `source`/`message` 物件）。沒開 `LOG_LEVEL=debug` 時，展開後只看得到 `Processing event` 的欄位跟一句「開 LOG_LEVEL=debug 才能看到完整 webhook event 內容」的提示，不是不能點開、也不是空白。

## 其他類型 log 的通用顯示

不屬於 Notion API 呼叫或 LINE 回覆/推播的 log（例如 `handleMessage`、`Routing command`、`Registration updated`、`Leave status updated`、`Event processed` 這類事件/業務摘要 log），一樣會出現在時間軸上，不需要程式碼另外處理：步驟標題就是這筆 log 的 `msg`，除了 `level`/`time`/`msg`/`reqId`/`pid`/`hostname` 這幾個後設欄位以外的其餘欄位，會自動接在下面顯示成一行 `key: value`（值太長會截斷，滑鼠 hover 可以看到沒有截斷的完整內容）。

這代表**之後新增一種 log 訊息或幫既有 log 多加一個欄位，`/logs` 頁面完全不用改**——只要程式碼裡呼叫 `logger.info({...})`/`logger.debug({...})`，畫面上就會自動有對應的顯示，不需要像 Notion 呼叫/LINE 收發那樣額外寫一份專屬的顯示邏輯。這個通用機制只是單純把值印出來，不會做欄位語意上的解讀（例如布林值就是印 `true`/`false`，物件會印成 JSON 字串），所以想要更精緻的呈現方式（自訂標題、狀態顏色）還是要走 Notion 呼叫/LINE 收發那種專屬顯示。

排程事件的預覽文字（列表卡片上那行）也是靠這個通用機制：沒有 LINE 回覆/推播可以摘要時，會拿這個事件裡「最後一筆」通用 log 的訊息名稱＋欄位當預覽（例如顯示名稱批次更新結束時的 `Display name update complete` 摘要），不用為每種排程作業寫專屬的預覽文案。

## 排程事件的批次結果圖

如果一個排程事件（`kind: schedule`）的最後一筆摘要 log 帶了兩個以上的數字欄位（排除掉 `total`），詳情頁會在時間軸上方畫一條依比例分色的長條圖＋圖例，例如 `Display name update complete` 的 `{updated, skipped, failed, total}`、`Weekly push complete` 的 `{succeeded, failed, total}`。顏色是依欄位名稱關鍵字猜的（`fail`/`error` → 紅，`success`/`succeed`/`updated`/`sent`/`complete` → 綠，其餘 → 灰），不是每個排程都手刻一份——**新增一個排程只要讓它結束時的摘要 log 帶兩個以上數字欄位，批次結果圖就會自動出現**，不用改 `/logs` 頁面。只有一個數字欄位時不會畫圖（長條圖跟单一個數字沒有意義的比例可比）。

## userId／群組 ID／顯示名稱遮蔽

頁面右上角有「遮蔽 ID」按鈕，預設遮蔽（例如 `U1234●●●●●●abc`），點一下切換成顯示完整 userId；每個事件詳情裡使用者欄位旁邊的「顯示/遮蔽」連結是同一個開關。這是純前端顯示層級的遮蔽，並非資料保護機制——頁面本身仍然需要 `LOGS_ACCESS_TOKEN` 才能存取，遮蔽只是避免在螢幕分享/截圖時不小心露出真實 userId。使用者顯示名稱（`targetDisplayName`/`displayName`）跟 userId 一樣，只有在對應的 log 有記錄到才會顯示；完全沒有 userId 的事件（例如排程、系統事件）整個「使用者」欄位/區塊會直接不顯示，不會看到一個空白的「（無 userId）」佔位。

群組 ID（`groupId`）比照 userId 用同一套遮蔽規則、同一個全域開關——這是同一類 PII（見 `docs/adr/0005-purpose-context-layered-on-reqid.md`），只有 `LOG_LEVEL=debug` 時才會出現在事件詳情頁的「群組 ID」欄位（來源是 `Processing event detail` 的 `source.groupId`），`LOG_LEVEL=info` 時這個欄位不會出現，不是顯示空白。

## 訊息內容跟身分識別資訊只在 debug 層

頁面標題列（「Dobby Logs」文字旁邊）有一個 LOG_LEVEL 徽章，顯示目前**實際生效**的等級——不是 `.env` 裡 `LOG_LEVEL` 設定值本身，本機開發環境不管設定值是什麼，實際生效的都會是 `debug`。等於 `debug` 時徽章用強調色，其他等級（`info`/`warn`/`error` 等）用警示色，提醒你這節講的這些內容現在看不看得到。

LINE 回覆/推播的訊息全文，以及 userId 這類身分識別資訊，比照 Notion API 的 body 一樣搬到 `debug` 層記錄。預設 `LOG_LEVEL=info` 下，時間軸只會看到 method/path 跟「開 `LOG_LEVEL=debug` 才能看到訊息內容」的提示，看不到訊息原文——**這是刻意的設計，不是 bug**。要看訊息實際內容（除錯用），把環境變數 `LOG_LEVEL` 設成 `debug` 再重啟服務即可。

`profile-service.ts` 的 `getProfile()` 現在也有一行摘要 log（`'LINE get profile'`，成功/失敗都有），沒有被時間軸特別合併/配對顯示，會以通用渲染器的樣子出現在時間軸上。

## R2 同步狀態徽章

Header 的 LOG_LEVEL 徽章旁邊還有一個「R2 備份」徽章，顯示 log 檔案同步到 Cloudflare R2 的狀態（背景說明見 `docs/overview.md`「日誌」小節、`docs/adr/0006-log-r2-sync-is-periodic-full-directory-not-rotation-hook.md`）。三種語意：

- 灰色「R2 備份：未啟用」或「R2 備份：尚未同步」——功能沒開，或開了但還沒跑過第一次。沒開時完全不排程同步，只在啟動時記一行 debug `R2 not configured, log sync disabled`（沒有 reqId，所以在事件列表是一筆「系統」事件，「來自」顯示 `log-upload.ts`，非錯誤）。
- 綠色「R2 備份 · `<時間>` 成功」——最近一次同步成功。同步只會上傳有變動的檔案，一整輪所有檔案都沒變動、實際沒傳任何檔案也算成功，所以閒置時時間仍會持續更新。
- 琥珀色「R2 備份 · `<時間>` 失敗，等待下次重試」——最近一次同步失敗，滑鼠 hover 可以看到簡短的失敗原因；不需要手動處理，下一次週期性同步（或下次 graceful shutdown）會自動重試。

**這是跨執行的全域狀態，不屬於任何一個 reqId／事件，不會出現在左側的事件列表或任何分頁裡**——跟這份文件其他小節描述的「事件時間軸」是完全不同的機制，判斷邏輯也不共用「完成／降級／警告／失敗」那套 `STATUS_COLORS`/`groupStatus` 規則（雖然顏色本身有沿用同一組色票）。

## 429 重試怎麼顯示

Notion API 回應 429（rate limit）時程式會自動重試，同一次呼叫因此會在底層產生好幾行 request log。這些重試會被辨識成同一次呼叫、合併成**一個**時間軸步驟，標題後面會加註「· 重試 N 次」；底層記錄重試本身的那行 warn log（`Notion API rate limited, retrying`）則是獨立的一個時間軸步驟（通用渲染器顯示），不會被吃掉。

## reqId 分組／排程事件的 reqId

事件分組底層是 `request-context.ts` 的 `runWithContext`：同一次事件處理過程中所有 log 都會自動帶上同一個 `reqId`（見 `docs/architecture.md` 的「Request Correlation ID」小節）。`weekly-push.ts`/`display-name-update.ts` 這兩個排程也各自用 `runWithContext` 包住整次執行，所以每次排程執行也會有自己專屬的 reqId、在 `/logs` 頁面上變成一個獨立的「排程」事件，不會跟其他次執行、或其他排程的 log 混在同一組。

完全沒有 reqId 的 log 分兩種處理：伺服器生命週期訊息（`Server started`/`Received shutdown signal, closing server`/`Server closed, exiting`/`Graceful shutdown timed out, forcing exit`）會被拼成下面說的「服務重啟」分隔線，其餘的（目前只有 webhook 簽章驗證失敗）每一筆各自獨立變成一個「系統」事件，不會因為都沒有 reqId 就被合併成同一筆。

## 服務重啟分隔線

事件列表裡偶爾會插入一條「⏻ 服務重新啟動」的分隔線，不是可以點開的事件——它是從 `Server started` 往回找最近一次的 `Received shutdown signal, closing server` 拼出來的（例如「SIGTERM · port 3000」），找不到對應的關閉訊號就只顯示 port。分隔線依時間插在正確位置，讓你一眼看出「這批事件是在服務重啟前還是重啟後發生的」，尤其是重啟前後的行為對不上時（例如重啟後某個環境變數沒設好）特別有用。

## 看原始 log／複製 JSON

每個事件詳情下方有兩個按鈕：「看這筆的原始 log」展開這個事件底下所有原始 log 行（未經合併/解析的完整 JSON），「複製 JSON」把同樣的內容複製到剪貼簿。這兩個都是這個事件自己的完整原始資料，不受遮蔽 ID 開關影響（跟頁面其他地方一樣，需要 `LOGS_ACCESS_TOKEN` 才能看到）。

「看這筆的原始 log」展開的內容也是可以逐層收合/展開的 JSON 樹，跟時間軸步驟裡的請求/回應內容同一套渲染方式；「複製 JSON」複製的是完整、未省略的原始文字，不受畫面上目前收合了哪些節點影響。
