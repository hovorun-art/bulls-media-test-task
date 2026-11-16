import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { INestApplication } from '@nestjs/common';
import {
  type ErrorBody,
  ErrorBodySchema,
  type Run,
  type RunEvent,
  RunEventSchema,
  RunListSchema,
  RunSchema,
  type RunStatus,
  type Ticket,
  TriageAcceptedSchema,
} from '@triage/contracts';
import { NestServiceBootstrap, PinoLogger, ZodConfigParser } from '@triage/service-kit';
import { pino } from 'pino';
import { expect, vi } from 'vitest';
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

/** A run as the service stores it, for states no route can create; running unless overridden. */
export const aStoredRun = (overrides: Partial<Run> = {}): Run => ({
  id: randomUUID(),
  createdAt: '2026-11-13T12:00:00.000Z',
  model: { provider: 'ollama', name: 'qwen3:8b' },
  ticket: aTicket(),
  status: 'running',
  result: null,
  trace: [],
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

  /**
   * Starts the service; `modelReady: false` makes the start-up model check fail, `env` adds settings.
   * A second start (after `restart`) uses the same database file.
   */
  async start({ modelReady = true, env = {} }: { modelReady?: boolean; env?: Record<string, string> } = {}): Promise<void> {
    const { config } = new ZodConfigParser().parse({
      schema: TriageConfigSchema,
      env: { DATABASE_PATH: join(this.directory, 'runs.sqlite'), HOST: '127.0.0.1', PORT: '0', LOG_LEVEL: 'silent', ...env },
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

  /** Stops the service and starts it again on the same database file, as after a crash or a deploy. */
  async restart(): Promise<void> {
    await this.app?.close();
    await this.start();
  }

  /** Before each test: no stubs on the model, no stored runs and no checkpoints of paused runs. */
  reset(): void {
    mockReset(this.model);
    const database = this.required().get<DatabaseSync>(DATABASE);
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('runs', 'checkpoints', 'writes')").all();
    for (const { name } of tables) database.exec(`DELETE FROM ${String(name)}`);
  }

  /** Stores a run as it is, for a state no route can create (e.g. left running by a stopped service). */
  async store(run: Run): Promise<void> {
    await this.runRepository().save({ run });
  }

  private required(): INestApplication {
    if (!this.app) throw new Error('The service is not started');
    return this.app;
  }

  /** The model classifies, then does not answer the research step until `release` is called. */
  scriptHeldResearch(): { release: () => void } {
    let release = () => {};
    this.model.describe.mockReturnValueOnce({ provider: 'ollama', name: 'qwen3:8b' });
    this.model.classify.mockResolvedValueOnce({ category: 'order_status', priority: 'normal', issueSummary: 'Order status.' });
    this.model.nextStep.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve({ step: { kind: 'done' } });
      }),
    );
    this.model.decide.mockResolvedValueOnce({
      action: 'reply',
      reasons: ['The order is on its way.'],
      citedArticles: ['order-tracking'],
      refundOrderId: null,
    });
    this.model.draft.mockResolvedValueOnce({ replyDraft: 'Your order is on its way.' });
    return { release: () => release() };
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

  /**
   * The model wants to refund the given order, without researching. `held: true` keeps the research
   * step from answering until `release` is called.
   */
  scriptRefundDecision(orderId: string, { held = false } = {}): { release: () => void } {
    let release = () => {};
    this.model.describe.mockReturnValueOnce({ provider: 'ollama', name: 'qwen3:8b' });
    this.model.classify.mockResolvedValueOnce({ category: 'refund_request', priority: 'high', issueSummary: 'Refund.' });
    if (held) {
      this.model.nextStep.mockReturnValueOnce(
        new Promise((resolve) => {
          release = () => resolve({ step: { kind: 'done' } });
        }),
      );
    } else {
      this.model.nextStep.mockResolvedValueOnce({ step: { kind: 'done' } });
    }
    this.model.decide.mockResolvedValueOnce({
      action: 'propose_refund',
      reasons: ['The customer wants a refund.'],
      citedArticles: ['refund-policy'],
      refundOrderId: orderId,
    });
    this.model.draft.mockResolvedValueOnce({ replyDraft: 'We are reviewing your refund.' });
    return { release: () => release() };
  }

  /** Classification only: what the model is asked when the guard flags the ticket. */
  scriptClassificationOnly(): void {
    this.model.describe.mockReturnValueOnce({ provider: 'ollama', name: 'qwen3:8b' });
    this.model.classify.mockResolvedValueOnce({ category: 'refund_request', priority: 'high', issueSummary: 'Refund.' });
  }

  /** Lets the first `count` saves of runs through, then fails the next one once, like a full disk. */
  failSaveAfter(count: number): void {
    const repository = this.runRepository();
    const save = repository.save.bind(repository);
    const spy = vi.spyOn(repository, 'save');
    for (let saved = 0; saved < count; saved += 1) spy.mockImplementationOnce(save);
    spy.mockRejectedValueOnce(new Error('disk full'));
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
  /** The model never answers the classification, so the run stays running. */
  scriptModelNeverAnswers(): void {
    this.model.describe.mockReturnValueOnce({ provider: 'ollama', name: 'qwen3:8b' });
    this.model.classify.mockReturnValueOnce(new Promise(() => {}));
  }

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

  /** Posts a ticket and returns the id of the accepted run, which goes on in the background. */
  async startTriage(ticket: Ticket): Promise<string> {
    const response = await this.postTicket(ticket);
    expect(response.status).toBe(202);
    return TriageAcceptedSchema.parse(await response.json()).id;
  }

  /** Posts a ticket and waits until its run reaches the status (done by default). */
  async triage(ticket: Ticket, status: RunStatus = 'done'): Promise<Run> {
    return this.waitForRun(await this.startTriage(ticket), (run) => run.status === status);
  }

  /** Reads the run until it matches, as a client following it would. */
  async waitForRun(id: string, matches: (run: Run) => boolean): Promise<Run> {
    return vi.waitFor(
      async () => {
        const run = RunSchema.parse(await (await this.getRun(id)).json());
        if (!matches(run)) throw new Error(`Run ${id} is ${run.status} with ${run.trace.length} steps`);
        return run;
      },
      { timeout: 5000 },
    );
  }

  async decide(id: string, decision: unknown): Promise<Response> {
    return fetch(`${this.url}/api/runs/${id}/approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(decision),
    });
  }

  /**
   * Follows the event stream of a run until the service closes it, or until `stopAfter` says so.
   * `onFirstEvent` runs once the stream is open, e.g. to let a held run go on. Heartbeats come back
   * as 'heartbeat'.
   */
  async followEvents(
    id: string,
    {
      stopAfter = () => false,
      onFirstEvent = () => {},
    }: { stopAfter?: (event: RunEvent | 'heartbeat') => boolean; onFirstEvent?: () => void } = {},
  ): Promise<{ events: (RunEvent | 'heartbeat')[]; closed: boolean }> {
    const response = await fetch(`${this.url}/api/runs/${id}/events`);
    expect(response.status).toBe(200);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    const events: (RunEvent | 'heartbeat')[] = [];
    let buffered = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { events, closed: true };
      buffered += decoder.decode(value, { stream: true });
      const blocks = buffered.split('\n\n');
      buffered = blocks.pop() ?? '';
      for (const block of blocks) {
        const lines = block.split('\n');
        const data = lines.find((line) => line.startsWith('data: '))?.slice('data: '.length) ?? '';
        const event = lines.includes('event: heartbeat') ? 'heartbeat' : RunEventSchema.parse(JSON.parse(data));
        events.push(event);
        if (events.length === 1) onFirstEvent();
        if (stopAfter(event)) {
          await reader.cancel();
          return { events, closed: false };
        }
      }
    }
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
