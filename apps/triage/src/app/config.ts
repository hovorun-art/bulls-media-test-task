import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** The folder of apps/triage: data/, migrations/ and relative paths in the config resolve from here. */
export const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const TriageConfigSchema = z
  .object({
    LLM_PROVIDER: z.enum(['ollama', 'anthropic']).default('ollama'),
    OLLAMA_BASE_URL: z.url().default('http://127.0.0.1:11434'),
    OLLAMA_MODEL: z.string().min(1).default('qwen3:8b'),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-5-5'),
    MODEL_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
    MODEL_REPAIR_ATTEMPTS: z.coerce.number().int().min(0).default(2),
    MAX_TOOL_CALLS: z.coerce.number().int().min(1).default(8),
    REFUND_WINDOW_DAYS: z.coerce.number().int().min(0).default(30),
    REFUND_MAX_AUTO_AMOUNT: z.coerce.number().min(0).default(500),
    PORT: z.coerce.number().int().min(0).default(3000),
    HOST: z.string().default('127.0.0.1'),
    DATABASE_PATH: z.string().default('data/runs.sqlite'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  })
  .superRefine((config, ctx) => {
    if (config.LLM_PROVIDER === 'anthropic' && !config.ANTHROPIC_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['ANTHROPIC_API_KEY'], message: 'is required when LLM_PROVIDER=anthropic' });
    }
  });

export type TriageConfig = z.infer<typeof TriageConfigSchema>;

export const TRIAGE_CONFIG = Symbol('TriageConfig');
