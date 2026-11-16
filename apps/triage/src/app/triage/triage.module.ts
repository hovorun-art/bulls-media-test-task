import { join, resolve } from 'node:path';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { CLOCK, type Clock, LOGGER, type Logger, RANDOM, type Random } from '@triage/kernel';
import { INJECTION_GUARD, type InjectionGuard } from '../../domain/guard/injection-guard';
import { KNOWLEDGE_BASE, type KnowledgeBase } from '../../domain/knowledge-base/knowledge-base';
import { ORDER_STORE, type OrderStore } from '../../domain/orders/order-store';
import { REFUND_POLICY, type RefundPolicy } from '../../domain/refunds/refund-policy';
import { RUN_EVENTS, type RunEvents } from '../../domain/runs/run-events';
import { RUN_REPOSITORY, type RunRepository } from '../../domain/runs/run-repository';
import { MODEL_READINESS, type ModelReadiness } from '../../domain/triage/model-readiness';
import { SUPPORT_MODEL, type SupportModel } from '../../domain/triage/support-model';
import { TICKET_TRIAGE } from '../../domain/triage/ticket-triage';
import { TRIAGE_AGENT, type TriageAgent } from '../../domain/triage/triage-agent';
import { PatternInjectionGuard } from '../../infra/guard/pattern-injection-guard';
import { MarkdownKnowledgeBase } from '../../infra/knowledge-base/markdown-knowledge-base';
import { SeededOrderStore } from '../../infra/orders/seeded-order-store';
import { RefundPolicyImpl } from '../../infra/refunds/refund-policy.impl';
import { LangChainSupportModel } from '../../infra/triage/langchain-support-model';
import { GeminiModelReadiness } from '../../infra/triage/gemini-model-readiness';
import { LangGraphTriageAgent } from '../../infra/triage/langgraph-triage-agent';
import { TicketTriageImpl } from '../../infra/triage/ticket-triage.impl';
import { APP_ROOT, TRIAGE_CONFIG, type TriageConfig } from '../config';
import { RunsModule } from '../runs/runs.module';
import { StartupChecks } from './startup-checks';
import { TriageController } from './triage.controller';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

/** Ports outside the service: e2e tests replace them with mocks, production builds them from the config. */
export interface ExternalPorts {
  supportModel?: SupportModel;
  modelReadiness?: ModelReadiness;
}

@Module({})
export class TriageModule {
  static forRoot(ports: ExternalPorts = {}): DynamicModule {
    return {
      module: TriageModule,
      imports: [RunsModule],
      controllers: [TriageController],
      providers: [
        StartupChecks,
        this.supportModel(ports),
        this.modelReadiness(ports),
        { provide: KNOWLEDGE_BASE, useFactory: () => new MarkdownKnowledgeBase({ directory: join(APP_ROOT, 'data/kb') }) },
        {
          provide: ORDER_STORE,
          inject: [CLOCK],
          useFactory: (clock: Clock) => new SeededOrderStore({ clock }, { seedPath: join(APP_ROOT, 'data/orders.json') }),
        },
        {
          provide: REFUND_POLICY,
          inject: [CLOCK, TRIAGE_CONFIG],
          useFactory: (clock: Clock, config: TriageConfig) =>
            new RefundPolicyImpl(
              { clock },
              { windowDays: config.REFUND_WINDOW_DAYS, maxAutoAmount: config.REFUND_MAX_AUTO_AMOUNT },
            ),
        },
        { provide: INJECTION_GUARD, useFactory: () => new PatternInjectionGuard() },
        {
          provide: TRIAGE_AGENT,
          inject: [SUPPORT_MODEL, KNOWLEDGE_BASE, ORDER_STORE, REFUND_POLICY, INJECTION_GUARD, CLOCK, LOGGER, TRIAGE_CONFIG],
          useFactory: (
            model: SupportModel,
            knowledgeBase: KnowledgeBase,
            orders: OrderStore,
            refundPolicy: RefundPolicy,
            injectionGuard: InjectionGuard,
            clock: Clock,
            logger: Logger,
            config: TriageConfig,
          ) =>
            new LangGraphTriageAgent(
              {
                model,
                knowledgeBase,
                orders,
                refundPolicy,
                injectionGuard,
                clock,
                logger,
                // Paused runs live next to the runs, in the same SQLite file, in the saver's own tables.
                checkpointer: SqliteSaver.fromConnString(resolve(APP_ROOT, config.DATABASE_PATH)),
              },
              {
                maxToolCalls: config.MAX_TOOL_CALLS,
                knowledgeBaseResults: 3,
                deadlineMs: config.RUN_DEADLINE_SECONDS * 1000,
              },
            ),
        },
        {
          provide: TICKET_TRIAGE,
          inject: [TRIAGE_AGENT, RUN_REPOSITORY, RUN_EVENTS, SUPPORT_MODEL, CLOCK, RANDOM, LOGGER],
          useFactory: (
            agent: TriageAgent,
            runs: RunRepository,
            events: RunEvents,
            model: SupportModel,
            clock: Clock,
            random: Random,
            logger: Logger,
          ) => new TicketTriageImpl({ agent, runs, events, model, clock, random, logger }),
        },
      ],
    };
  }

  private static supportModel(ports: ExternalPorts): Provider {
    if (ports.supportModel) return { provide: SUPPORT_MODEL, useValue: ports.supportModel };
    return {
      provide: SUPPORT_MODEL,
      inject: [TRIAGE_CONFIG],
      useFactory: (config: TriageConfig) => {
        // Retries live in LangChainSupportModel, so the chat model gets none of its own.
        const chatModel = new ChatGoogleGenerativeAI({
          model: config.GEMINI_MODEL,
          apiKey: config.GOOGLE_API_KEY,
          temperature: 0,
          maxRetries: 0,
        });
        return new LangChainSupportModel(
          { chatModel },
          {
            provider: 'gemini',
            modelName: config.GEMINI_MODEL,
            maxAttempts: config.MODEL_MAX_ATTEMPTS,
            repairAttempts: config.MODEL_REPAIR_ATTEMPTS,
          },
        );
      },
    };
  }

  private static modelReadiness(ports: ExternalPorts): Provider {
    if (ports.modelReadiness) return { provide: MODEL_READINESS, useValue: ports.modelReadiness };
    return {
      provide: MODEL_READINESS,
      inject: [TRIAGE_CONFIG],
      useFactory: (config: TriageConfig): ModelReadiness =>
        new GeminiModelReadiness({
          baseUrl: GEMINI_BASE_URL,
          apiKey: config.GOOGLE_API_KEY,
          model: config.GEMINI_MODEL,
        }),
    };
  }
}
