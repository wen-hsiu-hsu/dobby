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
    return (obj: object, msg?: string) => {
      const reqId = getReqId();
      const purpose = getPurpose();
      const context = { ...(reqId && { reqId }), ...(purpose && { purpose }) };
      const merged = Object.keys(context).length > 0 ? { ...context, ...obj } : obj;
      return (method as Function).call(base, merged, msg);
    };
  },
});
