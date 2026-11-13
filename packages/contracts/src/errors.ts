import { ERROR_CODES } from '@triage/kernel/errors';
import { z } from 'zod';

export const ErrorCodeSchema = z.enum(ERROR_CODES);

/** The uniform error body of every service. */
export const ErrorBodySchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

export const HealthSchema = z.object({ status: z.literal('ok') });
export type Health = z.infer<typeof HealthSchema>;
