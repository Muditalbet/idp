import { env } from '@idp/shared';

export const config = {
  port: env.API_PORT,
  jwtSecret: env.JWT_SECRET,
  githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET,
  // Browser origin allowed to call the API / open a socket.
  portalOrigin: `http://localhost:${env.PORTAL_PORT}`,
  isProd: env.NODE_ENV === 'production',
};
