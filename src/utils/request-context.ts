import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

interface RequestContext {
  reqId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(fn: () => Promise<T>): Promise<T> {
  const reqId = randomBytes(3).toString('hex'); // e.g. "a3f9c2"
  return storage.run({ reqId }, fn);
}

export function getReqId(): string | undefined {
  return storage.getStore()?.reqId;
}
