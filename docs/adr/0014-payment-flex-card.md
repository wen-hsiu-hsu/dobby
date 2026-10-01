# 付款資訊改用 Flex 卡，資料改讀 PAYMENT_V2 的表格

`@Dobby 付款` 原本讀「所有公告」的 `PAYMENT` 頁面，把內文轉成純文字回一則訊息。其他指令改成 Flex 卡時（[ADR 0010](0010-registration-status-flex-card.md)～[ADR 0013](0013-name-list-flex-card.md)），付款曾經評估過一次，當時決定不改。2026-10-01 使用者重新提出，這次改了。以下記錄取捨。

**之前不改的原因：Flex 卡不能長按複製。** 付款訊息最常見的用途是複製帳號去轉帳。純文字可以長按複製，Flex 卡片的文字不行，所以卡片要有 clipboard action 的「複製」按鈕才划算。按鈕需要一個確定的帳號字串。如果從內文用 regex 抓，管理員改個格式就會抓錯或抓不到，而且不會有任何地方報錯。如果把帳號拆成資料庫欄位，又要改「所有公告」的資料庫結構，當時使用者擔心影響其他公告頁。

**這次的做法：資料放在頁面內文的表格。** 使用者另外開了 `PAYMENT_V2` 頁面，內文是一個有開標題列的表格（名稱／帳號／備註）。表格是頁面內容，不是資料庫欄位，所以資料庫結構完全不用動，其他公告頁也不受影響；帳號又各自放在一個儲存格裡，程式拿得到確定的字串。`parsePaymentTable()`（`src/services/notion/payment-methods.ts`）依標題文字對應欄位，不看欄位順序，管理員調整欄位順序不會壞。這段解析是付款專用的，沒有放進共用的 `blocksToText()`。`blocksToText()` 本來就不輸出表格，`NEWS_TEMPLATE`、`INTRODUCE` 等頁面本身也不需要表格；news 只有 `{PAYMENT_V2}` 變數經 `paymentPageToText()` 讀付款表格（見下方）。

**版面：每種方式一格，「複製」按鈕放在有帳號那格的右邊。** mockup 比較了三種：每種方式一格、帳號放大獨立成一塊，以及按鈕統一放在卡片底部。使用者選了第一種。複製按鈕跟它複製的帳號放在同一格，有多個帳號時不會搞混是哪一個。按鈕用 box＋text 畫，原因跟 `messageButton()` 一樣，Flex 的 button component 不能設粗體。clipboard action 要 LINE 14.0.0 以上才能用，validate API 確認過 JSON 是合法的。clipboardText 上限 1000 字，帳號格超過時不放按鈕，免得整則被退回。新增的圖示有 `credit-card-dark.png`（徽章）和 `copy-dark.png`（按鈕）兩張。

**表格壞掉時改回純文字，不要什麼都沒回。** 沒有表格、沒開標題列、沒有「名稱」欄，或沒有任何一列填了名稱或帳號時，`parsePaymentTable()` 回傳 null，handler 改回純文字：先用 `tablesToText()` 把表格每一列串成一行，再接 `blocksToText()` 轉出的其他文字。`blocksToText()` 不輸出表格，只靠它的話，管理員只要關掉標題列或改了欄名，整頁只剩表格時就會回「付款資訊為空」，帳號明明還在頁面上卻一個字都沒回出去。這樣不論管理員把表格改壞，還是換回段落，付款資訊都回得出來。頁面上表格以外的文字（例如補充說明）會用灰色小字放在卡片列表下方，免得管理員寫的內容被吃掉。卡片超過 30KB 時也改送純文字，用 `name-list-card.ts` 的 `fitsBubbleSizeLimit()` 判斷。付款方式和表格外的補充說明都不長時，實際上不會碰到這個上限。

**Flex 的 text 不能是空字串。** 空的帳號、備註格不畫出來。名稱格空白但有帳號的那一列，名稱顯示「（未命名）」。名稱和帳號都空白的列整列略過。

**altText 是一種方式一行的純文字。** 格式是「名稱 帳號 (備註)」，例如「永豐銀行 （807） 20201800934932 (請備註名字)」，後面接表格以外的文字，超過 400 字用 `truncateAltText()` 截斷。這跟舊的 `PAYMENT` 段落寫法接近，通知和 `/logs` 看到的內容跟以前差不多。

**季公告草稿的 `{PAYMENT_INFO}` 已經拿掉（2026-10-01）。** 這個 ADR 寫下時，`season-announcement.ts` 的 `{PAYMENT_INFO}` 還讀舊的 `PAYMENT` 頁面，付款資訊因此有兩份。季公告改成 Flex 卡後（[ADR 0016](0016-season-announcement-flex-card.md)），付款資訊改由 `{NEW_SEASON_NEWS}` 裡 `NEWS_TEMPLATE` 的 `{PAYMENT_V2}` 提供，程式不再讀 `PAYMENT`。

**`@Dobby 公告` 也改讀 `PAYMENT_V2`。** 同一天使用者把 `NEWS_TEMPLATE` 裡手打的付款條列（還寫著已經過時的「Line 轉帳」）換成 `{PAYMENT_V2}` 變數，`news.ts` 用 `paymentPageToText()` 代入，跟付款卡 altText 同一段文字（但不截斷）。讀不到時代入一句提示而不是空字串：公告卡（[ADR 0015](0015-news-flex-card.md)）會略過空的段落內文，空字串會讓「付款方式」段只剩小標或整段消失，讀的人看不出付款資訊沒讀到。讀 `PAYMENT_V2` 的 Notion 呼叫失敗（例如 429 重試用完）時，只把付款那段換成「（付款資訊讀取失敗，請用 @Dobby 付款查詢）」，公告其他部分照常回，因為付款是公告的次要段落。頁面名稱用 `payment-methods.ts` 的 `PAYMENT_PAGE_NAME` 常數，付款卡和 news 共用。news 的變數 regex 原本是 `[A-Z_]+`，比對不到帶數字的 `PAYMENT_V2`，這次改成 `[A-Z0-9_]+`。

**觸發文字不變。** 欠費名單卡的「付款資訊」按鈕、指令清單卡，以及公告卡底部的「付款資訊」按鈕（`news-card.ts`，[ADR 0015](0015-news-flex-card.md)）都會送出 `@Dobby 付款`，所以只換回覆內容，不改指令。改觸發文字時這三處會一起失效。
