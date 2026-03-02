import pino from 'pino';
import { getReqId } from './request-context.js';

const isDev = process.env['NODE_ENV'] !== 'production';

const base = pino({
  level: isDev ? 'debug' : 'info',
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

export const logger = new Proxy(base, {
  get(target, prop) {
    const method = target[prop as keyof typeof target];
    if (prop === 'child' || typeof method !== 'function') return method;
    return (obj: object, msg?: string) => {
      const reqId = getReqId();
      const merged = reqId ? { reqId, ...obj } : obj;
      return (method as Function).call(target, merged, msg);
    };
  },
});
