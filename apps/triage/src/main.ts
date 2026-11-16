import 'reflect-metadata';
import { DomainError } from '@triage/kernel';
import { NestServiceBootstrap, PinoLogger, ZodConfigParser } from '@triage/service-kit';
import { pino } from 'pino';
import { AppModule } from './app/app.module';
import { TriageConfigSchema } from './app/config';

const bootLogger = new PinoLogger({ pino: pino({ name: 'triage' }) });

try {
  const { config } = new ZodConfigParser().parse({ schema: TriageConfigSchema, env: process.env });
  const logger = new PinoLogger({ pino: pino({ name: 'triage', level: config.LOG_LEVEL }) });
  const { url } = await new NestServiceBootstrap({ logger }).start({
    module: AppModule.forRoot({ config, logger }),
    host: config.HOST,
    port: config.PORT,
  });
  logger.info({ message: 'triage service listening', context: { url, provider: 'gemini', model: config.GEMINI_MODEL } });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  bootLogger.error({ message: 'triage service did not start', context: { error: message } });
  process.exit(error instanceof DomainError ? 2 : 1);
}
