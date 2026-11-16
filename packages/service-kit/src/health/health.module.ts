import { Controller, Get, Module } from '@nestjs/common';
import type { Health } from '@triage/contracts';

/** Reports only this process. */
@Controller('health')
export class HealthController {
  @Get()
  check(): Health {
    return { status: 'ok' };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
