import { Router } from 'express';
import { lineSignatureMiddleware } from '../middleware/line-signature.js';
import { logger } from '../utils/logger.js';
import type { WebhookEvent } from '@line/bot-sdk';
import { processEvents } from '../handlers/event-router.js';

export const webhookRouter = Router();

webhookRouter.post('/:botId', lineSignatureMiddleware, (req, res) => {
  res.status(200).json({ status: 'ok' });
  const events = req.body.events as WebhookEvent[];
  processEvents(events, (req.params['botId'] as string | undefined) ?? 'dobby').catch((err) =>
    logger.error({ err }, 'Error processing events')
  );
});
