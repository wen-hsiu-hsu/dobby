import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MessageEvent } from '@line/bot-sdk';
import { handleMessage } from '../message-handler.js';
import { findByUserId } from '../../services/notion/users-repository.js';
import { replyMessage } from '../../services/line/reply-service.js';
import { routeCommand } from '../../commands/command-router.js';
import { trackUser } from '../../services/user-management.js';

vi.mock('../../services/notion/users-repository.js');
vi.mock('../../services/line/reply-service.js');
vi.mock('../../commands/command-router.js');
vi.mock('../../services/user-management.js');

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
});

describe('handleMessage', () => {
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
});
