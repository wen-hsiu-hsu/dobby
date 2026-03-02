import express from 'express';
import { env } from './config/env.js';
import { initLogger, logger } from './utils/logger.js';
import { healthRouter } from './routes/health.js';
import { webhookRouter } from './routes/webhook.js';
import { logsRouter } from './routes/logs.js';

export const app = express();

app.use('/health', healthRouter);
app.use('/webhook', webhookRouter);
app.use('/logs', logsRouter);

if (process.env['NODE_ENV'] !== 'test') {
  (async () => {
    await initLogger();

    const { startLogCleanup } = await import('./utils/log-cleanup.js');
    startLogCleanup();

    const port = parseInt(env.PORT, 10);
    app.listen(port, () => {
      logger.info({ port }, 'Server started');
    });

    const { startWeeklyPush } = await import('./schedulers/weekly-push.js');
    const { startDisplayNameUpdate } = await import('./schedulers/display-name-update.js');
    startWeeklyPush();
    startDisplayNameUpdate();
  })();
}
