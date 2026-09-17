import express from 'express';
import { dirname, join, resolve } from 'node:path';
import { env } from './config/env.js';
import { initLogger, logger } from './utils/logger.js';
import { healthRouter } from './routes/health.js';
import { webhookRouter } from './routes/webhook.js';
import { createLogsRouter } from './routes/logs.js';

// We anchor LOG_DIR here — the single entry point — rather than in each
// util module, and pass it down as a parameter to everything that needs it.
//
// `import.meta.url` was tried first, since in dev `tsx` runs this exact file
// (src/index.ts) and in production esbuild bundles everything into
// dist/index.cjs, both living exactly one directory below the project root.
// However, this project builds with `tsup --format cjs`, and esbuild's CJS
// output leaves `import.meta` as an empty object (`{}`) — confirmed via
// `npm run build`, which prints the `empty-import-meta` warning, and via
// `grep import_meta dist/index.cjs` showing `var import_meta = {};`.
// `fileURLToPath(import.meta.url)` therefore throws at startup in the built
// artifact (`import.meta.url` is undefined). So we use `process.argv[1]`
// instead: Node sets it to the entry script path for both `tsx src/index.ts`
// and `node dist/index.cjs`, in either relative or absolute form depending
// on how it was invoked, so we resolve() it against the startup cwd (which
// is the project root under Docker's WORKDIR, an npm script, or a normal
// `tsx`/`node` invocation from the repo root) to pin down one absolute path,
// computed once, instead of leaving every downstream fs call to resolve a
// bare 'logs' string against whatever process.cwd() happens to be later.
export function resolveLogDir(entryFilePath: string): string {
  return join(dirname(resolve(entryFilePath)), '..', 'logs');
}

const entryFile = process.argv[1];
if (!entryFile) {
  throw new Error('Cannot determine entry file path from process.argv[1]');
}
const LOG_DIR = resolveLogDir(entryFile);

export const app = express();

app.use('/health', healthRouter);
app.use('/webhook', webhookRouter);
app.use('/logs', createLogsRouter(LOG_DIR));

if (process.env['NODE_ENV'] !== 'test') {
  (async () => {
    await initLogger(LOG_DIR);

    const { startLogCleanup } = await import('./utils/log-cleanup.js');
    startLogCleanup(LOG_DIR);

    const port = parseInt(env.PORT, 10);
    const server = app.listen(port, () => {
      logger.info({ port }, 'Server started');
    });

    const gracefulShutdown = (signal: string): void => {
      logger.info({ signal }, 'Received shutdown signal, closing server');

      const forceExitTimer = setTimeout(() => {
        logger.error('Graceful shutdown timed out, forcing exit');
        process.exit(1);
      }, 10_000);
      forceExitTimer.unref();

      server.close(() => {
        clearTimeout(forceExitTimer);
        logger.info('Server closed, exiting');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    const { startWeeklyPush } = await import('./schedulers/weekly-push.js');
    const { startDisplayNameUpdate } = await import('./schedulers/display-name-update.js');
    startWeeklyPush();
    startDisplayNameUpdate();
  })();
}
