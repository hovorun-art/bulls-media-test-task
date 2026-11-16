import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** The folder of apps/triage: data/, migrations/ and relative paths in the config resolve from here. */
export const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const TriageConfigSchema = z.object({
  GOOGLE_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.8-flash'),
  MODEL_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(4), // first call + 3 retries
  MODEL_REPAIR_ATTEMPTS: z.coerce.number().int().min(0).default(2),
  MAX_TOOL_CALLS: z.coerce.number().int().min(1).default(8),
  REFUND_WINDOW_DAYS: z.coerce.number().int().min(0).default(30),
  REFUND_MAX_AUTO_AMOUNT: z.coerce.number().min(0).default(500),
  /** Agent time a run may take; the wait for a refund approval does not count. */
  RUN_DEADLINE_SECONDS: z.coerce.number().positive().default(600),
  RUN_EVENTS_HEARTBEAT_SECONDS: z.coerce.number().positive().default(15),
  PORT: z.coerce.number().int().min(0).default(3000),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_PATH: z.string().default('data/runs.sqlite'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
});

export type TriageConfig = z.infer<typeof TriageConfigSchema>;

export const TRIAGE_CONFIG = Symbol('TriageConfig');
