import type { PipeTransform } from '@nestjs/common';
import { ValidationFailedError } from '@triage/kernel';
import type { z } from 'zod';

export interface ZodValidationPipeParams<T extends z.ZodType> {
  schema: T;
}

/** Validates a request body against its contract schema at the edge: `@Body(new ZodValidationPipe({ schema }))`. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly p: ZodValidationPipeParams<T>) {}

  transform(value: unknown): z.infer<T> {
    const result = this.p.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationFailedError({
        issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    return result.data;
  }
}
