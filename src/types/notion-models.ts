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
}

export interface SeasonRecord {
  pageId: string;
  name: string; // format: YYYY-QN (e.g. "2025-Q1") — 季租時段
  members: string[]; // relation pageIds of People — 報名人
  courts: number; // 場地數
  guestFee: number; // 零打費用
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
