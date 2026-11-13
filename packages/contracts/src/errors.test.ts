import { describe, expect, it } from 'vitest';
import { ErrorBodySchema } from './errors';

describe('ErrorBodySchema', () => {
  it('accepts a code from the closed list', () => {
    const body = { code: 'RUN_NOT_FOUND', message: 'Run r not found', details: { id: 'r' } };

    expect(ErrorBodySchema.safeParse(body).success).toBe(true);
  });

  it('rejects a code outside the closed list', () => {
    const result = ErrorBodySchema.safeParse({ code: 'TEAPOT', message: 'x', details: {} });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['code']);
  });
});
