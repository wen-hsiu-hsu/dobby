import { describe, it, expect, vi, beforeEach } from 'vitest';

const { readdirMock, readFileMock } = vi.hoisted(() => ({
  readdirMock: vi.fn(),
  readFileMock: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readdir: readdirMock,
  readFile: readFileMock,
}));

const { loggerDebugMock, loggerInfoMock, loggerWarnMock, loggerErrorMock } = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: {
    debug: loggerDebugMock,
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  },
}));

// env 在模組載入時就被讀取（r2Enabled 是模組層級常數），所以用 vi.hoisted
// 準備一個可變的假 env 物件，讓每個 it 用 vi.resetModules() + 動態 import
// 重新載入 log-upload.ts 時吃到不同的設定。
const { envMock } = vi.hoisted(() => ({
  envMock: {
    NODE_ENV: 'test',
    R2_ACCOUNT_ID: undefined as string | undefined,
    R2_ACCESS_KEY_ID: undefined as string | undefined,
    R2_SECRET_ACCESS_KEY: undefined as string | undefined,
    R2_BUCKET_NAME: undefined as string | undefined,
    R2_LOG_PREFIX: undefined as string | undefined,
    R2_LOG_SYNC_INTERVAL_MINUTES: undefined as number | undefined,
  },
}));

vi.mock('../../config/env.js', () => ({ env: envMock }));

// S3Client／PutObjectCommand 在 log-upload.ts 裡都是用 `new` 建構的，不能用
// 箭頭函式當 mockImplementation（箭頭函式不能當建構子）——用真正的 class，
// 建構子內呼叫對應的 vi.fn()，讓測試可以斷言呼叫參數，或讓它丟例外模擬
// 「初始化本身失敗」。
const { sendMock, s3ClientCtorMock, putObjectCommandCtorMock, MockS3Client, MockPutObjectCommand } = vi.hoisted(() => {
  const sendMock = vi.fn();
  const s3ClientCtorMock = vi.fn();
  const putObjectCommandCtorMock = vi.fn();
  class MockPutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
      putObjectCommandCtorMock(input);
    }
  }
  class MockS3Client {
    send = sendMock;
    constructor(...args: unknown[]) {
      s3ClientCtorMock(...args);
    }
  }
  return { sendMock, s3ClientCtorMock, putObjectCommandCtorMock, MockS3Client, MockPutObjectCommand };
});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: MockS3Client,
  PutObjectCommand: MockPutObjectCommand,
}));

const LOG_DIR = '/fake/logs';

function setEnabledEnv(): void {
  envMock.R2_ACCOUNT_ID = 'acc-1';
  envMock.R2_ACCESS_KEY_ID = 'key-1';
  envMock.R2_SECRET_ACCESS_KEY = 'secret-1';
  envMock.R2_BUCKET_NAME = 'bucket-1';
}

function setDisabledEnv(): void {
  envMock.R2_ACCOUNT_ID = undefined;
  envMock.R2_ACCESS_KEY_ID = undefined;
  envMock.R2_SECRET_ACCESS_KEY = undefined;
  envMock.R2_BUCKET_NAME = undefined;
}

async function loadModule() {
  vi.resetModules();
  return import('../log-upload.js');
}

describe('log-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDisabledEnv();
    envMock.NODE_ENV = 'test';
    envMock.R2_LOG_PREFIX = undefined;
    envMock.R2_LOG_SYNC_INTERVAL_MINUTES = undefined;
    readdirMock.mockReset();
    readFileMock.mockReset();
    sendMock.mockReset();
  });

  it('skips entirely without creating an S3 client when R2 is not configured', async () => {
    const { uploadAllLogs, isR2Enabled } = await loadModule();
    expect(isR2Enabled()).toBe(false);

    await expect(uploadAllLogs(LOG_DIR)).resolves.toBeUndefined();

    expect(readdirMock).not.toHaveBeenCalled();
    expect(s3ClientCtorMock).not.toHaveBeenCalled();
  });

  it('uploads each .log file with the correct Bucket/Key (with prefix)/Body', async () => {
    setEnabledEnv();
    envMock.R2_LOG_PREFIX = 'myprefix';
    readdirMock.mockResolvedValue(['app.2026-01-01.log', 'app.2026-01-02.log', 'not-a-log.txt']);
    readFileMock.mockImplementation(async (path: string) => Buffer.from(`content of ${path}`));
    sendMock.mockResolvedValue({});

    const { uploadAllLogs, isR2Enabled } = await loadModule();
    expect(isR2Enabled()).toBe(true);

    await uploadAllLogs(LOG_DIR);

    expect(putObjectCommandCtorMock).toHaveBeenCalledTimes(2);
    expect(putObjectCommandCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'bucket-1',
        Key: 'logs/myprefix/app.2026-01-01.log',
        Body: Buffer.from(`content of ${LOG_DIR}/app.2026-01-01.log`),
      })
    );
    expect(putObjectCommandCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'bucket-1',
        Key: 'logs/myprefix/app.2026-01-02.log',
      })
    );
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('defaults the prefix to env.NODE_ENV when R2_LOG_PREFIX is unset', async () => {
    setEnabledEnv();
    envMock.NODE_ENV = 'production';
    readdirMock.mockResolvedValue(['app.2026-01-01.log']);
    readFileMock.mockResolvedValue(Buffer.from('x'));
    sendMock.mockResolvedValue({});

    const { uploadAllLogs } = await loadModule();
    await uploadAllLogs(LOG_DIR);

    expect(putObjectCommandCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({ Key: 'logs/production/app.2026-01-01.log' })
    );
  });

  it('isolates a single file failure so other files still upload, and the batch resolves', async () => {
    setEnabledEnv();
    readdirMock.mockResolvedValue(['app.2026-01-01.log', 'app.2026-01-02.log']);
    readFileMock.mockResolvedValue(Buffer.from('x'));
    sendMock.mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce({});

    const { uploadAllLogs } = await loadModule();

    await expect(uploadAllLogs(LOG_DIR)).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });

  it('catches an S3 client initialization failure without throwing', async () => {
    setEnabledEnv();
    readdirMock.mockResolvedValue(['app.2026-01-01.log']);
    s3ClientCtorMock.mockImplementationOnce(() => {
      throw new Error('bad credentials');
    });

    const { uploadAllLogs, getR2SyncStatus } = await loadModule();

    await expect(uploadAllLogs(LOG_DIR)).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();

    const status = getR2SyncStatus();
    expect(status.enabled).toBe(true);
    if (status.enabled) {
      expect(status.lastFailureAt).not.toBeNull();
      expect(status.lastFailureMessage).toContain('bad credentials');
    }
  });

  it('uses the same Key on repeated calls (idempotent, no "already uploaded" tracking needed)', async () => {
    setEnabledEnv();
    readdirMock.mockResolvedValue(['app.2026-01-01.log']);
    readFileMock.mockResolvedValue(Buffer.from('x'));
    sendMock.mockResolvedValue({});

    const { uploadAllLogs } = await loadModule();

    await uploadAllLogs(LOG_DIR);
    await uploadAllLogs(LOG_DIR);

    expect(sendMock).toHaveBeenCalledTimes(2);
    const keys = putObjectCommandCtorMock.mock.calls.map((call) => (call[0] as { Key: string }).Key);
    expect(keys[0]).toBe(keys[1]);
  });

  it('resolves without throwing when logDir does not exist (ENOENT)', async () => {
    setEnabledEnv();
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    readdirMock.mockRejectedValue(enoent);

    const { uploadAllLogs } = await loadModule();

    await expect(uploadAllLogs(LOG_DIR)).resolves.toBeUndefined();
    expect(s3ClientCtorMock).not.toHaveBeenCalled();
  });

  describe('getR2SyncStatus', () => {
    it('returns {enabled:false} when R2 is not configured', async () => {
      const { getR2SyncStatus } = await loadModule();
      expect(getR2SyncStatus()).toEqual({ enabled: false });
    });

    it('returns both timestamps as null before any run', async () => {
      setEnabledEnv();
      const { getR2SyncStatus } = await loadModule();
      expect(getR2SyncStatus()).toEqual({
        enabled: true,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastFailureMessage: null,
      });
    });

    it('updates lastSuccessAt after a fully successful batch', async () => {
      setEnabledEnv();
      readdirMock.mockResolvedValue(['app.2026-01-01.log']);
      readFileMock.mockResolvedValue(Buffer.from('x'));
      sendMock.mockResolvedValue({});

      const { uploadAllLogs, getR2SyncStatus } = await loadModule();
      await uploadAllLogs(LOG_DIR);

      const status = getR2SyncStatus();
      expect(status.enabled).toBe(true);
      if (status.enabled) {
        expect(status.lastSuccessAt).not.toBeNull();
        expect(status.lastFailureAt).toBeNull();
      }
    });

    it('updates lastFailureAt/lastFailureMessage on failure without clearing a prior lastSuccessAt', async () => {
      setEnabledEnv();
      readdirMock.mockResolvedValue(['app.2026-01-01.log']);
      readFileMock.mockResolvedValue(Buffer.from('x'));
      sendMock.mockResolvedValueOnce({}); // first run succeeds

      const { uploadAllLogs, getR2SyncStatus } = await loadModule();
      await uploadAllLogs(LOG_DIR);
      const afterSuccess = getR2SyncStatus();
      expect(afterSuccess.enabled).toBe(true);
      const successAt = afterSuccess.enabled ? afterSuccess.lastSuccessAt : null;
      expect(successAt).not.toBeNull();

      sendMock.mockRejectedValueOnce(new Error('boom')); // second run fails
      await uploadAllLogs(LOG_DIR);

      const afterFailure = getR2SyncStatus();
      expect(afterFailure.enabled).toBe(true);
      if (afterFailure.enabled) {
        expect(afterFailure.lastFailureAt).not.toBeNull();
        expect(afterFailure.lastFailureMessage).not.toBeNull();
        // 上一次成功的時間戳不會被這次失敗清掉。
        expect(afterFailure.lastSuccessAt).toBe(successAt);
      }
    });
  });
});
