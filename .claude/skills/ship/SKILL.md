---
name: ship
description: dobby 改動完成後的收尾流程：判斷要不要 review → 派一個合併 doc-sync 清單的 review agent → 驗證並照意見修 → 測試 → 分批 commit。使用者說「收尾」「ship」「review 完照意見修再 commit」時使用。
---

# 收尾：review → 修正 → commit

把 CLAUDE.md「開發流程」那幾條串成一次做完，不要每一步都停下來等使用者說「檢查文件更新」「commit」。

## 1. 確定範圍（主 session 自己做）

- `git status --short`、`git diff --stat`；已經 commit 的同一串改動用 `git log --oneline main..HEAD` 或使用者指定的範圍。
- 用一兩句寫下「這次行為上改了什麼」，後面 prompt 會用到。

## 2. 要不要 review、用哪個模型

| 改動 | 處理 |
|---|---|
| 純文件、typo、只補測試、開發工具（scripts／.claude） | 不派 review，跳到第 4 步，自己跑 `/doc-sync` 清單 |
| 碰到 `src/services/mutex.ts`、`entry-gate`、`src/commands/registration/**`、`with-fresh-calendar-event`、容量／名額計算 | 派 review，**預設模型** |
| 其他功能等級改動（新指令、repository 方法、Flex 卡等） | 派 review，`model: "sonnet"` |

## 3. 派一個 review agent（程式審查＋文件同步合併）

先在主 session 做 doc-sync 第 3 步的 grep（被改名、刪除、改語意的識別字），把命中的 `檔案:行號` 收好。然後派**一個**背景 agent，prompt 至少包含：

- 範圍：commit 範圍或 `git diff` 的檔案清單，以及第 1 步那句行為摘要。
- 相關 `TODO.md` 條目原文（註明不用整份讀 `TODO.md`）、已排除的方案與原因。
- 文件檢查：「讀 `.claude/skills/doc-sync/SKILL.md` 第 2、4、5 步，照對照表檢查文件」，附上 grep 命中清單，不要開放式搜尋。
- 跑測試用 `npm run test:brief`；慣例檢查用 `bash scripts/check-conventions.sh`。
- 只回報，不改檔案。每項附 `檔案:行號`、嚴重度（高／中／低），以及具體會壞掉的情境。

派出去後，在回覆結尾提醒使用者：**review 在背景執行中，有話直接打字會排隊，不要按 Esc**（按 Esc 會連背景 agent 一起中斷，只能重派）。

## 4. 驗證並修正

- review 的每一項都先對照程式確認屬實，再修。不屬實的列出來說明原因，不要照單全收。
- 照 `/doc-sync` 修文件，包括刪掉已完成的 TODO、校正位移的行號、該寫的 ADR。
- 修完跑 `npm run test:brief`。

## 5. Commit

- 依「每個獨立修復一個 commit」分批：程式＋測試、文件、TODO 收尾，依實際內容決定要不要合併。
- 使用者一開始就說了 commit（例如「修完 commit」）→ 直接 commit。否則列出分批計畫，問一次就好。
- commit message 用 conventional 格式、繁體中文，寫清楚「為什麼」，不加 Claude 簽名。
- commit 前的 hook 會自動跑慣例檢查、tsc 和測試。被擋下就修，不要繞過。

## 6. 回報

列出 review 結論（含不採納的項目和原因）、改了哪些檔案、commit hash。還沒推送或部署要明講。
