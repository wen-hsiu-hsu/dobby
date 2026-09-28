import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logFatalAndExit, registerCrashHandlers } from '../crash-handlers.js';
import { flushLogsSync, logger } from '../logger.js';

vi.mock('../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
  flushLogsSync: vi.fn(),
}));

let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
});

afterEach(() => {
  exitSpy.mockRestore();
});

describe('logFatalAndExit', () => {
  it('logs fatal, flushes the log file, then exits with code 1 — in that order', () => {
    const order: string[] = [];
    vi.mocked(logger.fatal).mockImplementation((() => void order.push('fatal')) as never);
    vi.mocked(flushLogsSync).mockImplementation(() => void order.push('flush'));
    exitSpy.mockImplementation((() => void order.push('exit')) as never);
    const err = new Error('boom');

    logFatalAndExit(err, 'Uncaught exception, exiting');

    expect(logger.fatal).toHaveBeenCalledWith({ err }, 'Uncaught exception, exiting');
    expect(order).toEqual(['fatal', 'flush', 'exit']);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('still exits when logging itself throws, so the process never keeps running in a broken state', () => {
    vi.mocked(logger.fatal).mockImplementation(() => {
      throw new Error('logger broken');
    });

    expect(() => logFatalAndExit(new Error('boom'), 'Uncaught exception, exiting')).toThrow('logger broken');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('registerCrashHandlers', () => {
  it('logs and exits on uncaughtException and unhandledRejection', () => {
    const onSpy = vi.spyOn(process, 'on').mockImplementation((() => process) as never);
    try {
      registerCrashHandlers();

      const handlers = new Map(onSpy.mock.calls.map(([event, fn]) => [event, fn as (arg: unknown) => void]));
      const err = new Error('thrown');
      handlers.get('uncaughtException')!(err);
      expect(logger.fatal).toHaveBeenLastCalledWith({ err }, 'Uncaught exception, exiting');

      handlers.get('unhandledRejection')!('rejected with a string');
      expect(logger.fatal).toHaveBeenLastCalledWith({ err: 'rejected with a string' }, 'Unhandled promise rejection, exiting');

      expect(flushLogsSync).toHaveBeenCalledTimes(2);
      expect(exitSpy).toHaveBeenCalledTimes(2);
    } finally {
      onSpy.mockRestore();
    }
  });
});
