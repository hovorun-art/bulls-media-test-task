import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Inject } from '@nestjs/common';
import type { ErrorBody } from '@triage/contracts';
import { DomainError, type ErrorCode, LOGGER, type Logger } from '@triage/kernel';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  RUN_NOT_FOUND: 404,
  RUN_NOT_AWAITING_APPROVAL: 409,
  CONFIG_INVALID: 500,
  MODEL_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

interface JsonResponse {
  status(code: number): JsonResponse;
  json(body: ErrorBody): void;
}

/** One filter per app: maps error codes to HTTP status and the uniform body (code, message, details). */
@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    const { status, body } = this.toResponse(exception);
    response.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof DomainError) {
      return {
        status: STATUS_BY_CODE[exception.code],
        body: { code: exception.code, message: exception.message, details: exception.details },
      };
    }
    if (exception instanceof HttpException && exception.getStatus() === 404) {
      return { status: 404, body: { code: 'NOT_FOUND', message: exception.message, details: {} } };
    }
    // The framework's own rejections of the request body (malformed JSON, too large) are input errors too.
    if (exception instanceof HttpException && [400, 413].includes(exception.getStatus())) {
      return { status: 400, body: { code: 'VALIDATION_FAILED', message: exception.message, details: {} } };
    }
    this.logger.error({
      message: 'Unexpected error',
      context: {
        error: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
      },
    });
    return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: {} } };
  }
}
