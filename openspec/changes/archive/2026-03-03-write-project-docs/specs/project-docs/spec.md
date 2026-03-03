## ADDED Requirements

### Requirement: 根目錄 README.md
根目錄 `README.md` SHALL 提供快速入門資訊，包含專案簡介、快速啟動步驟（`npm run dev`、Docker）、以及指向 `docs/` 的連結。

#### Scenario: 開發者第一次看到專案
- **WHEN** 開發者進入專案根目錄
- **THEN** `README.md` 說明這是什麼、如何在本地啟動、環境變數如何設定

### Requirement: docs/README.md 文件導覽
`docs/README.md` SHALL 列出所有文件及其用途，方便快速找到需要的資訊。

#### Scenario: 想找特定文件的人
- **WHEN** 使用者開啟 `docs/README.md`
- **THEN** 可以看到每份文件的名稱與一行說明，知道要去哪裡找想要的資訊

### Requirement: docs/overview.md 專案概覽
`docs/overview.md` SHALL 包含：專案用途說明、技術棧表格、部署方式（Docker/Zeabur）、以及系統常數（每場最多人數 COURTS_DENSITY=7）。

#### Scenario: 想了解系統整體概況
- **WHEN** 使用者閱讀 `overview.md`
- **THEN** 能了解這個 bot 是做什麼的、用哪些技術、怎麼部署

### Requirement: docs/architecture.md 系統架構
`docs/architecture.md` SHALL 說明：Webhook 處理流程（含 ASCII 流程圖）、指令系統架構、Notion 資料層（Repository Pattern）、以及關鍵設計決策（Fire-and-forget、In-process Mutex、Zod validation、Request correlation ID）。

#### Scenario: 開發者要修改核心流程
- **WHEN** 開發者閱讀 `architecture.md`
- **THEN** 能看到完整的訊息處理流程圖，了解從 Webhook 進來到回覆 LINE 的每個步驟

### Requirement: docs/commands.md 指令參考
`docs/commands.md` SHALL 列出所有 `@Dobby` 指令，每個指令包含：觸發關鍵字、功能說明、是否限管理員、範例輸入。

#### Scenario: 管理員查詢可用指令
- **WHEN** 管理員閱讀 `commands.md`
- **THEN** 能看到所有指令的完整清單，包括管理員專屬指令

#### Scenario: 開發者新增指令
- **WHEN** 開發者要新增一個指令
- **THEN** `commands.md` 說明現有指令的模式，可以依樣畫葫蘆

### Requirement: docs/registration.md 報名系統
`docs/registration.md` SHALL 詳細說明：報名/取消/請假/銷假的流程、容量計算公式（`可用名額 = 場地 × 7 - 季租成員 + 請假人 - 已報名零打`）、guest 命名規則（`{姓名}的朋友`、`{姓名}的朋友2`）、Mutex 鎖定機制、跨平台 mention 解析問題及解法。

#### Scenario: 開發者要修改報名邏輯
- **WHEN** 開發者閱讀 `registration.md`
- **THEN** 能理解容量計算公式、guest 命名規則、Mutex 的必要性

#### Scenario: 管理員想理解報名規則
- **WHEN** 管理員閱讀 `registration.md`
- **THEN** 能了解季租成員和非季租成員的差異、誰可以幫別人報名

### Requirement: docs/schedulers.md 排程任務
`docs/schedulers.md` SHALL 說明兩個排程任務：每週日 09:00 的打球資訊推播（內容格式、觸發條件）、每週一 04:00 的顯示名稱更新（雙 bot 策略）。

#### Scenario: 排程任務沒有執行
- **WHEN** 管理員查閱 `schedulers.md`
- **THEN** 能了解排程的觸發時間和執行邏輯，方便除錯

### Requirement: docs/notion/databases.md 資料庫說明
`docs/notion/databases.md` SHALL 說明每個 Notion 資料庫的業務用途、關鍵欄位的業務含義、以及資料庫之間的關聯邏輯。

#### Scenario: 開發者要新增 Notion 查詢
- **WHEN** 開發者閱讀 `databases.md`
- **THEN** 能知道要查哪個資料庫、對應的 `property-helpers` 怎麼用

### Requirement: docs/development.md 開發設定
`docs/development.md` SHALL 包含：環境變數清單（每個變數的用途說明）、本地開發啟動步驟、測試執行方式、Docker 建置說明。

#### Scenario: 新開發者設定環境
- **WHEN** 新開發者第一次設定開發環境
- **THEN** 照著 `development.md` 可以成功啟動本地開發伺服器

### Requirement: 刪除舊文件
以下文件 SHALL 在新文件建立完成後刪除：`PLAN.md`、`docs/project/`、`docs/line/`、`docs/n8n/`、`docs/notion/*-blocks.md`（6 個）、`docs/notion/database-schema.md`、`docs/notion/AI-SCHEMA-UPDATE-GUIDE.md`。`docs/notion/schemas/*.json` 保留。

#### Scenario: 文件整理完成
- **WHEN** 所有新文件建立完成
- **THEN** 舊文件已刪除，`docs/` 結構乾淨，只剩新文件和 `schemas/*.json`
