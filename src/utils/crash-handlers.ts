import { flushLogsSync, logger } from './logger.js';

/**
 * 記一行 fatal、把 log flush 進檔案，再 `process.exit(1)`。
 *
 * 用在 process 已經處於不確定狀態的地方（未捕捉的例外、未處理的 rejection、
 * 啟動失敗）：註冊了 `uncaughtException`／`unhandledRejection` handler 之後，Node
 * 就不會自動結束 process，一定要自己 exit，否則會帶著壞掉的狀態繼續跑。
 * exit 放在 finally：記 log 或 flush 本身出錯也要結束。
 */
export function logFatalAndExit(err: unknown, msg: string): void {
  try {
    logger.fatal({ err }, msg);
    flushLogsSync();
  } finally {
    process.exit(1);
  }
}

/**
 * 沒有這兩個 handler 時，crash 的 stack 只會由 Node 印到 stderr，也就是只在
 * docker 的 json-file log 裡，`logs/` 與 `/logs` 都看不到。
 */
export function registerCrashHandlers(): void {
  process.on('uncaughtException', (err) => logFatalAndExit(err, 'Uncaught exception, exiting'));
  process.on('unhandledRejection', (reason) => logFatalAndExit(reason, 'Unhandled promise rejection, exiting'));
}
