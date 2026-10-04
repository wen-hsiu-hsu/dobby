import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from '../utils/logger.js';

// How long a ticket waits for the tickets ahead of it, counted from when it was taken.
// Past this it enters anyway — the only way the gate lets order break. Kept short: the
// wait happens before `withMutex`, so it's outside the mutex timeout but still eats into
// the replyToken's ~1 minute lifetime.
const WAIT_CAP_MS = 5_000;

// Same rule as mutex.ts's INFO_SUMMARY_KEY: only a bare ISO date key (no user identity)
// may be logged at info; any other key format is logged at debug and without the key, so a
// future `user-…` key can't leak a userId (ADR 0005).
const INFO_KEY = /^\d{4}-\d{2}-\d{2}$/;

interface Ticket {
  key: string;
  number: number;
  takenAt: number;
  /** LINE's `event.timestamp`, logged so arrival order at the Pi can be compared with LINE's order. */
  lineTimestamp: number | undefined;
  /** Resolves (true = cap hit) once every earlier ticket for the key has entered or exited, or the cap passed. */
  turn: Promise<boolean>;
  release: () => void;
}

// Per key, the promise the next ticket waits on: resolves once every ticket taken so far
// has entered or exited. Separate from mutex.ts's `queues` on purpose: this orders who
// *calls* withMutex, the mutex orders who *runs* — see ADR 0018.
const tails = new Map<string, Promise<void>>();
const counters = new Map<string, number>();
const storage = new AsyncLocalStorage<Ticket>();

/**
 * Takes a ticket for `key` synchronously, in arrival order, and runs `fn` holding it.
 * `fn` runs right away — lookups before the lock stay parallel; only the
 * `enterInOrder` call inside it waits its turn. The ticket is released when `fn`
 * settles if `enterInOrder` never did, so every early-exit path frees the line.
 */
export async function withEntryTicket<T>(key: string, lineTimestamp: number | undefined, fn: () => Promise<T>): Promise<T> {
  const number = (counters.get(key) ?? 0) + 1;
  counters.set(key, number);
  const takenAt = Date.now();
  const prev = tails.get(key);

  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const turn = prev ? capped(prev) : Promise.resolve(false);
  // Chained on `turn`, not just `released`: a ticket that exits early must still not let
  // the next one pass the tickets ahead of it. Chained on the *capped* turn so one stuck
  // ticket costs the line a single cap, not one cap per ticket behind it.
  const done = turn.then(() => released);
  tails.set(key, done);
  void done.then(() => {
    if (tails.get(key) === done) {
      tails.delete(key);
      counters.delete(key);
    }
  });

  const ticket: Ticket = { key, number, takenAt, lineTimestamp, turn, release };
  try {
    return await storage.run(ticket, fn);
  } finally {
    release();
  }
}

/**
 * Waits until every earlier ticket has entered or exited, calls `enter` (which must
 * synchronously reach `withMutex`'s queue), then lets the next ticket through.
 * Without a ticket in context (tests, other callers) it just calls `enter`.
 */
export async function enterInOrder<T>(enter: () => Promise<T>): Promise<T> {
  const ticket = storage.getStore();
  if (!ticket) return enter();

  const timedOut = await ticket.turn;
  const keyIsSafe = INFO_KEY.test(ticket.key);
  const summary = {
    key: keyIsSafe ? ticket.key : undefined,
    ticket: ticket.number,
    gateWaitMs: Date.now() - ticket.takenAt,
    lineTimestamp: ticket.lineTimestamp,
  };
  if (timedOut) {
    // Rare and must show on /logs whatever the key, so always warn; `key` is already
    // dropped above unless it is a bare date.
    logger.warn(summary, 'Entry gate wait capped; entering out of order');
  } else {
    logger[keyIsSafe ? 'info' : 'debug'](summary, 'Entry gate passed');
  }
  // `enter()` reaches withMutex's `queues.set` before its first await, so the next
  // ticket may go as soon as it returns. Releasing in a `finally` after awaiting it
  // instead would hold the line for the whole mutation and serialize every request.
  const pending = enter();
  ticket.release();
  return pending;
}

function capped(prev: Promise<void>): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(true), WAIT_CAP_MS);
    void prev.then(() => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
