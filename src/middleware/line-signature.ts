import { middleware, MiddlewareConfig } from '@line/bot-sdk';
import { RequestHandler, Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

const middlewareByBotId: Record<string, RequestHandler> = {
  dobby: middleware({ channelSecret: env.LINE_CHANNEL_SECRET_DOBBY } satisfies MiddlewareConfig),
  batting: middleware({ channelSecret: env.LINE_CHANNEL_SECRET_BATTING } satisfies MiddlewareConfig),
};

export function lineSignatureMiddleware(req: Request, res: Response, next: NextFunction): void {
  const botId = (req.params['botId'] as string | undefined) ?? 'dobby';
  const mw = middlewareByBotId[botId] ?? middlewareByBotId['dobby']!;
  mw(req, res, next);
}
