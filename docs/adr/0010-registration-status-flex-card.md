# 報名／請假狀態回覆改用 LINE Flex 卡片

報名、請假的每個結束分支原本回一段純文字（完整零打名單、剩餘名額、請假名單接在一起）。這個分支把它換成 LINE Flex 卡片（`src/commands/registration/flex-status-card.ts` 組 JSON，`event-status-message.ts` 的 `buildEventStatusReply()` 補上請假人姓名、組出完整訊息），資訊量不變，但用版面（徽章、進度條、底部按鈕）取代一大段文字。以下記錄幾個容易被誤會、或之後改動容易踩雷的取捨。

**altText 是精簡文字版，同時身兼三種用途，不能只當成「卡片的替代文字」隨便寫。** `buildStatusCardAltText()` 產生的字串（`headline`、日期、零打名額與費用、已報名者編號名單、剩餘名額、請假名單、總人數，見 `docs/registration.md`「狀態卡（Flex）」）是：(1) LINE 推播通知彈出時顯示的內容——使用者不點開對話框也看得到；(2) `/logs` 看得到的內容——`reply-service.ts` 把 flex 訊息記成 `[flex] ${altText}`，不是整包卡片 JSON；(3) 測試斷言的來源——`src/test-utils/reply-text.ts` 的 `replyText()` 對 flex 訊息回傳 `.altText`，既有測試多半靠這段字串斷言內容。改 `buildStatusCardAltText()` 的文案時，這三個用途都要一併考慮，不是只考慮「卡片看起來對不對」。

**底部三顆按鈕（`+1 零打`／`−1 零打`／`請假`）用 `message` action，不是 `postback`。** `message` action 按下去等同使用者自己在對話框打了那段文字（`@Dobby +1`／`@Dobby -1`／`@Dobby 假`），好處是指令解析完全不用改——照樣走 `command-parser.ts` → `command-router.ts` 的既有路徑，也不用另外設計 postback data 格式；群組裡其他成員也看得到是誰送出了這則文字訊息，跟手動打字的可見度一致。代價是**卡片本身不記得自己是哪一場活動的卡片**：按鈕送出的文字永遠是「+1」「-1」「假」，不帶日期或任何卡片專屬的識別資訊，所以行為跟使用者自己重新打一次指令完全相同——一定是作用在「按下當下的下一個週六」，不是「卡片建立當下的那個週六」。如果使用者留著一張很舊的卡片才點按鈕，操作的是目前的活動，不是卡片上顯示的那個活動。這跟手動輸入指令的既有行為一致，只是卡片這個媒介比較容易讓人誤以為「按鈕跟這張卡片綁定」。

**Flex 訊息帶不了 `quoteToken`，接受這個限制。** `reply-service.ts` 的 `withQuoteToken()` 只對 `text`／`textV2` 訊息附加 quoteToken（LINE 的「引用回覆」效果，讓使用者看到自己的哪則訊息被回應），flex 訊息型別的 schema 沒有這個欄位，也沒有替代做法。改成卡片後，報名／請假的回覆不會再顯示引用回覆的框線，只是純文字時代才有的、不影響回覆內容本身。

**Flex 的 `button` 元件不能設定文字粗體，三顆按鈕都自己用 `box` + `text` 畫（`messageButton()`，現在在 `src/commands/flex-card-parts.ts`，指令清單卡也用它）。** LINE 的 Flex button component 的文字樣式選項有限，設計稿要求的粗體做不到；改用 `box` 包一個 `text`（`weight: 'bold'`），`action` 掛在外層 `box` 上，視覺效果一樣可以點擊，只是元件類型不是 `button`。之後如果要再加按鈕，記得同樣的限制。

**圖片放 `assets/flex/`，由 `.github/workflows/pages.yml` 發布到 GitHub Pages（`https://wen-hsiu-hsu.github.io/dobby/flex/<檔名>`），圖示用 `scripts/generate-flex-icons.mjs` 產生。** LINE 的 Flex `image`／`hero` 元件的 `url` 必須是外部可存取的 HTTPS 網址，這個服務本身沒有對外提供靜態檔案的路由，所以另外用 GitHub Pages 當圖床。這帶來一個容易忽略的限制：**已經發出去的卡片（使用者手機上收到的那份 LINE 訊息）會一直讀同一個網址**，LINE 用戶端不會重新抓一份新的卡片 JSON——改圖示或照片時**必須換檔名**，不能直接覆蓋舊檔的內容；覆蓋的話新舊卡片會同時變成新圖，可能不是想要的效果，也沒辦法針對「只有新卡片用新圖」做區分。**刪掉舊檔案會讓所有還留著那張舊卡片的使用者看到破圖**（LINE 顯示圖片載入失敗的預留位置），所以舊檔名原則上不刪，即使已經沒有任何目前的卡片邏輯在用。另外，Flex 的圖片只能置中裁切（`aspectMode: 'cover'`／`fit`，沒有其他裁切模式可選），所以像 `header-shuttle.jpg` 這種照片素材要先裁好目標比例（見卡片裡設定的 `aspectRatio`），不能指望 Flex 幫忙裁出想要的構圖。
