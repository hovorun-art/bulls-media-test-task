import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelUnavailableError } from '../../domain/triage/model-unavailable.error';
import { OllamaModelReadiness } from './ollama-model-readiness';

/** A local stand-in for Ollama's GET /api/tags listing the given models. */
async function anOllamaWithModels(names: string[]) {
  return anOllamaAnswering(200, JSON.stringify({ models: names.map((name) => ({ name })) }));
}

async function anOllamaAnswering(status: number, body: string) {
  const server = createServer((_request, response) => {
    response.writeHead(status, { 'content-type': 'application/json' }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe('OllamaModelReadiness', () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
    server = undefined;
  });

  it('passes when the model is pulled', async () => {
    const ollama = await anOllamaWithModels(['llama3:8b', 'qwen3:8b']);
    server = ollama.server;

    await expect(new OllamaModelReadiness({ baseUrl: ollama.baseUrl, model: 'qwen3:8b' }).check()).resolves.toBeUndefined();
  });

  it('names the pull command when the model is missing', async () => {
    const ollama = await anOllamaWithModels(['llama3:8b']);
    server = ollama.server;

    await expect(new OllamaModelReadiness({ baseUrl: ollama.baseUrl, model: 'qwen3:8b' }).check()).rejects.toThrow(
      new ModelUnavailableError({ reason: 'model qwen3:8b is not pulled; run `ollama pull qwen3:8b`' }),
    );
  });

  it('names the address when Ollama is not running', async () => {
    const readiness = new OllamaModelReadiness({ baseUrl: 'http://127.0.0.1:1', model: 'qwen3:8b' });

    await expect(readiness.check()).rejects.toThrow(
      new ModelUnavailableError({ reason: 'Ollama is not reachable at http://127.0.0.1:1; start it with `ollama serve`' }),
    );
  });

  it.each([
    ['an empty list', []],
    ['only another tag of the model', ['qwen3:latest']],
  ])('reports the model as not pulled when Ollama lists %s', async (_case, names) => {
    const ollama = await anOllamaWithModels(names);
    server = ollama.server;

    await expect(new OllamaModelReadiness({ baseUrl: ollama.baseUrl, model: 'qwen3:8b' }).check()).rejects.toThrow(
      new ModelUnavailableError({ reason: 'model qwen3:8b is not pulled; run `ollama pull qwen3:8b`' }),
    );
  });

  it('reports an unexpected answer as Ollama not reachable', async () => {
    const ollama = await anOllamaAnswering(500, '{"error":"internal"}');
    server = ollama.server;

    await expect(new OllamaModelReadiness({ baseUrl: ollama.baseUrl, model: 'qwen3:8b' }).check()).rejects.toThrow(
      new ModelUnavailableError({ reason: `Ollama is not reachable at ${ollama.baseUrl}; start it with \`ollama serve\`` }),
    );
  });
});
