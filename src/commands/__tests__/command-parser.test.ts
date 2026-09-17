import { describe, it, expect } from 'vitest';
import { parseCommand, isCommand } from '../command-parser.js';
import { CommandType } from '../../types/commands.js';

describe('isCommand', () => {
  it('returns true for @Dobby prefix', () => {
    expect(isCommand('@Dobby +1')).toBe(true);
  });
  it('returns false for non-command', () => {
    expect(isCommand('hello')).toBe(false);
  });
  it('returns false for lowercase @dobby — the bot name is case-sensitive by design', () => {
    expect(isCommand('@dobby +1')).toBe(false);
  });
});

describe('parseCommand', () => {
  it('returns null for non-command', () => {
    expect(parseCommand('hello')).toBeNull();
  });

  it('returns null for lowercase @dobby — the bot name is case-sensitive by design', () => {
    expect(parseCommand('@dobby +1')).toBeNull();
  });

  it('parses @Dobby alone as INTRODUCE', () => {
    expect(parseCommand('@Dobby')?.type).toBe(CommandType.INTRODUCE);
  });

  it('parses @Dobby +1 as REGISTRATION', () => {
    const cmd = parseCommand('@Dobby +1');
    expect(cmd?.type).toBe(CommandType.REGISTRATION);
    expect(cmd?.delta).toBe('+1');
  });

  it('parses @Dobby -2 as REGISTRATION', () => {
    const cmd = parseCommand('@Dobby -2');
    expect(cmd?.type).toBe(CommandType.REGISTRATION);
    expect(cmd?.delta).toBe('-2');
  });

  it('collapses repeated spaces after @Dobby, e.g. "@Dobby  +2" behaves like "@Dobby +2"', () => {
    const cmd = parseCommand('@Dobby  +2');
    expect(cmd?.type).toBe(CommandType.REGISTRATION);
    expect(cmd?.delta).toBe('+2');
  });

  it('collapses repeated internal spaces, e.g. "@Dobby   指令" behaves like "@Dobby 指令"', () => {
    expect(parseCommand('@Dobby   指令')?.type).toBe(CommandType.COMMAND_LIST);
  });

  it('parses full-width ＋1 as REGISTRATION', () => {
    const cmd = parseCommand('@Dobby ＋1');
    expect(cmd?.type).toBe(CommandType.REGISTRATION);
    expect(cmd?.delta).toBe('+1');
  });

  it('parses full-width －1 as REGISTRATION', () => {
    const cmd = parseCommand('@Dobby －1');
    expect(cmd?.type).toBe(CommandType.REGISTRATION);
  });

  it('parses @Dobby 假 as LEAVE', () => {
    expect(parseCommand('@Dobby 假')?.type).toBe(CommandType.LEAVE);
  });

  it('parses @Dobby 銷假 as CANCEL_LEAVE', () => {
    expect(parseCommand('@Dobby 銷假')?.type).toBe(CommandType.CANCEL_LEAVE);
  });

  it('parses @Dobby 欠 as OWE', () => {
    expect(parseCommand('@Dobby 欠')?.type).toBe(CommandType.OWE);
  });

  it('parses @Dobby owe as OWE', () => {
    expect(parseCommand('@Dobby owe')?.type).toBe(CommandType.OWE);
  });

  it('parses @Dobby command as COMMAND_LIST', () => {
    expect(parseCommand('@Dobby command')?.type).toBe(CommandType.COMMAND_LIST);
  });

  it('parses @Dobby 指令 as COMMAND_LIST', () => {
    expect(parseCommand('@Dobby 指令')?.type).toBe(CommandType.COMMAND_LIST);
  });

  it('parses @Dobby participants as PARTICIPANTS', () => {
    expect(parseCommand('@Dobby participants')?.type).toBe(CommandType.PARTICIPANTS);
  });

  it('parses @Dobby 報名人 as PARTICIPANTS', () => {
    expect(parseCommand('@Dobby 報名人')?.type).toBe(CommandType.PARTICIPANTS);
  });

  it('parses @Dobby next as NEXT_EVENT', () => {
    expect(parseCommand('@Dobby next')?.type).toBe(CommandType.NEXT_EVENT);
  });

  it('parses @Dobby next?-=1&c=2 with structured queryParams', () => {
    const cmd = parseCommand('@Dobby next?-=1&c=2');
    expect(cmd?.type).toBe(CommandType.NEXT_EVENT);
    expect(cmd?.queryParams).toEqual({ dayOffset: -1, courtOverride: 2 });
  });

  it('parses @Dobby next?c=3 with only courtOverride', () => {
    const cmd = parseCommand('@Dobby next?c=3');
    expect(cmd?.queryParams).toEqual({ courtOverride: 3 });
  });

  it('parses @Dobby next?-=2 with only dayOffset', () => {
    const cmd = parseCommand('@Dobby next?-=2');
    expect(cmd?.queryParams).toEqual({ dayOffset: -2 });
  });

  it('parses @Dobby next without query as no queryParams', () => {
    const cmd = parseCommand('@Dobby next');
    expect(cmd?.queryParams).toBeUndefined();
  });

  it('parses @Dobby news as NEWS', () => {
    expect(parseCommand('@Dobby news')?.type).toBe(CommandType.NEWS);
  });

  it('parses @Dobby 公告 as NEWS', () => {
    expect(parseCommand('@Dobby 公告')?.type).toBe(CommandType.NEWS);
  });

  it('parses @Dobby payment as PAYMENT', () => {
    expect(parseCommand('@Dobby payment')?.type).toBe(CommandType.PAYMENT);
  });

  it('parses @Dobby 付款 as PAYMENT', () => {
    expect(parseCommand('@Dobby 付款')?.type).toBe(CommandType.PAYMENT);
  });

  it('returns UNKNOWN for unrecognized command', () => {
    expect(parseCommand('@Dobby xyz')?.type).toBe(CommandType.UNKNOWN);
  });
});
