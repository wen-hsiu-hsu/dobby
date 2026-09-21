import { Router } from 'express';
import { lineSignatureMiddleware } from '../middleware/line-signature.js';
import { logger } from '../utils/logger.js';
import type { WebhookEvent } from '@line/bot-sdk';
import { processEvents } from '../handlers/event-router.js';

export const webhookRouter = Router();

webhookRouter.post('/', lineSignatureMiddleware, (req, res) => {
  res.status(200).json({ status: 'ok' });
  const events = req.body.events as WebhookEvent[];
  // A single webhook delivery is almost always exactly one event — only log
  // a batch-level line for the rare case LINE actually bundles more than
  // one, since each event already gets its own 'Processing event'/detail
  // pair (with reqId) once processEvents() picks it up below.
  if (events.length > 1) {
    logger.info({ eventCount: events.length }, 'Webhook received multiple events');
  }
  processEvents(events).catch((err) =>
    logger.error({ err }, 'Error processing events')
  );
});
