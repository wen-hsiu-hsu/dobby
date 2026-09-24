export interface NotionUser {
  pageId: string;
  userId: string;
  customName: string;           // LINE display name — Custom Name
  registeredPersonPageId: string; // pageId in People DB — Registered name (relation)
  isAdmin: boolean;
  messageCount: number;
  groups: string[];
  multiChats: string[];
}

export interface CalendarEvent {
  pageId: string;
  date: string;
  absentees: string[]; // relation pageIds of People (請假人)
  guests: string[]; // multi_select names (零打)
  isPaused: boolean; // 類型 === '打球暫停'
  courts: number | null; // 場地數 — 本週場地數，null 表示未填（改用當季預設 SeasonRecord.courts）
}

export interface SeasonRecord {
  pageId: string;
  name: string; // format: YYYY-QN (e.g. "2025-Q1") — 季租時段
  members: string[]; // relation pageIds of People — 報名人
  courts: number; // 場地數
  guestFee: number; // 零打費用
  location: string; // 地點
  weekCounts: number; // 租借次數 (2hrs) — 本季總租借次數
  pricePerPersonForSeason: number | null; // 每人平均場租（formula）
  pricePerPersonOverride: number | null; // 每人平均場租（特殊狀況）— 設定時取代 formula 值
  totalPrice: number | null; // 場租總金額（formula）
  playDatePageIds: string[]; // 打球日（relation → Calendar），用於公告列出本季所有打球日期
}

export interface PersonRecord {
  pageId: string;
  name: string;
  hasPaid: boolean;
  lineUserId: string;
}

export interface AnnouncementRecord {
  pageId: string;
  name: string;
}
