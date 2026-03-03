## Context

Dobby 的現有文件分散且過時：`PLAN.md` 是移植計畫（已完成任務），`docs/project/context.md` 記錄了 n8n 時代的商業邏輯（部分仍有效），`docs/line/` 和 `docs/notion/` 是原始 API 參考文件。實際維護者需要的資訊（如何啟動、指令如何運作、報名邏輯細節）散落在程式碼中，沒有統一的參考文件。

## Goals / Non-Goals

**Goals:**
- 建立一份對開發者和管理員都有用的中文文件
- 將商業邏輯知識（目前只在程式碼中）文字化
- 整理 Notion schema JSON 使其更清晰
- 清除過時的舊文件

**Non-Goals:**
- 不寫 API 文件（LINE/Notion 官方文件已足夠）
- 不翻譯程式碼註解
- 不建立自動化文件生成機制

## Decisions

### 文件語言：中文
理由：專案是台灣羽球社團的工具，主要維護者和管理員都是中文使用者。技術術語（TypeScript、Notion、LINE API 等）保留英文。

### 文件結構：扁平 + 一個子目錄
```
docs/
├── README.md          ← 導覽
├── overview.md        ← 概覽與部署
├── architecture.md    ← 架構與設計決策
├── commands.md        ← 指令參考（管理員用）
├── registration.md    ← 報名系統（最複雜）
├── schedulers.md      ← 排程任務
├── notion/
│   ├── databases.md   ← 資料庫商業邏輯
│   └── schemas/*.json ← 保留
└── development.md     ← 開發設定
```

理由：扁平結構易於瀏覽。報名系統邏輯複雜（Mutex、容量計算、guest 命名），值得獨立一份。

### Notion schemas：保留並補充說明
保留 `schemas/*.json`，但在 `databases.md` 中加上商業邏輯說明（哪個欄位代表什麼業務意義），讓 JSON schema 成為技術參考，`databases.md` 成為業務說明。

### 刪除舊文件
`PLAN.md`：移植計畫已完成，架構決策提煉到 `architecture.md` 後刪除。
`docs/line/`：官方文件的複製，無自訂內容，刪除。
`docs/n8n/`：舊架構，刪除。
`docs/notion/*-blocks.md`：Notion block 格式參考，刪除。

## Risks / Trade-offs

- **文件與程式碼脫節風險**：文件是靜態的，程式碼會更新。→ 在 `architecture.md` 標注「如更改此邏輯請同步更新文件」的提示。
- **schema JSON 格式**：目前 JSON 有些欄位描述不夠清楚。→ 只補充說明，不更動資料（避免破壞現有工具）。
