import { ConfigInvalidError } from '@triage/kernel';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodConfigParser } from './config-parser';

const Schema = z.object({ PORT: z.coerce.number().int().min(0), MODE: z.enum(['a', 'b']) });

describe('ZodConfigParser', () => {
  it('returns the parsed values, not the raw strings', () => {
    const { config } = new ZodConfigParser().parse({ schema: Schema, env: { PORT: '3000', MODE: 'a' } });

    expect(config).toEqual({ PORT: 3000, MODE: 'a' });
  });

  it('lists every invalid variable in one error', () => {
    const parse = () => new ZodConfigParser().parse({ schema: Schema, env: { PORT: '-1', MODE: 'c' } });

    expect(parse).toThrow(ConfigInvalidError);
    expect(parse).toThrow(
      expect.objectContaining({
        details: {
          issues: [
            { path: 'PORT', message: 'Too small: expected number to be >=0' },
            { path: 'MODE', message: 'Invalid option: expected one of "a"|"b"' },
          ],
        },
      }),
    );
  });
});
