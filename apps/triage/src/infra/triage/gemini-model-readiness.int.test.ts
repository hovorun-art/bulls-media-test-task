import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelUnavailableError } from '../../domain/triage/model-unavailable.error';
import { GeminiModelReadiness } from './gemini-model-readiness';

/** A local stand-in for the Gemini models API: GET /v1beta/models/gemini-3.8-flash answers as scripted, any other path 404. */
async function aGeminiAnswering(status: number, body = '{}') {
  const requests: { url?: string; apiKey?: string | string[] }[] = [];
  const server = createServer((request, response) => {
    requests.push({ url: request.url, apiKey: request.headers['x-goog-api-key'] });
    const known = request.method === 'GET' && request.url === '/v1beta/models/gemini-3.8-flash';
    response.writeHead(known ? status : 404, { 'content-type': 'application/json' }).end(known ? body : '{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, requests, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

const readinessOf = (baseUrl: string) => new GeminiModelReadiness({ baseUrl, apiKey: 'test-key', model: 'gemini-3.8-flash' });

describe('GeminiModelReadiness', () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
    server = undefined;
  });

  it('Usable key and model start', async () => {
    const gemini = await aGeminiAnswering(200, '{"name":"models/gemini-3.8-flash"}');
    server = gemini.server;

    await expect(readinessOf(gemini.baseUrl).check()).resolves.toBeUndefined();
    expect(gemini.requests).toEqual([{ url: '/v1beta/models/gemini-3.8-flash', apiKey: 'test-key' }]);
  });

  it.each([400, 401, 403])('Rejected Gemini key does not start (status %i)', async (status) => {
    const gemini = await aGeminiAnswering(status, '{"error":{"message":"API key not valid"}}');
    server = gemini.server;

    await expect(readinessOf(gemini.baseUrl).check()).rejects.toThrow(
      new ModelUnavailableError({ reason: 'the Gemini API key was rejected; check GOOGLE_API_KEY' }),
    );
  });

  it('Unknown Gemini model does not start', async () => {
    const gemini = await aGeminiAnswering(404);
    server = gemini.server;

    await expect(readinessOf(gemini.baseUrl).check()).rejects.toThrow(
      new ModelUnavailableError({ reason: 'the Gemini API does not know the model gemini-3.8-flash; check GEMINI_MODEL' }),
    );
  });

  it('names the address when the Gemini API is not reachable', async () => {
    await expect(readinessOf('http://127.0.0.1:1').check()).rejects.toThrow(
      new ModelUnavailableError({ reason: 'the Gemini API is not reachable at http://127.0.0.1:1' }),
    );
  });

  it('reports an unexpected answer as not usable', async () => {
    const gemini = await aGeminiAnswering(500);
    server = gemini.server;

    await expect(readinessOf(gemini.baseUrl).check()).rejects.toThrow(
      new ModelUnavailableError({ reason: `the Gemini API answered status 500 at ${gemini.baseUrl}` }),
    );
  });
});
