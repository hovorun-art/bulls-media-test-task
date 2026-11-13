export interface NowClockResponse {
  instant: Date;
}

/** The current time, injected so that logic depending on it tests deterministically. */
export interface Clock {
  now(): NowClockResponse;
}

export const CLOCK = Symbol('Clock');

export class SystemClock implements Clock {
  now(): NowClockResponse {
    return { instant: new Date() };
  }
}
