import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import type { Run, RunList } from '@triage/contracts';
import { ZodValidationPipe } from '@triage/service-kit';
import { z } from 'zod';
import { RUN_REPOSITORY, type RunRepository } from '../../domain/runs/run-repository';

const ListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

@Controller('runs')
export class RunsController {
  constructor(@Inject(RUN_REPOSITORY) private readonly runs: RunRepository) {}

  @Get()
  list(@Query(new ZodValidationPipe({ schema: ListQuerySchema })) query: z.infer<typeof ListQuerySchema>): Promise<RunList> {
    return this.runs.list({ limit: query.limit });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<Run> {
    return (await this.runs.get({ id })).run;
  }
}
