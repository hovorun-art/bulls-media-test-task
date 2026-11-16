import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelUnavailableError } from '../../domain/triage/model-unavailable.error';
import type { Classification } from '../../domain/triage/support-model';
import { LangChainSupportModel } from './langchain-support-model';

/** The adapter over the real ChatGoogleGenerativeAI client, aimed at the stub. */
function aModelOver(baseUrl: string, { maxAttempts, repairAttempts }: { maxAttempts: number; repairAttempts: number }) {
  return new LangChainSupportModel(
    { chatModel: new ChatGoogleGenerativeAI({ baseUrl, apiKey: 'test-key', model: 'gemini-3.8-flash', maxRetries: 0 }) },
    { provider: 'gemini', modelName: 'gemini-3.8-flash', maxAttempts, repairAttempts },
  );
}

/** The parts of a generateContent request body the tests look at. */
interface GenerateBody {
  tools?: { functionDeclarations: { name: string }[] }[];
  generationConfig?: { responseSchema?: { properties: Record<string, unknown> } };
}

/**
 * A local stand-in for the Gemini REST API: answers each POST generateContent with the next scripted reply.
 * A reply with `hold` never answers, like a model that is still thinking.
 */
async function aGeminiStub(
  replies: { status: number; text?: string; functionCall?: { name: string; args: unknown }; hold?: boolean }[],
) {
  const requests: string[] = [];
  const bodies: GenerateBody[] = [];
  const server = createServer(async (request, response) => {
    requests.push(`${request.method} ${request.url}`);
    let text = '';
    for await (const chunk of request) text += chunk;
    bodies.push(JSON.parse(text) as GenerateBody);
    const reply = replies.shift() ?? { status: 500 };
    if (reply.hold) return;
    if (reply.status !== 200) {
      response.writeHead(reply.status, { 'content-type': 'application/json' }).end('{"error":{"code":500,"message":"model crashed"}}');
      return;
    }
    const part = reply.functionCall ? { functionCall: reply.functionCall } : { text: reply.text ?? '' };
    const body = { candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP', index: 0 }] };
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, requests, bodies, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

const GENERATE = 'POST /v1beta/models/gemini-3.8-flash:generateContent';
const CLASSIFICATION: Classification = { category: 'order_status', priority: 'normal', issueSummary: 'Where is A-1001.' };

describe('LangChainSupportModel over ChatGoogleGenerativeAI', () => {
  let server: Server | undefined;

  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
    server = undefined;
  });

  it('Model call is retried after a transient failure', async () => {
    const stub = await aGeminiStub([
      { status: 500 },
      { status: 200, text: JSON.stringify(CLASSIFICATION) },
    ]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 3, repairAttempts: 0 });

    const classification = await model.classify({
      ticket: { email: 'anna@example.com', subject: 'Where is my order?', body: 'Lamp is late' },
    });

    expect(classification).toEqual(CLASSIFICATION);
    expect(stub.requests).toEqual([GENERATE, GENERATE]);
  });

  it('asks Gemini for the classification schema', async () => {
    const stub = await aGeminiStub([{ status: 200, text: JSON.stringify(CLASSIFICATION) }]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 1, repairAttempts: 0 });

    await model.classify({ ticket: { email: 'anna@example.com', subject: 'Order', body: 'Late' } });

    expect(Object.keys(stub.bodies[0]?.generationConfig?.responseSchema?.properties ?? {}).sort()).toEqual([
      'category',
      'issueSummary',
      'priority',
    ]);
  });

  it('asks Gemini for a decision schema with one type per field', async () => {
    const decision = { action: 'propose_refund', reasons: ['Delivered last week.'], citedArticles: [], refundOrderId: 'A-1002' };
    const stub = await aGeminiStub([{ status: 200, text: JSON.stringify(decision) }]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 1, repairAttempts: 0 });

    await model.decide({
      ticket: { email: 'anna@example.com', subject: 'Where is my order?', body: 'Lamp is late' },
      classification: CLASSIFICATION,
      observations: [],
    });

    expect(stub.bodies[0]?.generationConfig?.responseSchema?.properties.refundOrderId).toEqual({ type: 'string' });
  });

  it('returns a decision with no refund order through the real client', async () => {
    const decision = { action: 'reply', reasons: ['The order is on its way.'], citedArticles: ['shipping'] };
    const stub = await aGeminiStub([{ status: 200, text: JSON.stringify(decision) }]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 1, repairAttempts: 0 });

    const answer = await model.decide({
      ticket: { email: 'anna@example.com', subject: 'Where is my order?', body: 'Lamp is late' },
      classification: CLASSIFICATION,
      observations: [],
    });

    expect(answer).toEqual({ ...decision, refundOrderId: null });
  });

  it('returns a reply draft through the real client', async () => {
    const stub = await aGeminiStub([{ status: 200, text: JSON.stringify({ replyDraft: 'Your lamp ships tomorrow.' }) }]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 1, repairAttempts: 0 });

    const answer = await model.draft({
      ticket: { email: 'anna@example.com', subject: 'Where is my order?', body: 'Lamp is late' },
      classification: CLASSIFICATION,
      action: 'reply',
      reasons: ['The order is on its way.'],
      refund: null,
      observations: [],
    });

    expect(answer).toEqual({ replyDraft: 'Your lamp ships tomorrow.' });
  });

  it('stops after the configured attempts when every call fails', async () => {
    const stub = await aGeminiStub([{ status: 500 }, { status: 500 }, { status: 500 }]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 3, repairAttempts: 0 });

    await expect(
      model.classify({ ticket: { email: 'anna@example.com', subject: 'Order', body: 'Late' } }),
    ).rejects.toBeInstanceOf(ModelUnavailableError);
    expect(stub.requests).toHaveLength(3);
  });

  it('repairs an answer without the structured output through the real client', async () => {
    const stub = await aGeminiStub([
      { status: 200, text: 'Sure! The category is order status.' },
      { status: 200, text: JSON.stringify(CLASSIFICATION) },
    ]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 1, repairAttempts: 1 });

    const classification = await model.classify({
      ticket: { email: 'anna@example.com', subject: 'Where is my order?', body: 'Lamp is late' },
    });

    expect(classification).toEqual(CLASSIFICATION);
    expect(stub.requests).toHaveLength(2);
  });

  it('turns a Gemini tool call into the next research step', async () => {
    const stub = await aGeminiStub([
      { status: 200, functionCall: { name: 'get_order', args: { orderId: 'A-1001' } } },
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

  it('offers Gemini the agent tools', async () => {
    const stub = await aGeminiStub([{ status: 200, text: 'Nothing to look up.' }]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 1, repairAttempts: 0 });

    await model.nextStep({
      ticket: { email: 'anna@example.com', subject: 'Where is my order?', body: 'Lamp is late' },
      classification: CLASSIFICATION,
      observations: [],
    });

    expect(stub.bodies[0]?.tools?.[0]?.functionDeclarations.map((tool) => tool.name)).toContain('get_order');
  });

  it('Model call in flight is aborted at the deadline, without a retry', async () => {
    const stub = await aGeminiStub([{ status: 200, hold: true }]);
    server = stub.server;
    const model = aModelOver(stub.baseUrl, { maxAttempts: 3, repairAttempts: 0 });
    const deadline = new AbortController();
    const call = model.classify({ ticket: { email: 'anna@example.com', subject: 'Order', body: 'Late' }, signal: deadline.signal });
    await vi.waitFor(() => expect(stub.requests).toHaveLength(1));

    deadline.abort();

    await expect(call).rejects.toThrow('Model unavailable: the call was aborted');
    expect(stub.requests).toEqual([GENERATE]);
  });
});
