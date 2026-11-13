import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { type IEntryNestModule, NestFactory } from '@nestjs/core';
import type { Logger } from '@triage/kernel';
import { DomainErrorFilter } from '../errors/domain-error.filter';

export interface StartServiceBootstrapRequest {
  module: IEntryNestModule;
  host: string;
  port: number;
}

export interface StartServiceBootstrapResponse {
  app: INestApplication;
  url: string;
}

/** Starts a service the same way in main.ts and in e2e tests. */
export interface ServiceBootstrap {
  start(req: StartServiceBootstrapRequest): Promise<StartServiceBootstrapResponse>;
}

export interface NestServiceBootstrapDeps {
  logger: Logger;
}

export class NestServiceBootstrap implements ServiceBootstrap {
  constructor(private readonly d: NestServiceBootstrapDeps) {}

  async start(req: StartServiceBootstrapRequest): Promise<StartServiceBootstrapResponse> {
    const app = await NestFactory.create(req.module, { logger: ['error', 'warn'] });
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new DomainErrorFilter(this.d.logger));
    app.enableShutdownHooks();
    await app.listen(req.port, req.host);
    const address = app.getHttpServer().address() as { port: number };
    return { app, url: `http://${req.host}:${address.port}` };
  }
}
