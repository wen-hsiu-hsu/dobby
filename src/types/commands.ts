export enum CommandType {
  REGISTRATION = 'registration',   // @Dobby +N / -N / @mention
  LEAVE = 'leave',                 // @Dobby 假
  CANCEL_LEAVE = 'cancel_leave',   // @Dobby 銷假
  INTRODUCE = 'introduce',         // @Dobby (alone)
  OWE = 'owe',                     // @Dobby 欠 / @Dobby owe
  COMMAND_LIST = 'command_list',   // @Dobby command / @Dobby 指令
  PARTICIPANTS = 'participants',   // @Dobby participants / people / 報名人
  NEXT_EVENT = 'next_event',       // @Dobby next (admin only)
  NEWS = 'news',                   // @Dobby news / announcement / 公告
  PAYMENT = 'payment',             // @Dobby payment / 付款
  UNKNOWN = 'unknown',
}

export interface NextEventQueryParams {
  dayOffset?: number;      // from -=N
  courtOverride?: number;  // from c=N
}

export interface ParsedCommand {
  type: CommandType;
  rawText: string;
  /** For registration: +N or -N (e.g. "+1", "-2") */
  delta?: string;
  /** For next_event: parsed "-=N" / "c=N" query DSL */
  queryParams?: NextEventQueryParams;
}

export interface RegistrationTarget {
  isSelf: boolean;
  targetUserId?: string;   // from mention (mobile)
  targetName?: string;     // display name from mention or typed name
  parseError?: string;
}
