import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

interface RequestContext {
  reqId: string;
  quoteToken?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(fn: () => Promise<T>, quoteToken?: string): Promise<T> {
  const reqId = randomBytes(3).toString('hex'); // e.g. "a3f9c2"
  return storage.run({ reqId, quoteToken }, fn);
}

export function getReqId(): string | undefined {
  return storage.getStore()?.reqId;
}

/** quoteToken of the inbound text message being handled, if any — lets replies quote the original message. */
export function getQuoteToken(): string | undefined {
  return storage.getStore()?.quoteToken;
}
