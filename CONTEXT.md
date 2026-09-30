# Dobby

羽球社 LINE bot 的報名／請假子系統。以 Notion 為主要資料庫，管理每週活動的出席與零打名額。

## Language

**活動（Event）**：
每週六的羽球聚會，對應 Notion Calendar 資料庫的一筆頁面。有場地暫停狀態、請假名單、零打名單。
_Avoid_: Calendar page（這是實作層的 Notion 概念，不是領域詞）、session

**季租成員（Season Member）**：
在當季（Q1~Q4）繳費承租場地的固定成員，關聯到 Season 資料的 `members`。
_Avoid_: Member（過於籠統）、season rental member

**零打（Guest）**：
非季租成員、以單次名額報名參加活動的人，記錄在活動的 `零打` multi-select 欄位。季租成員也可以用零打名額帶朋友。
_Avoid_: Participant, attendee

**請假（Leave）**：
季租成員針對某次活動聲明不出席，釋放出的名額會回饋到零打可報名數。與「銷假」（取消請假）相對。
_Avoid_: Absence（英文可用於程式碼命名，但領域詞用「請假」）

**名額（Slot / Capacity）**：
單次活動可容納的零打人數，公式為「場地數 × 7 − 季租成員數 + 請假人數 − 已報名零打數」。管理員報名不受名額限制。
_Avoid_: Capacity（程式碼命名可用，領域討論用「名額」）
