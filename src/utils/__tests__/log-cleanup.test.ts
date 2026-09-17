import { describe, it, expect, vi, beforeEach } from 'vitest';

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
});
