import { randomUUID } from 'node:crypto';

export interface UuidRandomResponse {
  value: string;
}

/** Generated ids, injected so that tests control them. */
export interface Random {
  uuid(): UuidRandomResponse;
}

export const RANDOM = Symbol('Random');

export class CryptoRandom implements Random {
  uuid(): UuidRandomResponse {
    return { value: randomUUID() };
  }
}
