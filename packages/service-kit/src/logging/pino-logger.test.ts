import type { Logger as Pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { PinoLogger } from './pino-logger';

describe('PinoLogger', () => {
  it.each(['info', 'warn', 'error'] as const)('writes %s lines with the context merged in', (level) => {
    const pino = mockDeep<Pino>();

    new PinoLogger({ pino })[level]({ message: 'agent step', context: { runId: 'r1' } });

    expect(pino[level]).toHaveBeenCalledWith({ runId: 'r1' }, 'agent step');
  });

  it('writes an empty context when none is given', () => {
    const pino = mockDeep<Pino>();

    new PinoLogger({ pino }).info({ message: 'started' });

    expect(pino.info).toHaveBeenCalledWith({}, 'started');
  });
});
