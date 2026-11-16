import { join } from 'node:path';
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/ollama';
import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { CLOCK, type Clock, LOGGER, type Logger, RANDOM, type Random } from '@triage/kernel';
import { INJECTION_GUARD, type InjectionGuard } from '../../domain/guard/injection-guard';
import { KNOWLEDGE_BASE, type KnowledgeBase } from '../../domain/knowledge-base/knowledge-base';
import { ORDER_STORE, type OrderStore } from '../../domain/orders/order-store';
import { REFUND_POLICY, type RefundPolicy } from '../../domain/refunds/refund-policy';
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
import { LangGraphTriageAgent } from '../../infra/triage/langgraph-triage-agent';
import { OllamaModelReadiness } from '../../infra/triage/ollama-model-readiness';
import { TicketTriageImpl } from '../../infra/triage/ticket-triage.impl';
import { APP_ROOT, TRIAGE_CONFIG, type TriageConfig } from '../config';
import { RunsModule } from '../runs/runs.module';
import { StartupChecks } from './startup-checks';
import { TriageController } from './triage.controller';

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
              { model, knowledgeBase, orders, refundPolicy, injectionGuard, clock, logger },
              { maxToolCalls: config.MAX_TOOL_CALLS, knowledgeBaseResults: 3 },
            ),
        },
        {
          provide: TICKET_TRIAGE,
          inject: [TRIAGE_AGENT, RUN_REPOSITORY, SUPPORT_MODEL, CLOCK, RANDOM, LOGGER],
          useFactory: (
            agent: TriageAgent,
            runs: RunRepository,
            model: SupportModel,
            clock: Clock,
            random: Random,
            logger: Logger,
          ) => new TicketTriageImpl({ agent, runs, model, clock, random, logger }),
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
        const anthropic = config.LLM_PROVIDER === 'anthropic';
        const modelName = anthropic ? config.ANTHROPIC_MODEL : config.OLLAMA_MODEL;
        // Retries live in LangChainSupportModel, so the chat models get none of their own.
        const chatModel: BaseChatModel = anthropic
          ? new ChatAnthropic({ model: modelName, apiKey: config.ANTHROPIC_API_KEY, temperature: 0, maxRetries: 0 })
          : new ChatOllama({ model: modelName, baseUrl: config.OLLAMA_BASE_URL, temperature: 0, think: false, maxRetries: 0 });
        return new LangChainSupportModel(
          { chatModel },
          {
            provider: config.LLM_PROVIDER,
            modelName,
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
        config.LLM_PROVIDER === 'ollama'
          ? new OllamaModelReadiness({ baseUrl: config.OLLAMA_BASE_URL, model: config.OLLAMA_MODEL })
          : { check: async () => undefined }, // the key itself is checked by the config schema
    };
  }
}
