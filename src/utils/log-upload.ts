import { readdir, readFile } from 'node:fs/promises';
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
 * 全目錄週期性重傳——不管檔案是否輪替完成，每次都把 logDir 底下所有 .log
 * 檔案重新 PUT 一次。這個決定（而不是只傳新完成的檔案）解決 ephemeral 檔
 * 案系統重啟當下遺失當天進行中檔案的風險，同時讓邏輯天生冪等，不用維護
 * 已上傳清單，見 docs/adr/0006-log-r2-sync-is-periodic-full-directory-not-rotation-hook.md。
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

  const prefix = env.R2_LOG_PREFIX || env.NODE_ENV;
  let succeeded = 0;
  let failed = 0;
  for (const file of logFiles) {
    try {
      await uploadOneFile(client, logDir, file, prefix);
      succeeded++;
    } catch (err) {
      // 單檔失敗不影響其他檔案繼續上傳，比照 display-name-update.ts 的做法。
      logger.warn({ err, file }, 'Failed to upload log file to R2, skipping');
      failed++;
    }
  }

  if (failed > 0) {
    recordFailure(`${failed}/${logFiles.length} 個檔案上傳失敗`);
  } else {
    recordSuccess();
  }

  logger.info({ succeeded, failed, total: logFiles.length }, 'R2 log sync complete');
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
