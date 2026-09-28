import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGracefulShutdown, type ClosableServer } from '../graceful-shutdown.js';
import { flushLogsSync, logger } from '../logger.js';

vi.mock('../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
  flushLogsSync: vi.fn(),
}));

let exitSpy: ReturnType<typeof vi.spyOn>;

/** 假 server：記下 close 的 callback，由測試決定什麼時候「關完」。 */
function fakeServer(): ClosableServer & { closeCallback: (() => void) | undefined } {
  const server = {
    closeCallback: undefined as (() => void) | undefined,
    close: vi.fn((cb: () => void) => {
      server.closeCallback = cb;
    }),
  };
  return server;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
});

afterEach(() => {
  vi.useRealTimers();
  exitSpy.mockRestore();
});

describe('createGracefulShutdown — normal close', () => {
  it('syncs logs, closes the server, then logs, flushes and exits 0 — in that order', async () => {
    const order: string[] = [];
    vi.mocked(logger.info).mockImplementation(((arg1: unknown, arg2?: string) =>
      void order.push(`info:${typeof arg1 === 'string' ? arg1 : arg2}`)) as never);
    vi.mocked(flushLogsSync).mockImplementation(() => void order.push('flush'));
    exitSpy.mockImplementation(((code: number) => void order.push(`exit:${code}`)) as never);
    const server = fakeServer();
    const syncLogs = vi.fn(() => Promise.resolve());

    createGracefulShutdown(server, syncLogs)('SIGTERM');
    expect(syncLogs).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(server.close).toHaveBeenCalledTimes(1);

    server.closeCallback!();

    expect(order).toEqual([
      'info:Received shutdown signal, closing server',
      'info:Server closed, exiting',
      'flush',
      'exit:0',
    ]);
  });

  it('clears the force-exit timer once the server has closed', async () => {
    const server = fakeServer();
    createGracefulShutdown(server, () => Promise.resolve())('SIGTERM');
    await vi.advanceTimersByTimeAsync(0);
    server.closeCallback!();

    await vi.advanceTimersByTimeAsync(20_000);

    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('still flushes and exits 0 when logging "Server closed" throws', async () => {
    const server = fakeServer();
    createGracefulShutdown(server, () => Promise.resolve())('SIGTERM');
    await vi.advanceTimersByTimeAsync(0);
    vi.mocked(logger.info).mockImplementation(() => {
      throw new Error('logger broken');
    });

    expect(() => server.closeCallback!()).toThrow('logger broken');
    expect(flushLogsSync).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('still exits 0 when flushing throws', async () => {
    const server = fakeServer();
    createGracefulShutdown(server, () => Promise.resolve())('SIGTERM');
    await vi.advanceTimersByTimeAsync(0);
    vi.mocked(flushLogsSync).mockImplementation(() => {
      throw new Error('flush broken');
    });

    expect(() => server.closeCallback!()).toThrow('flush broken');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe('createGracefulShutdown — log sync on shutdown', () => {
  it('stops waiting for a hanging sync after 5 seconds and closes the server', async () => {
    const server = fakeServer();
    createGracefulShutdown(server, () => new Promise<void>(() => {}))('SIGTERM');

    await vi.advanceTimersByTimeAsync(4_999);
    expect(server.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it('logs a failed sync and still closes the server', async () => {
    const server = fakeServer();
    const err = new Error('R2 down');
    createGracefulShutdown(server, () => Promise.reject(err))('SIGTERM');

    await vi.advanceTimersByTimeAsync(0);

    expect(logger.error).toHaveBeenCalledWith({ err }, 'R2 log sync on shutdown failed');
    expect(server.close).toHaveBeenCalledTimes(1);
  });
});

describe('createGracefulShutdown — force exit after 10 seconds', () => {
  it('logs, flushes, then exits 1 — in that order — when the server never finishes closing', async () => {
    const order: string[] = [];
    vi.mocked(logger.error).mockImplementation(((msg: string) => void order.push(`error:${msg}`)) as never);
    vi.mocked(flushLogsSync).mockImplementation(() => void order.push('flush'));
    exitSpy.mockImplementation(((code: number) => void order.push(`exit:${code}`)) as never);
    createGracefulShutdown(fakeServer(), () => Promise.resolve())('SIGTERM');

    await vi.advanceTimersByTimeAsync(9_999);
    expect(order).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(order).toEqual(['error:Graceful shutdown timed out, forcing exit', 'flush', 'exit:1']);
  });

  it('still flushes and exits 1 when logging the timeout throws', () => {
    vi.mocked(logger.error).mockImplementation(() => {
      throw new Error('logger broken');
    });
    createGracefulShutdown(fakeServer(), () => new Promise<void>(() => {}))('SIGTERM');

    expect(() => vi.advanceTimersByTime(10_000)).toThrow('logger broken');
    expect(flushLogsSync).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('still exits 1 when flushing throws', () => {
    vi.mocked(flushLogsSync).mockImplementation(() => {
      throw new Error('flush broken');
    });
    createGracefulShutdown(fakeServer(), () => new Promise<void>(() => {}))('SIGTERM');

    expect(() => vi.advanceTimersByTime(10_000)).toThrow('flush broken');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('does not keep the process alive just for the force-exit timer', () => {
    const unrefSpy = vi.fn();
    const realSetTimeout = globalThis.setTimeout;
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms: number,
    ) => {
      const timer = realSetTimeout(fn, ms);
      if (ms === 10_000) timer.unref = unrefSpy as never;
      return timer;
    }) as never);
    try {
      createGracefulShutdown(fakeServer(), () => new Promise<void>(() => {}))('SIGTERM');
      expect(unrefSpy).toHaveBeenCalledTimes(1);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});
