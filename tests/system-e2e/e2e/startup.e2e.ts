import { expect, test } from '@playwright/test';
import { containerState, TRIAGE_URL } from './stack';

test('Web UI and service answer after compose up', async ({ page, request }) => {
  await page.goto('/');
  const health = await request.get(`${TRIAGE_URL}/api/health`);

  await expect(page.getByRole('heading', { name: 'Support triage agent' })).toBeVisible();
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });
});

test('Web UI reaches the service through its own origin', async ({ request }) => {
  const health = await request.get('/api/health');

  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });
});

test('Model is pulled on start', () => {
  const pull = containerState('ollama-pull');

  expect(pull).toBe('exited 0');
});
