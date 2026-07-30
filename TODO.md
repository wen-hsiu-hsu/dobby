# TODO

> 時區：Asia/Taipei ｜ 季度定義：Q1=1~3月, Q2=4~6月, Q3=7~9月, Q4=10~12月
>
> 前身為 `openspec/changes/bot-logic-fixes`，已改用純 Markdown TODO 追蹤，不再使用 OpenSpec 流程。

## Issue: `payment` 指令規格待確認

**嚴重度：中（需釐清規格）**

`src/commands/payment.ts` 目前從 Announcement DB 取 Name='PAYMENT' 的靜態文字（付款說明），而非未付款人員名單。

需確認：
- `payment/付款` 指令的設計意圖是「付款方式說明」還是「未付款名單」？
- 若是未付款名單，邏輯應與 `owe`（已改用 `結清` formula boolean 判斷）相同
- 若是付款說明，現有邏輯正確，不需修改

相關檔案：`src/commands/payment.ts`、`src/commands/owe.ts`

## Issue: `command/指令` handler 完整性待確認

**嚴重度：待確認**

尚未確認：
1. handler 是否存在且正確回應
2. 列出的指令是否完整（包含所有非管理員指令）
3. 是否有遺漏的指令

相關檔案：`src/commands/command-list.ts`（推測路徑）、`src/commands/command-router.ts`

---

## 已解決（供參考，非待辦）

- 季度判斷（`participants` 未依當前時間取正確季度）— 已修正欄位對應與 `getCurrentSeasonName()`
- `owe` 未付款判斷 — 已改用 `結清` formula boolean
- `+/-N` 名額計算公式 — 已對齊規格公式（`capacity-calculator.ts`）
- 測試輔助工具（`createTestBot`、fixture 錄製）— 已完成，見 `src/test-utils/README.md`
