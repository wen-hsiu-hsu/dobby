import { Router } from 'express';
import { lineSignatureMiddleware } from '../middleware/line-signature.js';
import { logger } from '../utils/logger.js';
import type { WebhookEvent } from '@line/bot-sdk';
import { processEvents } from '../handlers/event-router.js';

export const webhookRouter = Router();

webhookRouter.post('/', lineSignatureMiddleware, (req, res) => {
  res.status(200).json({ status: 'ok' });
  const events = req.body.events as WebhookEvent[];
  logger.info({ eventCount: events.length }, 'Webhook received');
  logger.debug({ eventCount: events.length, events }, 'Webhook received detail');
  processEvents(events).catch((err) =>
    logger.error({ err }, 'Error processing events')
  );
});
