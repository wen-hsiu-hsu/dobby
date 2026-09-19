import { middleware, MiddlewareConfig } from '@line/bot-sdk';
import { RequestHandler } from 'express';
import { env } from '../config/env.js';

export const lineSignatureMiddleware: RequestHandler = middleware({
  channelSecret: env.LINE_CHANNEL_SECRET,
} satisfies MiddlewareConfig);
