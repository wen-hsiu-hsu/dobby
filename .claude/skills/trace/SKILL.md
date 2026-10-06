---
name: trace
description: 查 dobby 的 /logs 事件時間軸。使用者給 reqId、貼 /logs URL（含 format=text&reqId=）、或貼一段 /logs 事件清單要你查時使用。用 npm run trace，不要 curl 帶 token 的 URL。
---

# 查 /logs 事件

`npm run trace` 從 `.env` 讀 `LOGS_ACCESS_TOKEN`，用 Authorization header 送，token 不會出現在指令或對話裡。

## 指令

```bash
npm run trace -- <reqId> [days]          # 單筆事件的精簡時間軸，預設 1 天，找不到就加 7
npm run trace -- --after <reqId> [N]     # 這筆之後（較新）的 N 筆事件，依時間先後，預設 20
npm run trace -- --list [days]           # 最近的事件清單（最新在上，最多 50 筆）
```

- 使用者貼 URL 時，只取 `reqId`、`days`，其他參數不用。回覆裡不要重貼那個 URL。
- 要看好幾筆時，把多個 `npm run trace -- <id>` 串在同一個 Bash 呼叫裡，不要一筆一個回合。
- 使用者說「從這筆往後查」：先 `--after`，再只展開狀態是失敗／逾時、或使用者點名的那幾筆。
- 查別台（例如 Pi）：`LOGS_URL=https://... npm run trace -- <reqId>`，`.env` 的 token 要跟那台一致。

## dev server 沒開時

dev 環境用 docker 掛載整個 repo，log 檔就在 `logs/app.*.log`（JSON lines）：

```bash
grep -h '"reqId":"<id>"' logs/app.*.log | cut -c1-400
```

## 分析時

- 下結論前先用關鍵字 grep `docs/performance-observations.md`、`TODO.md`，看是不是已知現象。
- 時間軸裡的 Notion 呼叫目的來自 `withPurpose`，可以拿來對照是哪個 repository 函式。
- 使用者這次如果貼的是帶 token 的 URL，最後提醒一句：下次只給 reqId 就好。
