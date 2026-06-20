import http from 'node:http';
import { logger, prisma } from '@idp/shared';
import { createApp } from './app';
import { createGateway } from './realtime/gateway';
import { config } from './config';

async function main() {
  const app = createApp();
  const server = http.createServer(app);
  createGateway(server);

  server.listen(config.port, () => {
    logger.info(`🚀 IDP control-plane API listening on http://localhost:${config.port}`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start API');
  process.exit(1);
});
