import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { runWithContext } from './request-context.js';

const DEFAULT_SYNC_INTERVAL_MINUTES = 15;

export function isR2Enabled(): boolean {
  return !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME);
}

export type R2SyncStatus =
  | { enabled: false }
  | { enabled: true; lastSuccessAt: number | null; lastFailureAt: number | null; lastFailureMessage: string | null };

// 模組層級狀態，模式比照 logger.ts 的 getLogLevel()——enabled 在模組載入時
// 算一次；lastSuccessAt/lastFailureAt 互不清空，讓 /logs 徽章可以靠比較兩
// 個時間戳的新舊判斷「目前」狀態，而不是只看「上一次跑的結果」。
const r2Enabled = isR2Enabled();
let lastSuccessAt: number | null = null;
let lastFailureAt: number | null = null;
let lastFailureMessage: string | null = null;

export function getR2SyncStatus(): R2SyncStatus {
  if (!r2Enabled) return { enabled: false };
  return { enabled: true, lastSuccessAt, lastFailureAt, lastFailureMessage };
}

// 每個檔案「上次成功上傳時」的 mtimeMs/size，用來跳過沒變動的檔案（已輪替
// 完成的舊檔內容不會再變，沒必要每 15 分鐘重傳）。
//
// 刻意只存在記憶體：重啟後這個 Map 是空的，第一輪會把所有檔案全部重傳，
// 行為跟改動前的「全目錄重傳」完全一樣。狀態遺失時退回的是安全的全量重傳，
// 而上傳本身是對同一個 key 覆寫、天生冪等，所以不需要把這份狀態持久化，
// 也不會因為狀態遺失而漏傳。這只涵蓋本機這一側的狀態遺失；R2 物件被外部
// 刪除時，重啟前不會補傳，是刻意接受的取捨。見 ADR 0006 的「以檔案為單位
// 的變動偵測」段落。
//
// 記錄的是「上傳前」stat 拿到的值，而且只在上傳成功後才寫入：上傳失敗就不
// 更新，下一輪比對時仍然會被判定為有變動而自然重試。如果 stat 之後、讀檔
// 之前檔案又被寫入，實際上傳的內容比記錄的新，下一輪 stat 值不同，只是多
// 傳一次，不會漏。
const uploadedFileStates = new Map<string, { mtimeMs: number; size: number }>();

function recordSuccess(): void {
  lastSuccessAt = Date.now();
}

function recordFailure(message: string): void {
  lastFailureAt = Date.now();
  lastFailureMessage = message;
}

function buildS3Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

async function uploadOneFile(client: S3Client, logDir: string, file: string, prefix: string): Promise<void> {
  const filePath = join(logDir, file);
  const body = await readFile(filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME!,
      Key: `logs/${prefix}/${file}`,
      Body: body,
    })
  );
}

/**
 * 全目錄週期性同步——不管檔案是否輪替完成，每次都掃 logDir 底下所有 .log
 * 檔案，把 mtime/size 跟上次成功上傳時不同的檔案重新 PUT 一次（沒變動的跳過，
 * 見 uploadedFileStates）。這個決定（而不是只傳新完成的檔案）解決 ephemeral
 * 檔案系統重啟當下遺失當天進行中檔案的風險，同時讓邏輯天生冪等：變動偵測
 * 的狀態只在記憶體，遺失時退回全量重傳，見
 * docs/adr/0006-log-r2-sync-is-periodic-full-directory-not-rotation-hook.md。
 */
export async function uploadAllLogs(logDir: string): Promise<void> {
  return runWithContext(() => doUploadAllLogs(logDir));
}

async function doUploadAllLogs(logDir: string): Promise<void> {
  // 靜默 return：沒設定 R2 的提示只在 startLogUpload() 啟動時記一次；這裡
  // 還會被 graceful shutdown 直接呼叫，寫 log 會在 /logs 多冒出一張背景作業卡片。
  if (!r2Enabled) return;

  let files: string[];
  try {
    files = await readdir(logDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return; // logs/ doesn't exist yet
    recordFailure(err instanceof Error ? err.message : String(err));
    logger.error({ err }, 'R2 log sync failed: could not read log directory');
    return;
  }

  const logFiles = files.filter((file) => file.endsWith('.log'));

  let client: S3Client;
  try {
    client = buildS3Client();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordFailure(message);
    logger.error({ err }, 'R2 log sync failed: could not initialize S3 client');
    return;
  }

  // 已經不在目錄裡的檔名（被 log-cleanup 刪掉的）從 Map 移除，避免 Map 無限
  // 長大；之後如果同名檔案又出現，會被當成新檔案重新上傳。
  const currentFiles = new Set(logFiles);
  for (const file of uploadedFileStates.keys()) {
    if (!currentFiles.has(file)) uploadedFileStates.delete(file);
  }

  const prefix = env.R2_LOG_PREFIX || env.NODE_ENV;
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;
  for (const file of logFiles) {
    try {
      const { mtimeMs, size } = await stat(join(logDir, file));
      const previous = uploadedFileStates.get(file);
      if (previous && previous.mtimeMs === mtimeMs && previous.size === size) {
        skipped++;
        continue;
      }
      await uploadOneFile(client, logDir, file, prefix);
      uploadedFileStates.set(file, { mtimeMs, size });
      succeeded++;
    } catch (err) {
      // 單檔失敗（stat 或上傳）不影響其他檔案繼續上傳，比照 display-name-update.ts
      // 的做法；Map 不更新，下一輪會重試這個檔案。
      logger.warn({ err, file }, 'Failed to upload log file to R2, skipping');
      failed++;
    }
  }

  // 整輪沒有失敗就算成功——包括全部檔案都沒變動、一個都沒上傳的情況，
  // 否則閒置時 /logs 徽章的「成功」時間會停在最後一次有新 log 的時候。
  if (failed > 0) {
    recordFailure(`${failed}/${logFiles.length} 個檔案上傳失敗`);
  } else {
    recordSuccess();
  }

  // 這行必須維持 debug，不要改回 info，原因有兩個：
  // (a) 正式環境 LOG_LEVEL=info，info 會寫進今天的 log 檔，下一輪今天的檔案
  //     mtime/size 一定變了，變動偵測等於自己觸發自己、永遠有效不了。
  // (b) 這裡在 runWithContext 裡（有 reqId），info 會讓正式環境的 /logs 每
  //     15 分鐘冒出一張背景作業卡片，違反 ADR 0006 徽章段落的意圖。
  // 正式環境如果設 LOG_LEVEL=debug，這行仍會寫進檔案，今天的檔案每輪都會
  // 重傳一次，/logs 也會每 15 分鐘再冒出一張背景作業卡片；debug 本來就是
  // 除錯用的，這是預期中、可以接受的代價。（開發環境 initLogger() 不寫 log
  // 檔，不受影響。）
  logger.debug({ succeeded, skipped, failed, total: logFiles.length }, 'R2 log sync complete');
}

export function startLogUpload(logDir: string): void {
  // r2Enabled 在模組載入時就算好、執行期間不會變，沒設定時每次檢查結果都
  // 一樣，所以直接不排程。這行刻意寫在 runWithContext 外面（沒有 reqId），
  // /logs 會把它歸成單一筆「系統」事件，而不是每 15 分鐘一張背景作業卡片。
  if (!r2Enabled) {
    logger.debug('R2 not configured, log sync disabled');
    return;
  }

  uploadAllLogs(logDir).catch((err: unknown) => {
    logger.error({ err }, 'R2 log sync run failed');
  });

  const intervalMinutes = env.R2_LOG_SYNC_INTERVAL_MINUTES ?? DEFAULT_SYNC_INTERVAL_MINUTES;
  const INTERVAL_MS = intervalMinutes * 60 * 1000;
  setInterval(() => {
    uploadAllLogs(logDir).catch((err: unknown) => {
      logger.error({ err }, 'R2 log sync run failed');
    });
  }, INTERVAL_MS);
}
