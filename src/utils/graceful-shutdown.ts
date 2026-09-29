import { flushLogsSync, logger } from './logger.js';

/** 整個關機流程的上限，逾時就強制 `process.exit(1)`。 */
const FORCE_EXIT_TIMEOUT_MS = 10_000;
/** 關機前那次 R2 log 同步的上限，逾時就不等它、直接往下關 server。 */
const SHUTDOWN_LOG_SYNC_TIMEOUT_MS = 5_000;

/** 只需要 `http.Server` 的 `close()`，測試可以傳假的 server。 */
export interface ClosableServer {
  close(callback: () => void): unknown;
}

/**
 * 記最後一行 log、flush 進檔案，再 `process.exit(code)`。
 *
 * 正式環境的檔案 stream 是非同步寫入，不 flush 直接 exit 會丟掉還在排隊的行
 * （含剛記的這一行，見 `flushLogsSync` 的註解）。記 log 或 flush 丟例外都照樣
 * flush／exit：關機路徑的最後一步不能卡住。
 */
function logFlushAndExit(log: () => void, code: number): void {
  try {
    log();
  } finally {
    try {
      flushLogsSync();
    } finally {
      process.exit(code);
    }
  }
}

/**
 * 建立 SIGTERM／SIGINT 的處理函式：先多同步一次 log（`syncLogs`，最多等 5 秒），
 * 再 `server.close()`，關完 `process.exit(0)`；整個流程超過 10 秒就 `process.exit(1)`。
 *
 * 從 `index.ts` 抽出來是為了能測試：`index.ts` 在 `NODE_ENV=test` 不會跑啟動流程。
 */
export function createGracefulShutdown(server: ClosableServer, syncLogs: () => Promise<void>): (signal: string) => void {
  let shuttingDown = false;
  return (signal) => {
    // 只跑一次：SIGTERM 之後又收到 SIGINT（例如手動 Ctrl+C）時，第二次的
    // server.close() 會因為 server 已經不在 listen 而立刻帶錯誤回呼，不等第一次
    // 的 close 完成就 exit(0)，切斷還在處理的請求。第一次的 10 秒強制結束仍然有效。
    if (shuttingDown) {
      logger.info({ signal }, 'Shutdown already in progress, ignoring signal');
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'Received shutdown signal, closing server');

    const forceExitTimer = setTimeout(() => {
      logFlushAndExit(() => logger.error('Graceful shutdown timed out, forcing exit'), 1);
    }, FORCE_EXIT_TIMEOUT_MS);
    forceExitTimer.unref();

    // 關閉前多同步一次 log——套獨立的短逾時，逾時或失敗都吞掉繼續往下走，
    // 不能卡住既有的 10 秒 forceExitTimer/server.close() 流程。
    const syncWithTimeout = Promise.race([
      syncLogs(),
      new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, SHUTDOWN_LOG_SYNC_TIMEOUT_MS)),
    ]);

    syncWithTimeout
      .catch((err: unknown) => {
        logger.error({ err }, 'R2 log sync on shutdown failed');
      })
      .finally(() => {
        server.close(() => {
          clearTimeout(forceExitTimer);
          logFlushAndExit(() => logger.info('Server closed, exiting'), 0);
        });
      });
  };
}
