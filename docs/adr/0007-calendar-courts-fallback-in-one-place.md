# 本週場地數的 fallback 只寫在 `resolveCourts()` 一處，不要在別處直接讀 `season.courts`

場地數有兩個來源：「行事曆」當週頁面的 `場地數`（`CalendarEvent.courts`，未填為 `null`），以及「季租承租紀錄」的當季預設 `場地數`（`SeasonRecord.courts`）。規則是**行事曆有填就用行事曆，沒填才用季預設**，這條 fallback 只實作在 `src/commands/registration/capacity-calculator.ts` 的 `resolveCourts()`，而 `calculateTotalSlots()` 在內部呼叫它。

**為什麼放在 `calculateTotalSlots` 裡，而不是放在 `getEventOccupancy` 算好再傳下去**：會用到場地數算名額的地方不只一個——`getEventOccupancy`（回覆顯示的名額）、`calculateAddCapacity`（`+N` 真正擋名額的判斷）、`leave-handler.ts` 請假／銷假寫入後自己重算的 `newTotalSlots`。這三個地方都直接拿 `season` 去算，如果 fallback 只寫在 `getEventOccupancy`，另外兩條路徑會繼續用季預設，結果是「回覆說剩 6 個名額、實際卻讓你報到 13 個」或「報名用行事曆場地數、銷假回覆卻用季預設」這種不一致。最初規劃這個功能時（2026-09-25）就差點漏掉 `calculateAddCapacity` 這條路徑。把 fallback 放進三者共用的 `calculateTotalSlots`，並讓它的 event 參數**必填** `courts`，漏傳時會直接編譯失敗，不會靜默退回季預設。

**不要做的「簡化」**：不要在 `getEventOccupancy` 裡用 `{ ...season, courts: effectiveCourts }` 偷換 season 物件再往下傳——`occupancy.season.courts` 必須維持季預設的原值，週報要拿它比對才能在不同時顯示「（本週調整）」。需要「本週實際採用的場地數」時用 `occupancy.courts`，或對 event/season 呼叫 `resolveCourts()`。

**刻意的例外**：`news` 指令的 `{COURT_COUNT}`（`src/commands/news.ts`）是整季公告，顯示的是季預設，不套用單週調整。

**不合法的值**：`場地數` 只接受正整數；0、負數、小數在 `calendar-repository.ts` 的 `readCourts()` 會被當成未填（`null`）並記 `logger.warn`，改用季預設。「本週不打」應該用 `類型` =「打球暫停」表示，不是把場地數填 0（填 0 會讓名額算成負數）。目前沒有上限檢查，手誤填成很大的數字會直接放大名額，只能靠週報的「（本週調整）」提示人工發現。

**真實資料的前提（2026-09-25 查證）**：2026-Q2、Q3 的行事曆頁面是批次建立的，`場地數` 全部填 2，跟季預設相同，所以這個功能上線時沒有任何行為變化。風險在換季：如果新一季的季預設改了，但行事曆頁面是複製舊頁、帶著舊值，bot 會靜默沿用舊值。週報與 `@Dobby next` 在兩者不同時標示「場地：N 面（本週調整）」，就是為了讓這種情況在週日推播時被看到。
