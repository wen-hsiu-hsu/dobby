import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MessageEvent } from '@line/bot-sdk';
import { handleMessage } from '../message-handler.js';
import { findByUserId } from '../../services/notion/users-repository.js';
import { replyMessage } from '../../services/line/reply-service.js';
import { routeCommand } from '../../commands/command-router.js';
import { trackUser } from '../../services/user-management.js';
import { withEntryTicket } from '../../services/entry-gate.js';

vi.mock('../../services/notion/users-repository.js');
vi.mock('../../services/line/reply-service.js');
vi.mock('../../commands/command-router.js');
vi.mock('../../services/user-management.js');
vi.mock('../../services/entry-gate.js');

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../utils/logger.js', () => ({ logger: loggerMock }));

function textEvent(text: string): MessageEvent {
  return {
    type: 'message',
    replyToken: 'reply-token-1',
    source: { type: 'group', userId: 'user-1', groupId: 'group-1' },
    message: { type: 'text', text } as any,
  } as unknown as MessageEvent;
}

beforeEach(() => {
  vi.resetAllMocks();
  // Pass-through, so the ticket doesn't change what the other tests see.
  vi.mocked(withEntryTicket).mockImplementation(async (_key, _ts, fn) => fn());
});

describe('handleMessage', () => {
  it.each(['@Dobby +1', '@Dobby -1', '@Dobby 假', '@Dobby 銷假'])(
    'takes an entry ticket for the event date before the USERS lookup for %s (ADR 0018)',
    async (text) => {
      vi.mocked(withEntryTicket).mockImplementation(async (_key, _ts, fn) => {
        expect(findByUserId).not.toHaveBeenCalled();
        return fn();
      });
      vi.mocked(findByUserId).mockResolvedValue(null);

      await handleMessage({ ...textEvent(text), timestamp: 1700000000000 } as MessageEvent);

      expect(withEntryTicket).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 1700000000000, expect.any(Function));
      expect(routeCommand).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['@Dobby 欠', '@Dobby 報名人', 'hello'])('does not take an entry ticket for %s', async (text) => {
    vi.mocked(findByUserId).mockResolvedValue(null);

    await handleMessage(textEvent(text));

    expect(withEntryTicket).not.toHaveBeenCalled();
  });

  it('replies with a generic error and skips routing when findByUserId throws', async () => {
    vi.mocked(findByUserId).mockRejectedValue(new Error('Notion API error'));

    await handleMessage(textEvent('@Dobby +1'));

    expect(replyMessage).toHaveBeenCalledWith(
      'reply-token-1',
      [{ type: 'text', text: '系統錯誤，請稍後再試' }],
    );
    expect(routeCommand).not.toHaveBeenCalled();
    expect(trackUser).not.toHaveBeenCalled();
  });

  describe('user tracking vs. command routing', () => {
    let finishTracking: () => void;

    beforeEach(() => {
      vi.mocked(trackUser).mockReturnValue(new Promise<void>((resolve) => { finishTracking = resolve; }));
    });

    async function flush(): Promise<void> {
      await new Promise((resolve) => setImmediate(resolve));
    }

    it('waits for a brand-new user to be recorded before routing their command', async () => {
      vi.mocked(findByUserId).mockResolvedValue(null);

      const handling = handleMessage(textEvent('@Dobby +1'));
      await flush();
      expect(routeCommand).not.toHaveBeenCalled();

      finishTracking();
      await handling;
      expect(trackUser).toHaveBeenCalledWith('user-1', { groupId: 'group-1', multiChatId: undefined }, null);
      expect(routeCommand).toHaveBeenCalled();
    });

    it('does not wait on tracking for a known user', async () => {
      const knownUser = { isAdmin: false } as any;
      vi.mocked(findByUserId).mockResolvedValue(knownUser);

      const handling = handleMessage(textEvent('@Dobby +1'));
      await flush();
      // The snapshot is handed down so resolveTarget doesn't query USERS again
      expect(routeCommand).toHaveBeenCalledWith(expect.anything(), expect.anything(), false, knownUser);

      finishTracking();
      await handling;
    });

    it('does not wait on tracking for a brand-new user sending a non-command message', async () => {
      vi.mocked(findByUserId).mockResolvedValue(null);
      let done = false;

      const handling = handleMessage(textEvent('hello')).then(() => { done = true; });
      await flush();
      expect(trackUser).toHaveBeenCalled();
      expect(done).toBe(true);

      finishTracking();
      await handling;
    });
  });

  // /logs 靠這行在 LOG_LEVEL=info 下分辨指令／對話（routes/logs.ts 的
  // groupKind/groupOrigin），所以每個分支都要先記到；依 ADR 0005 不能帶訊息
  // 原文或 userId。
  describe('info-level "Message classified" summary', () => {
    function classifiedCalls() {
      return loggerMock.info.mock.calls.filter(([, msg]) => msg === 'Message classified');
    }

    function expectNoPiiAtInfo(text: string) {
      for (const call of loggerMock.info.mock.calls) {
        const serialized = JSON.stringify(call);
        expect(serialized).not.toContain('user-1');
        expect(serialized).not.toContain(text);
      }
    }

    it('logs isCommand=false for chat (including the admin skip branch)', async () => {
      vi.mocked(findByUserId).mockResolvedValue({ isAdmin: true } as any);
      vi.mocked(trackUser).mockResolvedValue();

      await handleMessage(textEvent('大家好'));

      expect(classifiedCalls()).toEqual([[{ isCommand: false }, 'Message classified']]);
      expectNoPiiAtInfo('大家好');
    });

    it('logs the parsed command type for a command', async () => {
      vi.mocked(findByUserId).mockResolvedValue({ isAdmin: false } as any);
      vi.mocked(trackUser).mockResolvedValue();

      await handleMessage(textEvent('@Dobby +1'));

      expect(classifiedCalls()).toEqual([
        [{ isCommand: true, commandType: 'registration' }, 'Message classified'],
      ]);
      expectNoPiiAtInfo('@Dobby +1');
    });

    it('classifies unrecognised @Dobby text as an unknown command and still routes it (no auto-reply)', async () => {
      vi.mocked(findByUserId).mockResolvedValue({ isAdmin: false } as any);
      vi.mocked(trackUser).mockResolvedValue();

      await handleMessage(textEvent('@Dobby hello'));

      expect(classifiedCalls()).toEqual([
        [{ isCommand: true, commandType: 'unknown' }, 'Message classified'],
      ]);
      expect(routeCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'unknown' }), expect.anything(), false, expect.anything());
    });

    it('is logged before the USERS lookup, so a lookup failure still has it', async () => {
      vi.mocked(findByUserId).mockRejectedValue(new Error('Notion API error'));

      await handleMessage(textEvent('@Dobby 假'));

      expect(classifiedCalls()).toEqual([
        [{ isCommand: true, commandType: 'leave' }, 'Message classified'],
      ]);
    });
  });

  describe('ignored messages', () => {
    it('logs an info line (not warn) and skips everything when the source has no userId', async () => {
      const event = textEvent('@Dobby +1');
      delete (event.source as { userId?: string }).userId;

      await handleMessage(event);

      expect(loggerMock.info).toHaveBeenCalledWith({ sourceType: 'group' }, 'Message ignored: no userId');
      expect(loggerMock.warn).not.toHaveBeenCalled();
      expect(loggerMock.error).not.toHaveBeenCalled();
      expect(loggerMock.info.mock.calls.some(([, msg]) => msg === 'Message classified')).toBe(false);
      expect(findByUserId).not.toHaveBeenCalled();
    });

    it('logs a debug line for non-text messages', async () => {
      const event = {
        type: 'message',
        replyToken: 'reply-token-1',
        source: { type: 'group', userId: 'user-1', groupId: 'group-1' },
        message: { type: 'sticker', id: 'm1', packageId: '1', stickerId: '1' },
      } as unknown as MessageEvent;

      await handleMessage(event);

      expect(loggerMock.debug).toHaveBeenCalledWith({ messageType: 'sticker' }, 'Message ignored: not text');
      expect(loggerMock.info).not.toHaveBeenCalled();
      expect(findByUserId).not.toHaveBeenCalled();
    });
  });
});
