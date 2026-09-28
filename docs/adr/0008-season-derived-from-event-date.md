# 跟某場活動有關的季度，用活動日判斷，不用今天

報名、請假、名額計算（`getEventOccupancy`，週報與 `@Dobby next` 也共用）操作的是「下週六」那一場活動，季度一律用 `getSeasonNameForDate(活動日)`（`src/utils/date-utils.ts`）決定，**不用** `getCurrentSeasonName()`。

**為什麼**：每季最後一週，「今天」和「下週六」可能分屬不同季度。例如 2026-09-27（週日）報名，下週六是 2026-10-03（Q4），但今天屬於 Q3。用今天判斷會拿 Q3 的季租名單去處理 Q4 的活動，造成：

- Q3 是季租成員、Q4 不是的人 `+1`，被當成季租成員寫成「X的朋友」，而不是零打本人「X」——2026-09-27 正式環境實際發生過（官穗妙，reqId `ce1a79`）
- 名額用 Q3 的季租人數算（當時 Q3 11 人、Q4 10 人，少算 1 個名額）
- 回覆與週報顯示的零打費用用 Q3 的 `零打費用`（當時 Q3 $170、Q4 $190，顯示錯成 $170）
- 請假：只在 Q3 的人可以請 Q4 活動的假，Q4 新加入的季租成員反而被擋

受影響期間是當季最後一個週六的隔天到季末那天（2026 Q3 是 9/27～9/30）；季末剛好是週六的季度沒有這段期間。只有這幾天會出事，而原本的測試斷言本身也是用「今天的季度」去比對，所以測不出來。

**不要做的「簡化」**：不要改回 `getCurrentSeasonName()`，也不要讓 `getEventOccupancy` 在沒有傳 `knownSeason` 的時候改用今天判斷。`getSeasonNameForDate` 直接解析 `YYYY-MM-DD` 字串，不經過 `Date`，避免時區換算讓日期偏一天。

**刻意維持用今天判斷的地方**：`participants`（本季報名人）和 `news`（本季公告）講的是「這一季」，不是某一場活動，所以繼續用 `getCurrentSeasonName()`。（`season` 指令的季度由使用者輸入指定，不在此討論範圍。）

**可接受的代價**：季末最後一週如果管理員還沒建立下一季的「季租承租紀錄」，報名／請假會回「找不到 YYYY-QN 季租資料」，週報推播也會中止（記 `logger.error`）。這是刻意的 fail-fast，不 fallback 回上一季，因為 fallback 正是這次 bug 的成因。

已知的誤導訊息：同樣情況下 `@Dobby next` 會回「找不到 YYYY-MM-DD 的活動」，看起來像是行事曆沒建。原因是 `getEventOccupancy` 把「活動不存在」和「季資料不存在」都回成 `null`，呼叫端分不出來。這是既有行為，這次沒改。2026-09-28 起 `getEventOccupancy` 回 `null` 前會記一行 info `Event occupancy unavailable: no event or season for date`（`{date, hasEvent, hasSeason}`），管理員可以在 `/logs` 查到真正原因；使用者收到的回覆仍然一樣誤導。
