import { ConfigInvalidError } from '@triage/kernel';
import type { z } from 'zod';

export interface ParseConfigParserRequest<T extends z.ZodType> {
  schema: T;
  env: Record<string, string | undefined>;
}

export interface ParseConfigParserResponse<T extends z.ZodType> {
  config: z.infer<T>;
}

/** Turns environment variables into a typed config, or fails the start with CONFIG_INVALID. */
export interface ConfigParser {
  parse<T extends z.ZodType>(req: ParseConfigParserRequest<T>): ParseConfigParserResponse<T>;
}

export class ZodConfigParser implements ConfigParser {
  parse<T extends z.ZodType>(req: ParseConfigParserRequest<T>): ParseConfigParserResponse<T> {
    const result = req.schema.safeParse(req.env);
    if (!result.success) {
      throw new ConfigInvalidError({
        issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    return { config: result.data };
  }
}
