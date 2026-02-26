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
  name: string;
  members: string[]; // relation pageIds of People
  startDate: string | null;
  endDate: string | null;
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
