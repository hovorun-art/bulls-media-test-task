import { HealthSchema } from '@triage/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TriageUnderTest } from './triage-under-test';

describe('service', () => {
  const service = new TriageUnderTest();

  beforeAll(() => service.start());
  afterAll(() => service.stop());

  it('reports its health', async () => {
    const response = await service.get('/api/health');

    expect(response.status).toBe(200);
    expect(HealthSchema.parse(await response.json())).toEqual({ status: 'ok' });
  });

  it('answers an unknown route with 404 NOT_FOUND', async () => {
    const response = await service.get('/api/nothing');

    expect(await service.errorOf(response, 404)).toEqual({
      code: 'NOT_FOUND',
      message: 'Cannot GET /api/nothing',
      details: {},
    });
  });
});

describe('start-up', () => {
  const service = new TriageUnderTest();

  afterEach(() => service.stop());

  it('does not start when the model is not reachable', async () => {
    await expect(service.start({ modelReady: false })).rejects.toThrow('Model unavailable: Ollama is not reachable');
  });
});
