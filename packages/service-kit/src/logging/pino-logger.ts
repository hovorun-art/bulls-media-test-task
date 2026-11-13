import type { LogLoggerRequest, Logger } from '@triage/kernel';
import type { Logger as Pino } from 'pino';

export interface PinoLoggerDeps {
  pino: Pino;
}

/** Structured JSON logs: one line per call, the context merged into the line. */
export class PinoLogger implements Logger {
  constructor(private readonly d: PinoLoggerDeps) {}

  info(req: LogLoggerRequest): void {
    this.d.pino.info(req.context ?? {}, req.message);
  }

  warn(req: LogLoggerRequest): void {
    this.d.pino.warn(req.context ?? {}, req.message);
  }

  error(req: LogLoggerRequest): void {
    this.d.pino.error(req.context ?? {}, req.message);
  }
}
