# 指令清單改用 Flex 卡片，跟狀態卡共用同一套元件

`@Dobby command`／`@Dobby 指令` 原本回一大段純文字，下面掛四個 quick reply。報名／請假、週報都改成 Flex 卡片後（[ADR 0010](0010-registration-status-flex-card.md)、[ADR 0011](0011-weekly-status-flex-card.md)），指令清單也改成同風格的卡片：`src/commands/command-list-card.ts` 組 JSON，`command-list.ts` 只負責算出下一季、送出訊息。以下記錄幾個取捨。

**色票、徽章、按鈕、照片標題區抽成 `src/commands/flex-card-parts.ts` 共用。** 指令清單卡的照片、漸層、徽章、按鈕要跟狀態卡長得一模一樣，所以把這些從 `registration/flex-status-card.ts` 搬出來，兩張卡都從這裡 import。搬移前後狀態卡輸出的 JSON 逐位元組相同。`flex-status-card.ts` 仍然轉出 `BADGE_COLORS`／`BadgeColorName`，既有 import 不用改。

**標題區照片高度固定 300:170，不為指令清單另外裁一張比較扁的圖。** 設計時試過把照片壓扁讓整張卡短一點，但 LINE 的 `aspectMode: 'cover'` 只會從中間裁切，換比例等於要另外做一張裁好的圖、多管理一個檔案。使用者選擇所有卡片共用同一張 `header-shuttle.jpg`、同一個比例，所以 `photoHero()` 不開放改比例。指令清單卡只拿掉左上角那行小字（狀態卡放日期與費用），徽章、標題、副標題改成貼底對齊。

**只有不需要參數的指令做成可點的列，`+N` 和代他人操作只放文字提示。** 按鈕用的是 message action，按下去送出一段固定文字，沒辦法讓使用者先填數字或選人。所以報名區只放 `+1`／`−1`，旁邊註明「一次報名多位請自己輸入 `@Dobby +2`」；代他人操作（`@Dobby +N @名字`、`@Dobby @名字 假`）用沒有箭頭、只有外框的列表示「這個不能點」。Flex 不支援虛線框，外框是實線。

**新增「下一季公告草稿」按鈕，季度依今天日期算。** 原本純文字清單只寫範例 `@Dobby season 2026Q2`，管理員要自己改季度。卡片上的按鈕直接送出 `@Dobby season YYYYQn`，季度是「今天所在季度的下一季」（`getNextSeasonName(getCurrentSeasonName())`），因為管理員通常在季末準備下一季公告。換季之後才補做當季草稿的話（例如 10/1 才要做 Q4 公告），按鈕會送出再下一季（`2027Q1`），Notion 還沒有那一季的季租資料時會回「找不到 2027-Q1 季租資料」，這種情況要自己輸入季度。寫成 `2026Q4` 不帶連字號，跟 `docs/commands.md` 的範例一致，`parseSeasonInput()` 兩種寫法都接受。

**altText 列出卡片上每個指令的寫法，不只寫「指令清單」。** altText 是 LINE 通知、`/logs`、不支援 Flex 的舊版 LINE 唯一看得到的內容。指令清單卡沒有動態資料，但使用者看到 altText 時沒有卡片可以點，所以 altText 列出卡片上每個指令的寫法，管理員章節一樣只在 `isAdmin` 時加上。卡片和 altText 都只列中文關鍵字，改版前純文字清單列的英文別名（`owe`、`news`、`announcement`、`payment`、`people`、`command`）不再列出，但指令本身照樣能用（`docs/commands.md` 有完整別名）。

**拿掉原本的 quick reply。** 原本的四個 quick reply（報名人、公告、付款、未繳費）在卡片上都有對應的列，留著只是重複。Flex 訊息也可以掛 quick reply，之後要加回來不用改卡片。

**按鈕文字都要能被 `parseCommand()` 解析成真的指令。** 測試（`src/commands/__tests__/command-list.test.ts`）把卡片上每個按鈕送出的文字都丟給 `parseCommand()`，確認每顆按鈕都解析成那一列該有的指令類型（季度參數也要能通過 `parseSeasonInput()`），沒有按了沒反應或觸發錯指令的按鈕。之後改指令關鍵字時，這個測試會提醒要同步改卡片。
