import { randomUUID } from 'node:crypto';
import type { Logger } from '@triage/kernel';
import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { SchemaMigrator } from '../../domain/runs/schema-migrator';
import type { ModelReadiness } from '../../domain/triage/model-readiness';
import type { TicketTriage } from '../../domain/triage/ticket-triage';
import { StartupChecks } from './startup-checks';

const INTERRUPTED_RUN_ID = randomUUID();

/** A startup whose migrator applies `applied` and whose triage closes the runs `closed`. */
function aStartup({ applied = [] as string[], closed = [] as string[] } = {}) {
  const order: string[] = [];
  const migrator = mockDeep<SchemaMigrator>();
  const readiness = mockDeep<ModelReadiness>();
  const logger = mockDeep<Logger>();
  const tickets = mockDeep<TicketTriage>();
  tickets.closeInterrupted.mockImplementationOnce(async () => {
    order.push('close');
    return { closed };
  });
  migrator.migrate.mockImplementationOnce(() => {
    order.push('migrate');
    return { applied };
  });
  readiness.check.mockImplementationOnce(async () => {
    order.push('check');
  });
  return { checks: new StartupChecks(migrator, tickets, readiness, logger), logger, order };
}

describe('StartupChecks', () => {
  it('migrates the storage and closes interrupted runs before checking the model', async () => {
    const { checks, order } = aStartup();

    await checks.onApplicationBootstrap();

    expect(order).toEqual(['migrate', 'close', 'check']);
  });

  it('logs the runs it closed', async () => {
    const { checks, logger } = aStartup({ closed: [INTERRUPTED_RUN_ID] });

    await checks.onApplicationBootstrap();

    expect(logger.warn).toHaveBeenCalledWith({ message: 'interrupted runs closed', context: { closed: [INTERRUPTED_RUN_ID] } });
  });

  it('logs the migrations it applied', async () => {
    const { checks, logger } = aStartup({ applied: ['001_create_runs.sql'] });

    await checks.onApplicationBootstrap();

    expect(logger.info).toHaveBeenCalledWith({ message: 'migrations applied', context: { applied: ['001_create_runs.sql'] } });
  });

  it('logs nothing when the storage is up to date', async () => {
    const { checks, logger } = aStartup();

    await checks.onApplicationBootstrap();

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
