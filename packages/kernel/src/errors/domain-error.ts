/** The closed list of error codes; a new failure adds its code here first. */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'RUN_NOT_FOUND',
  'RUN_NOT_AWAITING_APPROVAL',
  'CONFIG_INVALID',
  'MODEL_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface DomainErrorParams {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(p: DomainErrorParams) {
    super(p.message);
    this.name = new.target.name;
    this.code = p.code;
    this.details = p.details ?? {};
  }
}

export interface ValidationFailedErrorParams {
  issues: { path: string; message: string }[];
}

export class ValidationFailedError extends DomainError {
  constructor(p: ValidationFailedErrorParams) {
    super({
      code: 'VALIDATION_FAILED',
      message: `Invalid input: ${p.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
      details: { issues: p.issues },
    });
  }
}

export interface ConfigInvalidErrorParams {
  issues: { path: string; message: string }[];
}

export class ConfigInvalidError extends DomainError {
  constructor(p: ConfigInvalidErrorParams) {
    super({
      code: 'CONFIG_INVALID',
      message: `Invalid configuration: ${p.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
      details: { issues: p.issues },
    });
  }
}
