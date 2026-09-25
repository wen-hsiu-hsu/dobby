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

  it('does not treat @Dobby next?c=2 or @Dobby nextfoo as NEXT_EVENT now that matching is exact', () => {
    expect(parseCommand('@Dobby next?c=2')?.type).toBe(CommandType.UNKNOWN);
    expect(parseCommand('@Dobby nextfoo')?.type).toBe(CommandType.UNKNOWN);
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

  describe('@mention target (delegated commands)', () => {
    it('parses @Dobby @Name +1 as REGISTRATION with target', () => {
      const cmd = parseCommand('@Dobby @小明 +1');
      expect(cmd?.type).toBe(CommandType.REGISTRATION);
      expect(cmd?.delta).toBe('+1');
    });

    it('parses @Dobby @Name 假 as LEAVE with target', () => {
      expect(parseCommand('@Dobby @小明 假')?.type).toBe(CommandType.LEAVE);
    });

    it('parses @Dobby @Name 銷假 as CANCEL_LEAVE with target', () => {
      expect(parseCommand('@Dobby @小明 銷假')?.type).toBe(CommandType.CANCEL_LEAVE);
    });

    it('does not mistake a display name containing "-1" for a REGISTRATION command when there is no actual command', () => {
      const cmd = parseCommand('@Dobby @小明-1號');
      expect(cmd?.type).toBe(CommandType.UNKNOWN);
      expect(cmd?.delta).toBeUndefined();
    });

    it('does not mistake a display name containing "+2" for a REGISTRATION command when there is no actual command', () => {
      expect(parseCommand('@Dobby @阿+2')?.type).toBe(CommandType.UNKNOWN);
    });

    it('does not mistake a display name containing "假" for a LEAVE command when there is no actual command', () => {
      expect(parseCommand('@Dobby @放假中')?.type).toBe(CommandType.UNKNOWN);
    });

    it('still parses the real command when the display name contains a command-like substring', () => {
      const cmd = parseCommand('@Dobby @小明-1號 +1');
      expect(cmd?.type).toBe(CommandType.REGISTRATION);
      expect(cmd?.delta).toBe('+1');
    });
  });
});
