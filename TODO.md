# TODO

> 時區：Asia/Taipei ｜ 季度定義：Q1=1~3月, Q2=4~6月, Q3=7~9月, Q4=10~12月
>
> 前身為 `openspec/changes/bot-logic-fixes`，已改用純 Markdown TODO 追蹤，不再使用 OpenSpec 流程。

---

## 已解決（供參考，非待辦）

- 季度判斷（`participants` 未依當前時間取正確季度）— 已修正欄位對應與 `getCurrentSeasonName()`
- `owe` 未付款判斷 — 已改用 `結清` formula boolean
- `+/-N` 名額計算公式 — 已對齊規格公式（`capacity-calculator.ts`）
- 測試輔助工具（`createTestBot`、fixture 錄製）— 已完成，見 `src/test-utils/README.md`
- `payment` 指令規格 — 確認為「付款方式說明」（取 Announcement DB 的 PAYMENT 靜態文字），與 `owe`（未繳費名單）為不同指令，現有邏輯正確
- `command/指令` handler 完整性 — `command-list.ts` 存在且列出所有非管理員指令，正確排除管理員限定的 `next`
- `next` 指令 `c=N`（court override）參數未生效 — 已補上 what-if 顯示邏輯：`command-parser.ts` 統一解析 `-=N`/`c=N` 為結構化 `NextEventQueryParams`，`next-event.ts` 用 `calculateTotalSlots()` 算出「若場地數為 N」的剩餘名額並顯示，不寫回 Notion、不影響出席人數計算

---

## 已評估、不採納

- **表格驅動指令解析與路由**（`/improve-codebase-architecture` 報告候選 3，Speculative）— 評估後不採納。理由：(1) 各 command handler 簽名不一致（7 種不同形狀，從 `(replyToken, botId)` 到 `(event, delta, botId, isAdmin)`），單一表格 row 形狀塞不下這些差異；(2) 報告自己也承認 deletion test 不明確，拆掉 `command-parser.ts`/`command-router.ts` 可能只是把 switch 搬位置，不會真正集中複雜度；(3) 唯一有具體壞味道支撐的症狀（courtOverride 解析邏輯被拆到兩個 module）已用小範圍修法解決，見上方「已解決」。若未來新增指令的頻率明顯提高、且 handler 簽名先被拉齊，可重新評估。
