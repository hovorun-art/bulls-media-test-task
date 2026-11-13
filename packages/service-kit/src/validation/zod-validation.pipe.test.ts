import { ValidationFailedError } from '@triage/kernel';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const Schema = z.object({ name: z.string().trim().min(1), address: z.object({ city: z.string() }) });

describe('ZodValidationPipe', () => {
  it('returns the parsed value, trimmed', () => {
    const pipe = new ZodValidationPipe({ schema: Schema });

    expect(pipe.transform({ name: '  Anna ', address: { city: 'Kyiv' } })).toEqual({ name: 'Anna', address: { city: 'Kyiv' } });
  });

  it('reports every invalid field, nested paths joined with dots', () => {
    const pipe = new ZodValidationPipe({ schema: Schema });

    const transform = () => pipe.transform({ name: ' ', address: { city: 42 } });

    expect(transform).toThrow(ValidationFailedError);
    expect(transform).toThrow(
      expect.objectContaining({
        details: {
          issues: [
            { path: 'name', message: 'Too small: expected string to have >=1 characters' },
            { path: 'address.city', message: 'Invalid input: expected string, received number' },
          ],
        },
      }),
    );
  });
});
