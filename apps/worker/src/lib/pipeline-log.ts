import { prisma, publishEvent, type PipelineStep } from '@idp/shared';

export interface LogContext {
  runId: string;
  serviceId: string;
  serviceSlug: string;
  environmentId: string;
}

export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Returns a logger that persists each pipeline line to Postgres AND publishes it
 * on the event bus so the portal can stream build logs live over WebSocket.
 */
export function pipelineLogger(ctx: LogContext) {
  return async function logLine(
    step: PipelineStep,
    message: string,
    level: LogLevel = 'info',
  ): Promise<void> {
    await prisma.pipelineLog.create({
      data: { pipelineRunId: ctx.runId, step, level, message },
    });
    await publishEvent({
      type: 'pipeline.log',
      serviceId: ctx.serviceId,
      serviceSlug: ctx.serviceSlug,
      environmentId: ctx.environmentId,
      runId: ctx.runId,
      step,
      level,
      message,
      ts: new Date().toISOString(),
    });
  };
}
