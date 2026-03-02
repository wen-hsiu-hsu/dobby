export interface NotionUser {
  pageId: string;
  userId: string;
  customName: string;
  isAdmin: boolean;
  messageCount: number;
  groups: string[];
  multiChats: string[];
}

export interface CalendarEvent {
  pageId: string;
  date: string;
  absentees: string[]; // relation pageIds of People
  guests: string[]; // multi_select names (zero-da)
  capacity: number | null;
  isPaused: boolean;
}

export interface SeasonRecord {
  pageId: string;
  name: string; // format: YYYY-QN (e.g. "2025-Q1")
  members: string[]; // relation pageIds of People
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
