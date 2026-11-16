import { type APIRequestContext, expect, test } from '@playwright/test';
import { compose, startStack } from './stack';

// The second test needs the run the first one stores, and a run on the real model takes minutes.
test.describe.configure({ mode: 'serial' });

const SUBJECT = 'Refund for my headphones';

async function runIdsWithSubject(request: APIRequestContext, subject: string): Promise<string[]> {
  const { runs } = (await (await request.get('/api/runs')).json()) as { runs: { id: string; subject: string }[] };
  return runs.filter((run) => run.subject === subject).map((run) => run.id);
}

test('A ticket is triaged from the web UI with the real model', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await page.goto('/');
  await page.getByLabel('Sample ticket').selectOption({ label: 'Refund inside the window' });

  await page.getByRole('button', { name: 'Triage ticket' }).click();

  const summary = page.getByRole('heading', { name: 'Summary' }).locator('xpath=following-sibling::p[1]');
  await expect(summary).toHaveText(/\S/, { timeout: 15 * 60_000 });
  await expect(page.getByRole('button', { name: new RegExp(SUBJECT) })).toHaveAttribute('aria-current', 'true');
});

test('Run is still listed after the stack is recreated', async ({ request }) => {
  test.setTimeout(10 * 60_000);
  const before = await runIdsWithSubject(request, SUBJECT);
  expect(before).toHaveLength(1);

  compose('down');
  startStack();

  expect(await runIdsWithSubject(request, SUBJECT)).toEqual(before);
});
