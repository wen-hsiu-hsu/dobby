# 週報推播與 `@Dobby next` 改用 Flex 卡片，且必須輸出同一張

> 後續變更：見 [ADR 0019](0019-members-verify-timeout-via-next.md)（`next` 開放給所有成員，不再有非管理員拒絕分支；有任務沒跑完時卡片後另附一則提醒，卡片本身不變）

報名、請假的狀態回覆改成 Flex 卡片後（[ADR 0010](0010-registration-status-flex-card.md)），週報推播（`src/schedulers/weekly-push.ts`）跟 `@Dobby next`（`src/commands/next-event.ts`）還留著舊的純文字格式，兩邊共用 `src/commands/weekly-status-message.ts` 的 `buildWeeklyStatusMessage()`。這個分支把它們也換成卡片，沿用 `registration/flex-status-card.ts` 的 `buildStatusCardBubble()`／`buildStatusCardAltText()`，`buildWeeklyStatusMessage()` 換成回傳 `FlexMessage` 的 `buildWeeklyStatusReply()`。以下記錄幾個取捨。

**`next` 跟週報推播必須輸出完全相同的卡片，這不是選配的一致性，是功能本身的一部分。** `next` 有兩個角色：管理員平常查看目前狀態，以及週報推播失敗時（`DOBBY_GROUP_IDS` 沒設、找不到當週行事曆頁面、Notion 查詢出錯……）管理員手動在群組補發同一份內容。如果兩邊格式不同，補發出來的東西就不是「原本應該推播的內容」，這個補救手段就失效了。因此卡片的每個欄位（徽章、標題、副標題、零打名單、請假、本週出席、底部按鈕）兩邊都是同一次 `buildWeeklyStatusReply()` 呼叫產生，不是各自組一份「看起來很像」的訊息。唯一的差異只在 `next` 對非管理員的拒絕分支（純文字「此指令僅限管理員使用」）——那個時候還沒有活動資料可以組卡片，跟報名／請假流程裡「查無對象」之類的前置檢查維持純文字是同一個道理。

**卡片產生器沒有搬家，`weekly-status-message.ts` 直接 import `registration/flex-status-card.ts`。** 週報／`next` 的角色（把 Notion 查來的 `EventOccupancy` 換算成卡片參數）跟報名／請假的 `event-status-message.ts` 是同一種分工，兩者剛好都放在能直接 import 卡片產生器的地方，沒有必要為了「共用」這件事本身去重新規劃目錄結構——`StatusCardParams` 已經是給多個呼叫端共用的介面，加一個新呼叫端不代表卡片組裝邏輯要換位置。

**卡片產生器加了 `paused` 旗標處理暫停週，不是另外畫一份 hero／footer JSON。** 暫停週只是「拿掉幾塊、換一句說明文字」的變化：拿掉標題列右側「剩 N 位／已額滿」、副標題、進度條，body 拿掉零打名單／請假／本週出席三段改放一行灰字，footer 三顆按鈕整個消失（暫停週沒有「+1 零打」這種可操作的動作，按了也只是把一個沒在打球的日期當成操作對象）。標題區（照片、日期與費用行、徽章、標題文字本身）維持不變。`paused` 預設 `undefined`（視同 `false`），報名／請假的既有呼叫端完全不用改，卡片輸出跟這個旗標加入前逐位元組相同——這點有測試斷言保護（`flex-status-card.test.ts`）。

**本週出席的語意換了：從「只算季租」改成「季租出席＋零打數」，這是刻意的。** 舊文字版印的是「應到：N 人」，N 只算季租成員（`presentSeasonMembers`，也就是 season 成員數扣掉本週請假）；報名／請假卡片的「本週出席」則是 `presentSeasonMembers + 零打數`。週報／`next` 改用同一張卡片後，「本週出席」自然也採用卡片既有的公式，不是特地為週報另外定義一個。這代表**同一週**「應到」跟「本週出席」的數字會不一樣（多了零打的人數）——這是預期的行為改變，不是回歸；舊語意只在這份 ADR 跟 `docs/schedulers.md` 的說明文字裡留一句話交代，不再是系統的行為。

**altText 沒有「場地」專屬欄位，場地資訊塞進 `headline` 裡多帶一行。** `buildStatusCardAltText()` 的固定格式是 `[headline, '', date, 零打名額, guestLines, 剩餘名額, 請假, 總人數]`，這是報名／請假共用的格式，不因為週報多一個「場地」概念就去改動它（改了會牽動所有既有卡片的 altText 順序）。週報／`next` 的 `headline` 因此是兩行字串（`本週打球・不能到請喊聲\n場地：N 面（本週調整）`），`buildStatusCardAltText()` 把它當一段文字接進 `lines` 陣列，不需要特別處理內嵌換行。「場地：N 面」每週都印，跟舊文字版一樣；只有跟季預設不同時才加註「（本週調整）」。暫停週的 `headline` 只有「本週活動暫停」一行，altText 用另一條分支（只留 headline／日期／`pausedNote`），不會出現零打名額或請假這種暫停週沒有意義的欄位。
