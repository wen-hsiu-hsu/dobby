import { Router } from 'express';
import { lineSignatureMiddleware } from '../middleware/line-signature.js';
import { logger } from '../utils/logger.js';
import type { WebhookEvent } from '@line/bot-sdk';
import { processEvents } from '../handlers/event-router.js';

export const webhookRouter = Router();

webhookRouter.post('/:botId', lineSignatureMiddleware, (req, res) => {
  res.status(200).json({ status: 'ok' });
  const botId = (req.params['botId'] as string | undefined) ?? 'dobby';
  const events = req.body.events as WebhookEvent[];
  logger.info({ botId, eventCount: events.length }, 'Webhook received');
  processEvents(events, botId).catch((err) =>
    logger.error({ err }, 'Error processing events')
  );
});
