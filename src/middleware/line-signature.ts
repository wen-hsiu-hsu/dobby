import { middleware, MiddlewareConfig } from '@line/bot-sdk';
import { RequestHandler, Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

function getSecret(botId: string): string {
  if (botId === 'batting') return env.LINE_CHANNEL_SECRET_BATTING;
  return env.LINE_CHANNEL_SECRET_DOBBY;
}

export function lineSignatureMiddleware(req: Request, res: Response, next: NextFunction): void {
  const botId = (req.params['botId'] as string | undefined) ?? 'dobby';
  const secret = getSecret(botId);

  const config: MiddlewareConfig = { channelSecret: secret };
  const mw: RequestHandler = middleware(config);
  mw(req, res, next);
}
