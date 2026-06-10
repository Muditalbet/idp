import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;

/** Create a child logger scoped to a component (api, worker:provisioner, ...). */
export function childLogger(component: string): Logger {
  return logger.child({ component });
}
