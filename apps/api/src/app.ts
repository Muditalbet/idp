import express, { type Express, type Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger, prisma, redis } from '@idp/shared';
import { config } from './config';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.portalOrigin, credentials: true }));
  app.use(
    pinoHttp({
      logger,
      // Quiet the noisy health checks.
      autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/readyz' },
    }),
  );

  // Capture the raw body so the GitHub webhook can verify its HMAC signature.
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: Request, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redis.ping();
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'not_ready', error: (err as Error).message });
    }
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
