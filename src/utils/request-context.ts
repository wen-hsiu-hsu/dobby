import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

interface RequestContext {
  reqId?: string;
  quoteToken?: string;
  purpose?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(fn: () => Promise<T>, quoteToken?: string): Promise<T> {
  const reqId = randomBytes(3).toString('hex'); // e.g. "a3f9c2"
  return storage.run({ reqId, quoteToken }, fn);
}

/**
 * Tags every log line emitted inside `fn` with a human-readable purpose,
 * layered on top of whatever context is already active (reqId/quoteToken
 * survive) rather than replacing it — so a repository function called
 * mid-event keeps its reqId while gaining a purpose label. Safe to call
 * with no `runWithContext` active too (e.g. from scheduler code), in which
 * case only `purpose` ends up set.
 */
export function withPurpose<T>(purpose: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ ...storage.getStore(), purpose }, fn);
}

export function getReqId(): string | undefined {
  return storage.getStore()?.reqId;
}

/** quoteToken of the inbound text message being handled, if any — lets replies quote the original message. */
export function getQuoteToken(): string | undefined {
  return storage.getStore()?.quoteToken;
}

/** Human-readable label for what the current call chain is doing, set via `withPurpose`. */
export function getPurpose(): string | undefined {
  return storage.getStore()?.purpose;
}
