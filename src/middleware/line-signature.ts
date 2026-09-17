import { middleware, MiddlewareConfig } from '@line/bot-sdk';
import { RequestHandler, Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { BOT_IDS, type BotId } from '../config/constants.js';

const middlewareByBotId: Record<BotId, RequestHandler> = {
  [BOT_IDS.DOBBY]: middleware({ channelSecret: env.LINE_CHANNEL_SECRET_DOBBY } satisfies MiddlewareConfig),
  [BOT_IDS.BATTING]: middleware({ channelSecret: env.LINE_CHANNEL_SECRET_BATTING } satisfies MiddlewareConfig),
};

function isBotId(value: string | undefined): value is BotId {
  return value === BOT_IDS.DOBBY || value === BOT_IDS.BATTING;
}

export function lineSignatureMiddleware(req: Request, res: Response, next: NextFunction): void {
  const botId = req.params['botId'] as string | undefined;
  if (!isBotId(botId)) {
    res.status(404).end();
    return;
  }
  middlewareByBotId[botId](req, res, next);
}
