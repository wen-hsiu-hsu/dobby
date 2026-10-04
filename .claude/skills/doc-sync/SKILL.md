---
name: doc-sync
description: 功能或修正完成後，檢查並同步 dobby 的文件（docs/ 對應文件、README 目錄表、ADR、TODO.md、指令清單卡、相關記憶）。使用者說「檢查文件更新」「同步文件」，或功能確認完成、準備 commit 時使用。
---

# 文件同步檢查

目標：這次改動之後，文件裡沒有描述舊行為的句子，也沒有該寫卻沒寫的機制。主 session 自己用 grep 做，只讀命中行附近（`sed -n`），不要整份讀 docs。如果要合併進 code review agent，把這份清單貼進 agent 的 prompt，再附上第 3 步 grep 的結果。

## 1. 確定範圍

- `git status --short`、`git diff --stat`
- 已經 commit、但屬於同一串改動的部分：`git log --oneline main..HEAD`，或使用者指定的 commit
- 列出這次改了哪些程式檔、行為上改了什麼（一兩句）

## 2. 從改動的程式檔找出要對照的文件

| 改到 | 要對照的文件 |
|------|------|
| `src/commands/**` 的指令行為、回覆文字 | `docs/commands.md` |
| 新增指令 | `docs/development.md`「新增指令」6 步驟、`command-list-card.ts` 是否列入（是否限管理員）、`docs/commands.md` |
| 報名、請假、容量計算、`withFreshCalendarEvent`、mutex | `docs/registration.md`、`docs/adr/0001-*`、`docs/adr/0002-*` |
| `src/services/notion/**`、Notion 欄位 | `docs/notion/databases.md`、`docs/notion/schemas/*.json`；新的 repository 入口函式有沒有包 `withPurpose` |
| `src/handlers/**`、事件流程 | `docs/architecture.md` |
| `src/schedulers/**` | `docs/schedulers.md` |
| logger、log 訊息字串、`src/routes/logs.ts` | `docs/logging.md`（`/logs` 會依 log 訊息字串判定狀態，改字串要確認分類沒壞） |
| Flex 卡片 | 對應的 Flex ADR、`docs/development.md` 的 Flex 渲染陷阱段落 |
| `src/config/env.ts` | `docs/development.md`「環境變數」、`.env.example` |
| `src/test-utils/**` | `src/test-utils/README.md` |
| Docker、部署 | `docs/overview.md` |

## 3. grep 描述舊行為的地方

從 diff 取出被改名、刪除或改語意的識別字：函式名、log 訊息字串、Notion 欄位名、指令文字、回覆文案。

```bash
grep -rn "舊名稱\|舊字串" docs src TODO.md CLAUDE.md --include='*.md' --include='*.ts' --include='*.json'
```

排除歷史快照，這些不用改：`docs/code-review-*.md`、`docs/_analysis-report.html`。

## 4. TODO 與待辦文件

- 這次做完的條目：從 `TODO.md` 直接刪除，不打勾。
- 其他條目引用的檔案:行號，如果被這次改動位移了要校正。用改動的檔名 grep `TODO.md`、`docs/performance-observations.md`，打開檔案實際確認行號。
- 刪掉條目後，其他條目如果用「第 N 項」「下方某項」指到它，要改掉。
- 新發現、這次不處理的問題：照 `CLAUDE.md`「新增問題／技術債觀察類 TODO」的規則寫。效能類放 `docs/performance-observations.md`；評估後否決的方案放 `docs/rejected-proposals.md`（附重新評估的條件）。
- 「手動測試追蹤」：需要真機或真實 LINE 驗證的改動，要補測試項。

## 5. ADR

- 這次有沒有非顯而易見的決策，也就是之後很容易被「簡化」回錯誤寫法、或來自真實事故的決策？有的話新增 `docs/adr/00NN-*.md`（編號接 `ls docs/adr` 的最後一號），格式照既有 ADR：是什麼、為什麼、不這樣做會怎樣。並在相關的 `docs/*.md` 加一句指向它。
- 既有 ADR 的描述如果被這次改動推翻或補充，要更新那份 ADR。

## 6. 索引與記憶

- `docs/README.md` 目錄表：有新增文件就加一列；既有文件涵蓋範圍變了，就更新「說明」「什麼情境該讀」欄。
- `~/.claude/projects/-Users-shiu-Documents-repos-dobby/memory/` 裡跟這個功能相關的 project 記憶如果過時了（例如寫著「尚未實作」「等部署後刪」），要更新或刪除，`MEMORY.md` 的索引行也一起改。

## 7. 回報

- 列出改了哪些文件、各改了什麼（檔案:行號）。
- 沒有需要改的項目，就簡短說查過什麼。
- 不要自動 commit，等使用者指示。
