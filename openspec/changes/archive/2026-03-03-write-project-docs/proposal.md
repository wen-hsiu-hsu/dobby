## Why

Dobby 目前缺乏完整的中文專案文件。現有的 `docs/` 資料夾主要是 LINE/Notion API 的原始參考文件，以及已完成的 n8n 移植計畫（`PLAN.md`），不適合作為維護文件或使用手冊。需要一份從實際程式碼提煉出來、對開發者和管理員都有用的文件。

## What Changes

- 建立新的 `docs/` 結構，涵蓋專案概覽、系統架構、指令說明、開發設定
- 將 `PLAN.md` 中值得保留的架構決策提煉至新文件後刪除
- 將 `docs/project/context.md` 的商業邏輯整合至新文件後刪除
- 刪除 `docs/line/`、`docs/n8n/`、`docs/notion/*-blocks.md`（官方 API 參考，非自訂內容）
- 整理 `docs/notion/schemas/*.json`，補充說明並確保欄位描述正確
- 更新根目錄 `README.md`

## Capabilities

### New Capabilities

- `project-docs`: 完整的中文專案文件，涵蓋：
  - `docs/README.md`：文件導覽入口
  - `docs/overview.md`：專案概覽、技術棧、部署方式
  - `docs/architecture.md`：系統架構、資料流、設計決策
  - `docs/commands.md`：所有 LINE 指令說明（含管理員指令）
  - `docs/registration.md`：報名系統詳細說明（Mutex、容量計算、guest 命名邏輯）
  - `docs/schedulers.md`：排程任務說明
  - `docs/notion/databases.md`：Notion 資料庫用途與商業邏輯
  - 根目錄 `README.md`：快速入門

### Modified Capabilities

（無現有 specs 需要更新）

## Impact

- 刪除舊文件：`PLAN.md`、`docs/project/`、`docs/line/`、`docs/n8n/`、`docs/notion/*-blocks.md`、`docs/notion/database-schema.md`、`docs/notion/AI-SCHEMA-UPDATE-GUIDE.md`
- 保留：`docs/notion/schemas/*.json`（整理後）
- 新增：`docs/README.md`、`docs/overview.md`、`docs/architecture.md`、`docs/commands.md`、`docs/registration.md`、`docs/schedulers.md`、`docs/notion/databases.md`
- 更新：根目錄 `README.md`
