import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { readdirMock, unlinkMock } = vi.hoisted(() => ({
  readdirMock: vi.fn(),
  unlinkMock: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readdir: readdirMock,
  unlink: unlinkMock,
}));

const { loggerWarnMock, loggerInfoMock, loggerErrorMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: {
    warn: loggerWarnMock,
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
}));

import { cleanOldLogs } from '../log-cleanup.js';

const LOG_DIR = '/fake/logs';

describe('cleanOldLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not throw when unlink fails, logs a warning, and still processes remaining files', async () => {
    const oldDate = '2000-01-01';
    readdirMock.mockResolvedValue([
      `app.${oldDate}.log`,
      `app2.${oldDate}.log`,
    ]);
    unlinkMock
      .mockRejectedValueOnce(new Error('EACCES: permission denied'))
      .mockResolvedValueOnce(undefined);

    await expect(cleanOldLogs(LOG_DIR)).resolves.toBeUndefined();

    expect(unlinkMock).toHaveBeenCalledTimes(2);
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ file: `app.${oldDate}.log` }),
      'Failed to delete old log file'
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      { file: `app2.${oldDate}.log` },
      'Deleted old log file'
    );
  });

  it('skips files newer than the retention cutoff', async () => {
    const todayFile = `app.${new Date().toISOString().slice(0, 10)}.log`;
    readdirMock.mockResolvedValue([todayFile]);

    await cleanOldLogs(LOG_DIR);

    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it('returns without throwing when the log directory does not exist', async () => {
    readdirMock.mockRejectedValue(new Error('ENOENT'));

    await expect(cleanOldLogs(LOG_DIR)).resolves.toBeUndefined();
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  describe('UTC-anchored retention cutoff', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('keeps a file exactly at the 7-day boundary and deletes one a day past it, based on UTC calendar dates', async () => {
      // "Now" is deliberately set to 20:00 UTC — a time-of-day at which the
      // old local-time cutoff (setDate/setHours, which would reflect
      // Asia/Taipei's UTC+8 calendar date of the *next* day at this hour)
      // would compute a cutoff up to ~16h later than the correct UTC-based
      // one, causing it to wrongly delete the boundary file below.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-08T20:00:00.000Z'));

      readdirMock.mockResolvedValue([
        'app.2026-01-01.log', // exactly 7 days before 2026-01-08 (UTC) — must survive
        'app.2025-12-31.log', // 8 days before — must be deleted
      ]);

      await cleanOldLogs(LOG_DIR);

      expect(unlinkMock).toHaveBeenCalledTimes(1);
      expect(unlinkMock).toHaveBeenCalledWith(expect.stringContaining('app.2025-12-31.log'));
      expect(unlinkMock).not.toHaveBeenCalledWith(expect.stringContaining('app.2026-01-01.log'));
    });

    it('never reads local-timezone-dependent Date fields, so the result cannot depend on server TZ', async () => {
      const localGetters = ['getDate', 'getFullYear', 'getMonth', 'getHours'] as const;
      const localSetters = ['setDate', 'setHours'] as const;
      const spies = [...localGetters, ...localSetters].map((name) =>
        vi.spyOn(Date.prototype, name)
      );

      readdirMock.mockResolvedValue(['app.2026-01-01.log']);
      await cleanOldLogs(LOG_DIR);

      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
      }
    });
  });
});
