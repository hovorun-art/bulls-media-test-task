import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ChatOllama } from '@langchain/ollama';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelUnavailableError } from '../../domain/triage/model-unavailable.error';
import { LangChainSupportModel } from './langchain-support-model';

/** The adapter over the real ChatOllama client, aimed at the stub. */
function aModelOver(baseUrl: string, { maxAttempts, repairAttempts }: { maxAttempts: number; repairAttempts: number }) {
  return new LangChainSupportModel(
    { chatModel: new ChatOllama({ baseUrl, model: 'qwen3:8b', maxRetries: 0 }) },
    { provider: 'ollama', modelName: 'qwen3:8b', maxAttempts, repairAttempts },
  );
}

/**
 * A local stand-in for the Ollama HTTP API: answers each POST /api/chat with the next scripted reply.
 * A reply with `hold` never answers, like a model that is still thinking.
 */
async function anOllamaStub(replies: { status: number; content?: string; toolCalls?: unknown[]; hold?: boolean }[]) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    request.resume();
    const reply = replies.shift() ?? { status: 500 };
    if (reply.hold) return;
    if (reply.status !== 200) {
      response.writeHead(reply.status, { 'content-type': 'application/json' }).end('{"error":"model crashed"}');
      return;
    }
    const message = { role: 'assistant', content: reply.content ?? '', tool_calls: reply.toolCalls };
    const line = { model: 'qwen3:8b', created_at: new Date().toISOString(), message, done: true, done_reason: 'stop' };
    response.writeHead(200, { 'content-type': 'application/x-ndjson' }).end(`${JSON.stringify(line)}\n`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, requests, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe('LangChainSupportModel over ChatOllama', () => {
  let server: Server | undefined;

  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
    server = undefined;
  });

  it('Model call is retried after a transient failure', async () => {
    const stub = await anOllamaStub([
      { status: 500 },
      { status: 200, content: '{"category":"order_status","priority":"normal","issueSummary":"Where is A-1001."}' },
    ]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 3, repairAttempts: 0 });

    const classification = await model.classify({
      ticket: { email: 'anna@example.com', subject: 'Where is my order?', body: 'Lamp is late' },
    });

    expect(classification).toEqual({ category: 'order_status', priority: 'normal', issueSummary: 'Where is A-1001.' });
    expect(stub.requests).toEqual(['POST /api/chat', 'POST /api/chat']);
  });

  it('stops after the configured attempts when every call fails', async () => {
    const stub = await anOllamaStub([{ status: 500 }, { status: 500 }, { status: 500 }]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 3, repairAttempts: 0 });

    await expect(
      model.classify({ ticket: { email: 'anna@example.com', subject: 'Order', body: 'Late' } }),
    ).rejects.toBeInstanceOf(ModelUnavailableError);
    expect(stub.requests).toHaveLength(3);
  });

  it('repairs content that is not JSON through the real client', async () => {
    const stub = await anOllamaStub([
      { status: 200, content: 'Sure! The category is order status.' },
      { status: 200, content: '{"category":"order_status","priority":"normal","issueSummary":"Where is A-1001."}' },
    ]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 1, repairAttempts: 1 });

    const classification = await model.classify({
      ticket: { email: 'anna@example.com', subject: 'Where is my order?', body: 'Lamp is late' },
    });

    expect(classification).toEqual({ category: 'order_status', priority: 'normal', issueSummary: 'Where is A-1001.' });
    expect(stub.requests).toHaveLength(2);
  });

  it('turns an Ollama tool call into the next research step', async () => {
    const stub = await anOllamaStub([
      { status: 200, toolCalls: [{ function: { name: 'get_order', arguments: { orderId: 'A-1001' } } }] },
    ]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 1, repairAttempts: 0 });

    const next = await model.nextStep({
      ticket: { email: 'anna@example.com', subject: 'Where is my order?', body: 'Lamp is late', orderId: 'A-1001' },
      classification: { category: 'order_status', priority: 'normal', issueSummary: 'Where is A-1001.' },
      observations: [],
    });

    expect(next).toEqual({ step: { kind: 'tool', tool: 'get_order', args: { orderId: 'A-1001' } } });
  });

  it('Model call in flight is aborted at the deadline, without a retry', async () => {
    const stub = await anOllamaStub([{ status: 200, hold: true }]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 3, repairAttempts: 0 });
    const deadline = new AbortController();
    const call = model.classify({ ticket: { email: 'anna@example.com', subject: 'Order', body: 'Late' }, signal: deadline.signal });
    await vi.waitFor(() => expect(stub.requests).toHaveLength(1));

    deadline.abort();

    await expect(call).rejects.toThrow('Model unavailable: the call was aborted');
    expect(stub.requests).toEqual(['POST /api/chat']);
  });
});
