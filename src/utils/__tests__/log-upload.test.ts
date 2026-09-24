import { describe, it, expect, vi, beforeEach } from 'vitest';

const { readdirMock, readFileMock, statMock } = vi.hoisted(() => ({
  readdirMock: vi.fn(),
  readFileMock: vi.fn(),
  statMock: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readdir: readdirMock,
  readFile: readFileMock,
  stat: statMock,
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
    statMock.mockReset();
    // 預設每個檔案 stat 都回傳固定值；需要模擬「檔案有變動」的測試自己覆寫。
    statMock.mockResolvedValue({ mtimeMs: 1000, size: 100 });
    sendMock.mockReset();
  });

  it('silently skips (no log, no readdir, no S3 client) when R2 is not configured', async () => {
    const { uploadAllLogs, isR2Enabled } = await loadModule();
    expect(isR2Enabled()).toBe(false);

    await expect(uploadAllLogs(LOG_DIR)).resolves.toBeUndefined();

    // graceful shutdown 會直接呼叫 uploadAllLogs，這裡一定要靜默，否則 /logs
    // 每次關機都會多一張背景作業卡片。
    expect(loggerDebugMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).not.toHaveBeenCalled();
    expect(readdirMock).not.toHaveBeenCalled();
    expect(s3ClientCtorMock).not.toHaveBeenCalled();
  });

  it('startLogUpload logs once and schedules nothing when R2 is not configured', async () => {
    vi.useFakeTimers();
    try {
      const { startLogUpload } = await loadModule();

      startLogUpload(LOG_DIR);

      expect(loggerDebugMock).toHaveBeenCalledTimes(1);
      expect(loggerDebugMock).toHaveBeenCalledWith('R2 not configured, log sync disabled');
      expect(vi.getTimerCount()).toBe(0);

      // 推過好幾個預設週期（15 分鐘），確認沒有任何同步被排程執行。
      await vi.advanceTimersByTimeAsync(5 * 15 * 60 * 1000);

      expect(loggerDebugMock).toHaveBeenCalledTimes(1);
      expect(loggerInfoMock).not.toHaveBeenCalled();
      expect(loggerErrorMock).not.toHaveBeenCalled();
      expect(readdirMock).not.toHaveBeenCalled();
      expect(s3ClientCtorMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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

    // 第二輪讓檔案有變動（mtime 不同），否則會被變動偵測跳過。
    statMock.mockResolvedValueOnce({ mtimeMs: 1000, size: 100 }).mockResolvedValueOnce({ mtimeMs: 2000, size: 100 });

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

      // 第二輪讓檔案有變動，才會真的嘗試上傳並失敗（沒變動會被跳過）。
      statMock.mockResolvedValue({ mtimeMs: 2000, size: 100 });
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

  describe('change detection (per-file mtime/size)', () => {
    const FILE_A = 'app.2026-01-01.log';
    const FILE_B = 'app.2026-01-02.log';

    function uploadedKeys(): string[] {
      return putObjectCommandCtorMock.mock.calls.map((call) => (call[0] as { Key: string }).Key);
    }

    beforeEach(() => {
      setEnabledEnv();
      readFileMock.mockResolvedValue(Buffer.from('x'));
      sendMock.mockResolvedValue({});
    });

    it('uploads everything on the first run, then 0 PUTs when nothing changed while still updating lastSuccessAt', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
        readdirMock.mockResolvedValue([FILE_A, FILE_B]);

        const { uploadAllLogs, getR2SyncStatus } = await loadModule();
        await uploadAllLogs(LOG_DIR);
        expect(sendMock).toHaveBeenCalledTimes(2);
        const first = getR2SyncStatus();
        const firstSuccessAt = first.enabled ? first.lastSuccessAt : null;
        expect(firstSuccessAt).not.toBeNull();

        vi.setSystemTime(new Date('2026-01-02T00:15:00Z'));
        sendMock.mockClear();
        await uploadAllLogs(LOG_DIR);

        expect(sendMock).not.toHaveBeenCalled();
        const second = getR2SyncStatus();
        expect(second.enabled).toBe(true);
        if (second.enabled) {
          // 沒有任何上傳也算成功，閒置時徽章時間不會停住。
          expect(second.lastSuccessAt).toBeGreaterThan(firstSuccessAt!);
          expect(second.lastFailureAt).toBeNull();
        }
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      ['mtime', { mtimeMs: 2000, size: 100 }],
      ['size', { mtimeMs: 1000, size: 200 }],
    ])('only re-uploads the file whose %s changed', async (_label, changedStat) => {
      readdirMock.mockResolvedValue([FILE_A, FILE_B]);

      const { uploadAllLogs } = await loadModule();
      await uploadAllLogs(LOG_DIR);
      expect(sendMock).toHaveBeenCalledTimes(2);

      statMock.mockImplementation(async (path: string) =>
        path.endsWith(FILE_B) ? changedStat : { mtimeMs: 1000, size: 100 }
      );
      putObjectCommandCtorMock.mockClear();
      sendMock.mockClear();
      await uploadAllLogs(LOG_DIR);

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(uploadedKeys()).toEqual([`logs/test/${FILE_B}`]);
    });

    it('retries a file on the next run after its upload failed (state not recorded on failure)', async () => {
      readdirMock.mockResolvedValue([FILE_A, FILE_B]);
      // FILE_A 成功、FILE_B 失敗。
      sendMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('network error'));

      const { uploadAllLogs, getR2SyncStatus } = await loadModule();
      await uploadAllLogs(LOG_DIR);
      const afterFailure = getR2SyncStatus();
      expect(afterFailure.enabled && afterFailure.lastFailureAt).not.toBeNull();

      putObjectCommandCtorMock.mockClear();
      sendMock.mockClear();
      sendMock.mockResolvedValue({});
      await uploadAllLogs(LOG_DIR);

      // stat 值都沒變，但 FILE_B 上次失敗沒有記錄，所以只重傳它。
      expect(uploadedKeys()).toEqual([`logs/test/${FILE_B}`]);
    });

    it('records the stat taken BEFORE upload, so a write during read/upload is re-uploaded next run', async () => {
      // 守住「記錄的是上傳前 stat 的值」這個不變式。如果實作改成上傳後再 stat
      // 一次、記錄新的值，就會漏傳：readFile 讀到 c1，上傳途中 pino 又補寫一行，
      // 上傳後 stat 變成 (m2, s2) 並被記下，R2 上卻只有 c1；下一輪 stat 仍是
      // (m2, s2)，檔案被判定沒變動而跳過，補寫的那行在重啟前永遠傳不上去。
      readdirMock.mockResolvedValue([FILE_A]);
      let currentStat = { mtimeMs: 1000, size: 100 };
      statMock.mockImplementation(async () => currentStat);
      // 讀檔拿到 c1 之後，檔案馬上被補寫（模擬讀取／上傳過程中 pino 寫入）。
      readFileMock.mockImplementation(async () => {
        const body = Buffer.from('c1');
        currentStat = { mtimeMs: 2000, size: 150 };
        return body;
      });

      const { uploadAllLogs } = await loadModule();
      await uploadAllLogs(LOG_DIR);
      expect(sendMock).toHaveBeenCalledTimes(1);

      // 下一輪 stat 是 (m2, s2)，跟記錄的 (m1, s1) 不同，必須重傳。
      readFileMock.mockResolvedValue(Buffer.from('c2'));
      putObjectCommandCtorMock.mockClear();
      sendMock.mockClear();
      await uploadAllLogs(LOG_DIR);

      expect(uploadedKeys()).toEqual([`logs/test/${FILE_A}`]);
      expect(putObjectCommandCtorMock).toHaveBeenCalledWith(expect.objectContaining({ Body: Buffer.from('c2') }));
    });

    it('treats a stat failure like an upload failure: warn, count as failed, continue with other files', async () => {
      readdirMock.mockResolvedValue([FILE_A, FILE_B]);
      statMock.mockImplementation(async (path: string) => {
        if (path.endsWith(FILE_A)) throw new Error('EACCES');
        return { mtimeMs: 1000, size: 100 };
      });

      const { uploadAllLogs, getR2SyncStatus } = await loadModule();
      await expect(uploadAllLogs(LOG_DIR)).resolves.toBeUndefined();

      expect(uploadedKeys()).toEqual([`logs/test/${FILE_B}`]);
      expect(loggerWarnMock).toHaveBeenCalledWith(
        expect.objectContaining({ file: FILE_A }),
        'Failed to upload log file to R2, skipping'
      );
      const status = getR2SyncStatus();
      if (status.enabled) {
        expect(status.lastFailureMessage).toBe('1/2 個檔案上傳失敗');
      }
    });

    it('drops files that disappeared from the directory, so the same name reappearing is uploaded again', async () => {
      readdirMock.mockResolvedValue([FILE_A, FILE_B]);

      const { uploadAllLogs } = await loadModule();
      await uploadAllLogs(LOG_DIR);
      expect(sendMock).toHaveBeenCalledTimes(2);

      // FILE_A 被 log-cleanup 刪掉。
      readdirMock.mockResolvedValue([FILE_B]);
      putObjectCommandCtorMock.mockClear();
      sendMock.mockClear();
      await uploadAllLogs(LOG_DIR);
      expect(sendMock).not.toHaveBeenCalled();

      // 同名檔案再出現，stat 值跟以前完全一樣，仍然要重新上傳。
      readdirMock.mockResolvedValue([FILE_A, FILE_B]);
      await uploadAllLogs(LOG_DIR);
      expect(uploadedKeys()).toEqual([`logs/test/${FILE_A}`]);
    });

    it('re-uploads everything after the module is reloaded (simulated restart, in-memory state lost)', async () => {
      readdirMock.mockResolvedValue([FILE_A, FILE_B]);

      const first = await loadModule();
      await first.uploadAllLogs(LOG_DIR);
      await first.uploadAllLogs(LOG_DIR);
      expect(sendMock).toHaveBeenCalledTimes(2); // 第二輪全部跳過

      sendMock.mockClear();
      const restarted = await loadModule();
      await restarted.uploadAllLogs(LOG_DIR);
      expect(sendMock).toHaveBeenCalledTimes(2);
    });

    it('logs the completion message at debug level (not info) with a skipped count', async () => {
      readdirMock.mockResolvedValue([FILE_A, FILE_B]);

      const { uploadAllLogs } = await loadModule();
      await uploadAllLogs(LOG_DIR);
      statMock.mockImplementation(async (path: string) =>
        path.endsWith(FILE_B) ? { mtimeMs: 2000, size: 100 } : { mtimeMs: 1000, size: 100 }
      );
      await uploadAllLogs(LOG_DIR);

      expect(loggerInfoMock).not.toHaveBeenCalledWith(expect.anything(), 'R2 log sync complete');
      expect(loggerDebugMock).toHaveBeenLastCalledWith(
        { succeeded: 1, skipped: 1, failed: 0, total: 2 },
        'R2 log sync complete'
      );
    });
  });

  describe('startLogUpload (R2 configured)', () => {
    const MINUTE_MS = 60 * 1000;

    beforeEach(() => {
      setEnabledEnv();
      readdirMock.mockResolvedValue(['app.2026-01-01.log']);
      readFileMock.mockResolvedValue(Buffer.from('x'));
      sendMock.mockResolvedValue({});
    });

    // setInterval 在正式程式碼裡永遠不會被清掉，每個測試結束都要清掉 fake
    // timers 再還原 real timers，避免排程殘留影響後面的測試。
    async function withFakeTimers(fn: () => Promise<void>): Promise<void> {
      vi.useFakeTimers();
      try {
        await fn();
      } finally {
        vi.clearAllTimers();
        vi.useRealTimers();
      }
    }

    it('runs the first sync immediately and does not log the "not configured" line', async () => {
      await withFakeTimers(async () => {
        const { startLogUpload } = await loadModule();

        startLogUpload(LOG_DIR);
        // 讓第一次同步的 promise 鏈跑完（不推進時間）。
        await vi.advanceTimersByTimeAsync(0);

        expect(readdirMock).toHaveBeenCalledTimes(1);
        expect(sendMock).toHaveBeenCalledTimes(1);
        // 防止有人把「未設定」的提示搬到判斷式外面，啟用時也冒出這行。
        expect(loggerDebugMock).not.toHaveBeenCalledWith('R2 not configured, log sync disabled');
        expect(loggerErrorMock).not.toHaveBeenCalled();
      });
    });

    it('schedules repeated syncs at R2_LOG_SYNC_INTERVAL_MINUTES', async () => {
      envMock.R2_LOG_SYNC_INTERVAL_MINUTES = 5;
      await withFakeTimers(async () => {
        const { startLogUpload } = await loadModule();

        startLogUpload(LOG_DIR);
        await vi.advanceTimersByTimeAsync(0);
        expect(readdirMock).toHaveBeenCalledTimes(1);

        // 間隔前一刻還不會跑。
        await vi.advanceTimersByTimeAsync(5 * MINUTE_MS - 1);
        expect(readdirMock).toHaveBeenCalledTimes(1);

        // 推過間隔，跑第二次。
        await vi.advanceTimersByTimeAsync(1);
        expect(readdirMock).toHaveBeenCalledTimes(2);

        // 再推一個間隔，跑第三次（是 setInterval 而不是只跑一次的 setTimeout）。
        await vi.advanceTimersByTimeAsync(5 * MINUTE_MS);
        expect(readdirMock).toHaveBeenCalledTimes(3);
      });
    });

    it('defaults to a 15-minute interval when R2_LOG_SYNC_INTERVAL_MINUTES is unset', async () => {
      await withFakeTimers(async () => {
        const { startLogUpload } = await loadModule();

        startLogUpload(LOG_DIR);
        await vi.advanceTimersByTimeAsync(0);
        expect(readdirMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(15 * MINUTE_MS - 1);
        expect(readdirMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(readdirMock).toHaveBeenCalledTimes(2);
      });
    });

    it('catches a rejected sync run with logger.error instead of an unhandled rejection', async () => {
      // doUploadAllLogs 內部幾乎每一步都有 try/catch，能讓整輪 reject 的路徑
      // 是最後那行 logger.debug 本身丟例外（例如 logger transport 壞掉）。
      const boom = new Error('logger exploded');
      loggerDebugMock.mockImplementation((_obj: unknown, msg?: string) => {
        if (msg === 'R2 log sync complete') throw boom;
      });
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on('unhandledRejection', onUnhandled);

      try {
        await withFakeTimers(async () => {
          const { startLogUpload } = await loadModule();

          startLogUpload(LOG_DIR);
          await vi.advanceTimersByTimeAsync(0);
          expect(loggerErrorMock).toHaveBeenCalledTimes(1);
          expect(loggerErrorMock).toHaveBeenLastCalledWith({ err: boom }, 'R2 log sync run failed');

          // 排程觸發的那一輪也要被接住（檔案沒變動會跳過上傳，但最後那行
          // debug 不論有沒有上傳都會呼叫，所以一樣會 reject）。
          await vi.advanceTimersByTimeAsync(15 * MINUTE_MS);
          expect(loggerErrorMock).toHaveBeenCalledTimes(2);
          expect(loggerErrorMock).toHaveBeenLastCalledWith({ err: boom }, 'R2 log sync run failed');
        });
        // unhandledRejection 事件在 microtask 之後的 tick 才發出，多等一輪 macrotask。
        await new Promise((resolve) => setImmediate(resolve));
        expect(unhandled).toEqual([]);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });
  });

  describe('request context of startLogUpload / uploadAllLogs logs', () => {
    // log-upload.ts 用的是真的 request-context（這個檔案沒有 mock 它）。因為
    // loadModule() 會 vi.resetModules()，必須在 loadModule() 之後再動態 import
    // request-context，才會拿到跟 log-upload.ts 同一份 AsyncLocalStorage。
    async function loadWithReqIdCapture() {
      const mod = await loadModule();
      const { getReqId } = await import('../request-context.js');
      const reqIdByMessage = new Map<string, string | undefined>();
      loggerDebugMock.mockImplementation((...args: unknown[]) => {
        const msg = args.find((a): a is string => typeof a === 'string');
        if (msg) reqIdByMessage.set(msg, getReqId());
      });
      return { ...mod, reqIdByMessage };
    }

    it('logs "R2 not configured" outside runWithContext (no reqId), so /logs shows it as a system event', async () => {
      vi.useFakeTimers();
      try {
        const { startLogUpload, reqIdByMessage } = await loadWithReqIdCapture();

        startLogUpload(LOG_DIR);

        expect(reqIdByMessage.has('R2 not configured, log sync disabled')).toBe(true);
        // 如果這行被包進 runWithContext，就會拿到 reqId，/logs 會把它從「系統」
        // 事件變成一張「背景作業」卡片。
        expect(reqIdByMessage.get('R2 not configured, log sync disabled')).toBeUndefined();
      } finally {
        vi.clearAllTimers();
        vi.useRealTimers();
      }
    });

    it('control: logs inside uploadAllLogs DO see a reqId (proves the capture technique works)', async () => {
      setEnabledEnv();
      readdirMock.mockResolvedValue(['app.2026-01-01.log']);
      readFileMock.mockResolvedValue(Buffer.from('x'));
      sendMock.mockResolvedValue({});

      const { uploadAllLogs, reqIdByMessage } = await loadWithReqIdCapture();
      await uploadAllLogs(LOG_DIR);

      expect(reqIdByMessage.has('R2 log sync complete')).toBe(true);
      expect(reqIdByMessage.get('R2 log sync complete')).toMatch(/^[0-9a-f]{6}$/);
    });
  });
});
