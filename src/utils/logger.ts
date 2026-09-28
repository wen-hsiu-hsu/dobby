import pino from 'pino';
import { join } from 'node:path';
import { getReqId, getPurpose } from './request-context.js';
import { env } from '../config/env.js';

const isDev = env.NODE_ENV !== 'production';

let base: pino.Logger = pino({
  level: isDev ? 'debug' : env.LOG_LEVEL,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
});

/** 目前實際生效的 log 等級——`isDev` 為 true 時建構 `base` 傳的是寫死的 'debug'，不是 `env.LOG_LEVEL`，所以這個 getter 天生反映「實際生效」而非「設定值」。 */
export function getLogLevel(): string {
  return base.level;
}

export async function initLogger(logDir: string): Promise<void> {
  if (isDev) return;

  try {
    const build = await import('pino-roll');
    const fileStream = await build.default({
      file: join(logDir, 'app'),
      frequency: 'daily',
      dateFormat: 'yyyy-MM-dd',
      mkdir: true,
    });

    base = pino(
      { level: env.LOG_LEVEL },
      pino.multistream([
        { stream: process.stdout, level: env.LOG_LEVEL },
        { stream: fileStream, level: env.LOG_LEVEL },
      ])
    );
  } catch (err) {
    base.error({ err }, 'Failed to initialize log file stream, logging to stdout only');
  }
}

/**
 * 在 `process.exit()` 前呼叫，把還排在記憶體裡、沒寫進 log 檔的行同步寫完。
 *
 * 正式環境的檔案 stream 是 pino-roll 建的 SonicBoom，沒指定 `sync`，是非同步寫入：
 * 第一行直接送出 `fs.write`，同時間後面的行都排在記憶體 buffer 裡，直接 exit
 * 就會丟掉。`flushSync()` 把 buffer 用 `fs.writeSync` 寫完（multistream 會轉給每個
 * 有 `flushSync` 的子 stream）。已經送出的那筆 `fs.write` 不歸它管，而是由 libuv
 * 在 process 結束時把 threadpool 裡排好的工作做完。2026-09-28 用同一組 pino-roll
 * ＋multistream 設定實測（本機 macOS、Node 24，不是 Pi 的 Node 22 alpine）：不 flush
 * 直接 exit，前面有排隊的話最後那行 0/20 寫進檔案；flush 後 20/20；只有一行、
 * 正在 fs.write 中就 exit 也是 20/20。
 *
 * pino 的 `fatal()` 本身記完也會呼叫一次 stream 的 `flushSync()`，這裡另外提供
 * 是為了不依賴 log 等級：之後改用其他等級記錄，exit 前一樣要 flush。
 * 絕不丟例外——這是 crash 路徑的最後一步，flush 失敗也要讓呼叫端接著 exit。
 */
export function flushLogsSync(): void {
  try {
    const stream = (base as unknown as Record<symbol, { flushSync?: () => void } | undefined>)[pino.symbols.streamSym];
    stream?.flushSync?.();
  } catch {
    // stream 還沒開好（SonicBoom 'sonic boom is not ready yet'）或已經關閉，沒得救
  }
}

export const logger = new Proxy({} as pino.Logger, {
  get(_target, prop) {
    const method = base[prop as keyof typeof base];
    if (prop === 'child' || typeof method !== 'function') return method;
    return (arg1: object | string, arg2?: string) => {
      const reqId = getReqId();
      const purpose = getPurpose();
      const context = { ...(reqId && { reqId }), ...(purpose && { purpose }) };
      // pino accepts either (msg) or (mergingObject, msg) — a plain string
      // first arg (e.g. logger.info('Server closed')) must stay a message,
      // not get spread as if it were the merging object (which would turn
      // its characters into numeric keys).
      if (typeof arg1 === 'string') {
        return Object.keys(context).length > 0
          ? (method as Function).call(base, context, arg1)
          : (method as Function).call(base, arg1);
      }
      const merged = Object.keys(context).length > 0 ? { ...context, ...arg1 } : arg1;
      return (method as Function).call(base, merged, arg2);
    };
  },
});
