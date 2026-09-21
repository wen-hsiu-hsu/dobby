import pino from 'pino';
import { join } from 'node:path';
import { getReqId, getPurpose } from './request-context.js';
import { env } from '../config/env.js';

const isDev = process.env['NODE_ENV'] !== 'production';

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
