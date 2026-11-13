import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DomainError, type Logger, ValidationFailedError } from '@triage/kernel';
import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { DomainErrorFilter } from './domain-error.filter';

function aHostCapturingTheResponse() {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
    },
  };
  const host = mockDeep<ArgumentsHost>();
  host.switchToHttp.mockReturnValueOnce({
    getResponse: () => response,
    getRequest: () => ({ method: 'POST', url: '/api/x' }),
    getNext: () => undefined,
  } as never);
  return { host, sent };
}

const GENERIC_500 = {
  status: 500,
  body: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: {} },
};

describe('DomainErrorFilter', () => {
  it('maps a validation error to 400 with the uniform body and does not log it', () => {
    const { host, sent } = aHostCapturingTheResponse();
    const logger = mockDeep<Logger>();
    const filter = new DomainErrorFilter(logger);

    filter.catch(new ValidationFailedError({ issues: [{ path: 'email', message: 'Invalid email' }] }), host);

    expect(sent).toEqual({
      status: 400,
      body: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid input: email: Invalid email',
        details: { issues: [{ path: 'email', message: 'Invalid email' }] },
      },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('maps RUN_NOT_FOUND to 404 with its code, message and details', () => {
    const { host, sent } = aHostCapturingTheResponse();
    const filter = new DomainErrorFilter(mockDeep<Logger>());

    filter.catch(new DomainError({ code: 'RUN_NOT_FOUND', message: 'Run r1 not found', details: { id: 'r1' } }), host);

    expect(sent).toEqual({
      status: 404,
      body: { code: 'RUN_NOT_FOUND', message: 'Run r1 not found', details: { id: 'r1' } },
    });
  });

  it.each([
    ['MODEL_UNAVAILABLE', 503],
    ['CONFIG_INVALID', 500],
    ['INTERNAL_ERROR', 500],
  ] as const)('maps %s to %i', (code, status) => {
    const { host, sent } = aHostCapturingTheResponse();
    const filter = new DomainErrorFilter(mockDeep<Logger>());

    filter.catch(new DomainError({ code, message: 'x' }), host);

    expect(sent.status).toBe(status);
  });

  it('maps an unknown route to 404 NOT_FOUND without logging it', () => {
    const { host, sent } = aHostCapturingTheResponse();
    const logger = mockDeep<Logger>();
    const filter = new DomainErrorFilter(logger);

    filter.catch(new NotFoundException(), host);

    expect(sent).toEqual({ status: 404, body: { code: 'NOT_FOUND', message: 'Not Found', details: {} } });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('answers another framework HTTP error with a generic 500', () => {
    const { host, sent } = aHostCapturingTheResponse();
    const filter = new DomainErrorFilter(mockDeep<Logger>());

    filter.catch(new BadRequestException('Unexpected JSON'), host);

    expect(sent).toEqual(GENERIC_500);
  });

  it('logs an unexpected error and answers a generic 500', () => {
    const { host, sent } = aHostCapturingTheResponse();
    const logger = mockDeep<Logger>();
    const filter = new DomainErrorFilter(logger);

    filter.catch(new Error('database exploded'), host);

    expect(sent).toEqual(GENERIC_500);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ error: 'database exploded' }) }),
    );
  });

  it('logs a thrown non-Error value as text', () => {
    const { host } = aHostCapturingTheResponse();
    const logger = mockDeep<Logger>();
    const filter = new DomainErrorFilter(logger);

    filter.catch('boom', host);

    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ error: 'boom' }) }));
  });
});
