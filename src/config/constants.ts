export const COURTS_DENSITY = 7;
export const MAX_GUESTS_PER_MEMBER = 1;

export const BOT_IDS = {
  DOBBY: 'dobby',
  BATTING: 'batting',
} as const;

export type BotId = (typeof BOT_IDS)[keyof typeof BOT_IDS];
