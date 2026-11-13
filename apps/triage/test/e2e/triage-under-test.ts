import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { INestApplication } from '@nestjs/common';
import { type ErrorBody, ErrorBodySchema, type Run, RunListSchema, RunSchema, type Ticket } from '@triage/contracts';
import { NestServiceBootstrap, PinoLogger, ZodConfigParser } from '@triage/service-kit';
import { pino } from 'pino';
import { expect } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { AppModule } from '../../src/app/app.module';
import { TriageConfigSchema } from '../../src/app/config';
import { DATABASE } from '../../src/app/core.module';
import { RUN_REPOSITORY, type RunRepository } from '../../src/domain/runs/run-repository';
import type { ModelReadiness } from '../../src/domain/triage/model-readiness';
import { ModelUnavailableError } from '../../src/domain/triage/model-unavailable.error';
import type { SupportModel } from '../../src/domain/triage/support-model';

export const aTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
  email: 'anna@example.com',
  subject: 'Where is my order?',
  body: 'My lamp was supposed to arrive yesterday.',
  orderId: 'A-1001',
  ...overrides,
});

/**
 * The triage service under test: started like main.ts does, on a fresh SQLite file, with the model
 * (the only thing outside the service) mocked at its port. Drives it only through HTTP.
 */
export class TriageUnderTest {
  readonly model = mockDeep<SupportModel>();
  private readonly readiness = mockDeep<ModelReadiness>();
  private readonly directory = mkdtempSync(join(tmpdir(), 'triage-e2e-'));
  private app: INestApplication | undefined;
  private url = '';

  /** Starts the service; `modelReady: false` makes the start-up model check fail. */
  async start({ modelReady = true } = {}): Promise<void> {
    const { config } = new ZodConfigParser().parse({
      schema: TriageConfigSchema,
      env: { DATABASE_PATH: join(this.directory, 'runs.sqlite'), HOST: '127.0.0.1', PORT: '0', LOG_LEVEL: 'silent' },
    });
    const logger = new PinoLogger({ pino: pino({ level: 'silent' }) });
    if (modelReady) this.readiness.check.mockResolvedValueOnce(undefined);
    else this.readiness.check.mockRejectedValueOnce(new ModelUnavailableError({ reason: 'Ollama is not reachable' }));
    const started = await new NestServiceBootstrap({ logger }).start({
      module: AppModule.forRoot({ config, logger, ports: { supportModel: this.model, modelReadiness: this.readiness } }),
      host: config.HOST,
      port: config.PORT,
    });
    this.app = started.app;
    this.url = started.url;
  }

  async stop(): Promise<void> {
    await this.app?.close();
    rmSync(this.directory, { recursive: true, force: true });
  }

  /** Before each test: no stubs on the model, no stored runs. */
  reset(): void {
    mockReset(this.model);
    this.required().get<DatabaseSync>(DATABASE).exec('DELETE FROM runs');
  }

  private required(): INestApplication {
    if (!this.app) throw new Error('The service is not started');
    return this.app;
  }

  /** The model looks up the order and the tracking article, then replies. */
  scriptOrderStatusResearch(): void {
    this.model.describe.mockReturnValueOnce({ provider: 'ollama', name: 'qwen3:8b' });
    this.model.classify.mockResolvedValueOnce({ category: 'order_status', priority: 'normal', issueSummary: 'Order status.' });
    this.model.nextStep.mockResolvedValueOnce({ step: { kind: 'tool', tool: 'get_order', args: { orderId: 'A-1001' } } });
    this.model.nextStep.mockResolvedValueOnce({
      step: { kind: 'tool', tool: 'search_knowledge_base', args: { query: 'track my order' } },
    });
    this.model.nextStep.mockResolvedValueOnce({ step: { kind: 'done' } });
    this.model.decide.mockResolvedValueOnce({
      action: 'reply',
      reasons: ['The order is shipped with UPS.'],
      citedArticles: ['order-tracking'],
      refundOrderId: null,
    });
    this.model.draft.mockResolvedValueOnce({ replyDraft: 'Your lamp ships with UPS.' });
  }

  /** The model wants to refund the given order, without researching. */
  scriptRefundDecision(orderId: string): void {
    this.model.describe.mockReturnValueOnce({ provider: 'ollama', name: 'qwen3:8b' });
    this.model.classify.mockResolvedValueOnce({ category: 'refund_request', priority: 'high', issueSummary: 'Refund.' });
    this.model.nextStep.mockResolvedValueOnce({ step: { kind: 'done' } });
    this.model.decide.mockResolvedValueOnce({
      action: 'propose_refund',
      reasons: ['The customer wants a refund.'],
      citedArticles: ['refund-policy'],
      refundOrderId: orderId,
    });
    this.model.draft.mockResolvedValueOnce({ replyDraft: 'We are reviewing your refund.' });
  }

  /** Classification only: what the model is asked when the guard flags the ticket. */
  scriptClassificationOnly(): void {
    this.model.describe.mockReturnValueOnce({ provider: 'ollama', name: 'qwen3:8b' });
    this.model.classify.mockResolvedValueOnce({ category: 'refund_request', priority: 'high', issueSummary: 'Refund.' });
  }

  /** The service's own run repository, to make it fail once like a broken disk would. */
  runRepository(): RunRepository {
    return this.required().get<RunRepository>(RUN_REPOSITORY);
  }

  /** The model answers a ticket with a plain reply after no research. */
  scriptReply(): void {
    this.model.describe.mockReturnValueOnce({ provider: 'ollama', name: 'qwen3:8b' });
    this.model.classify.mockResolvedValueOnce({ category: 'order_status', priority: 'normal', issueSummary: 'Order status.' });
    this.model.nextStep.mockResolvedValueOnce({ step: { kind: 'done' } });
    this.model.decide.mockResolvedValueOnce({
      action: 'reply',
      reasons: ['The order is on its way.'],
      citedArticles: ['order-tracking'],
      refundOrderId: null,
    });
    this.model.draft.mockResolvedValueOnce({ replyDraft: 'Your order is on its way.' });
  }

  /** Every model call fails, as when the model server is down. */
  scriptModelDown(): void {
    this.model.describe.mockReturnValueOnce({ provider: 'ollama', name: 'qwen3:8b' });
    this.model.classify.mockRejectedValueOnce(new ModelUnavailableError({ reason: 'connect ECONNREFUSED' }));
  }

  async postTicket(body: unknown): Promise<Response> {
    return this.postRaw(JSON.stringify(body));
  }

  async postRaw(body: string): Promise<Response> {
    return fetch(`${this.url}/api/triage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  }

  async triage(ticket: Ticket): Promise<Run> {
    const response = await this.postTicket(ticket);
    expect(response.status).toBe(200);
    return RunSchema.parse(await response.json());
  }

  async get(path: string): Promise<Response> {
    return fetch(`${this.url}${path}`);
  }

  async getRun(id: string): Promise<Response> {
    return this.get(`/api/runs/${id}`);
  }

  async listRuns(query = '') {
    const response = await this.get(`/api/runs${query}`);
    expect(response.status).toBe(200);
    return RunListSchema.parse(await response.json());
  }

  async errorOf(response: Response, status: number): Promise<ErrorBody> {
    expect(response.status).toBe(status);
    // strict: framework internals (statusCode, error...) must not leak into the uniform body
    return ErrorBodySchema.strict().parse(await response.json());
  }
}
