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
});

describe('parseCommand', () => {
  it('returns null for non-command', () => {
    expect(parseCommand('hello')).toBeNull();
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

  it('parses @Dobby next?-=1&c=2 with queryParams', () => {
    const cmd = parseCommand('@Dobby next?-=1&c=2');
    expect(cmd?.type).toBe(CommandType.NEXT_EVENT);
    expect(cmd?.queryParams).toBe('-=1&c=2');
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
