import { describe, it, expect, vi, afterEach } from 'vitest';
import { routeCommand } from '../command-router.js';
import { CommandType } from '../../types/commands.js';
import type { ParsedCommand } from '../../types/commands.js';
import { handleIntroduce } from '../introduce.js';
import { handleOwe } from '../owe.js';
import { handleCommandList } from '../command-list.js';
import { handleParticipants } from '../participants.js';
import { handleNextEvent } from '../next-event.js';
import { handleNews } from '../news.js';
import { handlePayment } from '../payment.js';
import { handleRegistration } from '../registration/registration-handler.js';
import { handleLeave } from '../registration/leave-handler.js';

vi.mock('../introduce.js', () => ({ handleIntroduce: vi.fn() }));
vi.mock('../owe.js', () => ({ handleOwe: vi.fn() }));
vi.mock('../command-list.js', () => ({ handleCommandList: vi.fn() }));
vi.mock('../participants.js', () => ({ handleParticipants: vi.fn() }));
vi.mock('../next-event.js', () => ({ handleNextEvent: vi.fn() }));
vi.mock('../news.js', () => ({ handleNews: vi.fn() }));
vi.mock('../payment.js', () => ({ handlePayment: vi.fn() }));
vi.mock('../registration/registration-handler.js', () => ({ handleRegistration: vi.fn() }));
vi.mock('../registration/leave-handler.js', () => ({ handleLeave: vi.fn() }));

const allHandlers = [
  handleIntroduce,
  handleOwe,
  handleCommandList,
  handleParticipants,
  handleNextEvent,
  handleNews,
  handlePayment,
  handleRegistration,
  handleLeave,
] as const;

function makeEvent(overrides: Partial<{ replyToken: string; userId: string }> = {}) {
  return {
    replyToken: overrides.replyToken ?? 'reply-token-1',
    message: { text: '@Dobby test' },
    source: { userId: overrides.userId ?? 'user-alice' },
  };
}

function makeCommand(type: CommandType, delta?: string): ParsedCommand {
  return { type, rawText: '@Dobby test', delta };
}

/** Asserts that exactly one handler in allHandlers was called, and no others. */
function expectOnlyCalled(called: (...args: any[]) => any) {
  for (const handler of allHandlers) {
    if (handler === called) {
      expect(handler).toHaveBeenCalledTimes(1);
    } else {
      expect(handler).not.toHaveBeenCalled();
    }
  }
}

describe('routeCommand dispatch', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('dispatches INTRODUCE to handleIntroduce with replyToken and actor userId', async () => {
    const event = makeEvent({ replyToken: 'rt-1', userId: 'user-alice' });
    await routeCommand(makeCommand(CommandType.INTRODUCE), event, false);

    expect(handleIntroduce).toHaveBeenCalledWith('rt-1', 'user-alice');
    expectOnlyCalled(handleIntroduce);
  });

  it('dispatches OWE to handleOwe with replyToken', async () => {
    const event = makeEvent({ replyToken: 'rt-2' });
    await routeCommand(makeCommand(CommandType.OWE), event, false);

    expect(handleOwe).toHaveBeenCalledWith('rt-2');
    expectOnlyCalled(handleOwe);
  });

  it('dispatches COMMAND_LIST to handleCommandList with replyToken and isAdmin=false', async () => {
    const event = makeEvent({ replyToken: 'rt-3' });
    await routeCommand(makeCommand(CommandType.COMMAND_LIST), event, false);

    expect(handleCommandList).toHaveBeenCalledWith('rt-3', false);
    expectOnlyCalled(handleCommandList);
  });

  it('dispatches COMMAND_LIST to handleCommandList with replyToken and isAdmin=true', async () => {
    const event = makeEvent({ replyToken: 'rt-3' });
    await routeCommand(makeCommand(CommandType.COMMAND_LIST), event, true);

    expect(handleCommandList).toHaveBeenCalledWith('rt-3', true);
    expectOnlyCalled(handleCommandList);
  });

  it('dispatches PARTICIPANTS to handleParticipants with replyToken', async () => {
    const event = makeEvent({ replyToken: 'rt-4' });
    await routeCommand(makeCommand(CommandType.PARTICIPANTS), event, false);

    expect(handleParticipants).toHaveBeenCalledWith('rt-4');
    expectOnlyCalled(handleParticipants);
  });

  it('dispatches NEXT_EVENT to handleNextEvent with replyToken and isAdmin=true', async () => {
    const event = makeEvent({ replyToken: 'rt-5' });
    await routeCommand(makeCommand(CommandType.NEXT_EVENT), event, true);

    expect(handleNextEvent).toHaveBeenCalledWith('rt-5', true);
    expectOnlyCalled(handleNextEvent);
  });

  it('dispatches NEXT_EVENT to handleNextEvent with replyToken and isAdmin=false', async () => {
    const event = makeEvent({ replyToken: 'rt-5b' });
    await routeCommand(makeCommand(CommandType.NEXT_EVENT), event, false);

    expect(handleNextEvent).toHaveBeenCalledWith('rt-5b', false);
    expectOnlyCalled(handleNextEvent);
  });

  it('dispatches NEWS to handleNews with replyToken', async () => {
    const event = makeEvent({ replyToken: 'rt-6' });
    await routeCommand(makeCommand(CommandType.NEWS), event, false);

    expect(handleNews).toHaveBeenCalledWith('rt-6');
    expectOnlyCalled(handleNews);
  });

  it('dispatches PAYMENT to handlePayment with replyToken', async () => {
    const event = makeEvent({ replyToken: 'rt-7' });
    await routeCommand(makeCommand(CommandType.PAYMENT), event, false);

    expect(handlePayment).toHaveBeenCalledWith('rt-7');
    expectOnlyCalled(handlePayment);
  });

  it('dispatches REGISTRATION to handleRegistration with parsed delta and isAdmin', async () => {
    const event = makeEvent({ replyToken: 'rt-8' });
    await routeCommand(makeCommand(CommandType.REGISTRATION, '+3'), event, true);

    expect(handleRegistration).toHaveBeenCalledWith(event, 3, true);
    expectOnlyCalled(handleRegistration);
  });

  it('dispatches LEAVE to handleLeave with isCancel=false and isAdmin', async () => {
    const event = makeEvent({ replyToken: 'rt-9' });
    await routeCommand(makeCommand(CommandType.LEAVE), event, true);

    expect(handleLeave).toHaveBeenCalledWith(event, false, true);
    expectOnlyCalled(handleLeave);
  });

  it('dispatches CANCEL_LEAVE to handleLeave with isCancel=true and isAdmin', async () => {
    const event = makeEvent({ replyToken: 'rt-10' });
    await routeCommand(makeCommand(CommandType.CANCEL_LEAVE), event, false);

    expect(handleLeave).toHaveBeenCalledWith(event, true, false);
    expectOnlyCalled(handleLeave);
  });

  it('does not call any handler and does not throw for UNKNOWN', async () => {
    const event = makeEvent();

    await expect(
      routeCommand(makeCommand(CommandType.UNKNOWN), event, false)
    ).resolves.toBeUndefined();

    for (const handler of allHandlers) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  describe('REGISTRATION delta parsing', () => {
    it('parses a positive delta string like "+3" to 3', async () => {
      const event = makeEvent();
      await routeCommand(makeCommand(CommandType.REGISTRATION, '+3'), event, false);

      expect(handleRegistration).toHaveBeenCalledWith(event, 3, false);
    });

    it('parses a negative delta string like "-2" to -2', async () => {
      const event = makeEvent();
      await routeCommand(makeCommand(CommandType.REGISTRATION, '-2'), event, false);

      expect(handleRegistration).toHaveBeenCalledWith(event, -2, false);
    });

    it('falls back to +1 when delta is undefined', async () => {
      const event = makeEvent();
      await routeCommand(makeCommand(CommandType.REGISTRATION, undefined), event, false);

      expect(handleRegistration).toHaveBeenCalledWith(event, 1, false);
    });
  });
});
