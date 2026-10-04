import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MessageEvent } from '@line/bot-sdk';
import { handleMessage } from '../message-handler.js';
import { findByUserId } from '../../services/notion/users-repository.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import { resolveTarget } from '../../commands/registration/target-resolver.js';
import { getCurrentSeasonName } from '../../utils/date-utils.js';

// Drives handleMessage end to end with the REAL entry gate and REAL withMutex (neither
// is mocked here), to check the first-come-first-served guarantee from ADR 0018: the
// order messages arrive in, not the order their pre-lock lookups finish, decides who
// writes first. Notion access is mocked at the repository level, as in
// registration-concurrency.test.ts.
vi.mock('../../services/notion/users-repository.js');
vi.mock('../../services/notion/calendar-repository.js');
vi.mock('../../services/notion/season-repository.js');
vi.mock('../../services/notion/people-repository.js');
vi.mock('../../commands/registration/target-resolver.js');
vi.mock('../../services/line/reply-service.js');
vi.mock('../../services/user-management.js');
vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// 1:1 chat, so handleMessage skips trackUser and only the USERS lookup stands before routing.
function textEvent(userId: string, text: string): MessageEvent {
  return {
    type: 'message',
    replyToken: `token-${userId}`,
    timestamp: Date.now(),
    source: { type: 'user', userId },
    message: { type: 'text', text, mention: { mentionees: [] } } as any,
  } as unknown as MessageEvent;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveTarget).mockImplementation(async (_target, actorUserId) =>
    actorUserId === 'user-alice'
      ? { personPageId: 'person-1', displayName: 'Alice', resolvedVia: 'self' as const }
      : { personPageId: 'person-2', displayName: 'Bob', resolvedVia: 'self' as const },
  );
  vi.mocked(seasonRepo.findByNameCached).mockResolvedValue({
    pageId: 'season-1',
    name: getCurrentSeasonName(),
    members: ['person-1', 'person-2'],
    courts: 5,
    guestFee: 200,
    playDatePageIds: [],
  } as any);
});

describe('message ordering (real entry gate + real withMutex)', () => {
  it('writes the earlier +1 first even when its USERS lookup finishes after a later +1', async () => {
    let guests: string[] = [];
    vi.mocked(calendarRepo.findByDate).mockImplementation(async (date: string) => ({
      pageId: 'evt-1',
      date,
      absentees: [],
      guests: [...guests],
      isPaused: false,
      courts: null,
    }));
    vi.mocked(calendarRepo.updateGuests).mockImplementation(async (_pageId, newGuests) => {
      guests = newGuests;
    });

    const aliceLookup = deferred();
    vi.mocked(findByUserId).mockImplementation(async (userId: string) => {
      if (userId === 'user-alice') await aliceLookup.promise;
      return null;
    });

    const a = handleMessage(textEvent('user-alice', '@Dobby +1'));
    const b = handleMessage(textEvent('user-bob', '@Dobby +1'));

    // Let Bob's lookups finish and reach the gate while Alice's USERS lookup is still out.
    for (let i = 0; i < 50; i++) await Promise.resolve();
    // Bob's lookups are done, so he is genuinely held at the gate, not just slow.
    expect(resolveTarget).toHaveBeenCalledWith(expect.anything(), 'user-bob', null);
    expect(resolveTarget).not.toHaveBeenCalledWith(expect.anything(), 'user-alice', expect.anything());
    expect(calendarRepo.updateGuests).not.toHaveBeenCalled();

    aliceLookup.resolve();
    await Promise.all([a, b]);

    expect(vi.mocked(calendarRepo.updateGuests).mock.calls.map((call) => call[1])).toEqual([
      ['Alice的朋友'],
      ['Alice的朋友', 'Bob的朋友'],
    ]);
  });

  it('puts leave and registration in the same line, since 假 frees a slot for the +1 behind it', async () => {
    const writes: string[] = [];
    vi.mocked(calendarRepo.findByDate).mockImplementation(async (date: string) => ({
      pageId: 'evt-1',
      date,
      absentees: [],
      guests: [],
      isPaused: false,
      courts: null,
    }));
    vi.mocked(calendarRepo.updateAbsentees).mockImplementation(async () => {
      writes.push('absentees');
    });
    vi.mocked(calendarRepo.updateGuests).mockImplementation(async () => {
      writes.push('guests');
    });

    const aliceLookup = deferred();
    vi.mocked(findByUserId).mockImplementation(async (userId: string) => {
      if (userId === 'user-alice') await aliceLookup.promise;
      return null;
    });

    const a = handleMessage(textEvent('user-alice', '@Dobby 假'));
    const b = handleMessage(textEvent('user-bob', '@Dobby +1'));

    for (let i = 0; i < 50; i++) await Promise.resolve();
    expect(resolveTarget).toHaveBeenCalledWith(expect.anything(), 'user-bob', null);
    expect(writes).toEqual([]);

    aliceLookup.resolve();
    await Promise.all([a, b]);

    expect(writes).toEqual(['absentees', 'guests']);
  });
});
