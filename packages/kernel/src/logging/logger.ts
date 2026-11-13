export interface LogLoggerRequest {
  message: string;
  context?: Record<string, unknown>;
}

/** Structured logging port; one JSON line per call. */
export interface Logger {
  info(req: LogLoggerRequest): void;
  warn(req: LogLoggerRequest): void;
  error(req: LogLoggerRequest): void;
}

export const LOGGER = Symbol('Logger');
