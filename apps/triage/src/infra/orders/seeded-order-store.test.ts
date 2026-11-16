import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clock } from '@triage/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { SeededOrderStore } from './seeded-order-store';

const aSeedOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'A-1002',
  email: 'anna@example.com',
  status: 'delivered',
  items: [{ name: 'Headphones', quantity: 1, price: 89 }],
  total: 89,
  currency: 'USD',
  placedDaysAgo: 12,
  deliveredDaysAgo: 5,
  carrier: 'DHL',
  trackingNumber: 'JD1',
  refunded: false,
  ...overrides,
});

/** Holds the seed files the tests write; removed after the file. */
let temporaryRoot = '';

/** A store over a seed file of the given orders, with the clock at 2026-11-13 12:00 UTC. */
function aStoreOf(orders: unknown[]) {
  const seedPath = join(mkdtempSync(join(temporaryRoot, 'orders-')), 'orders.json');
  writeFileSync(seedPath, JSON.stringify(orders));
  const clock = mockDeep<Clock>();
  clock.now.mockReturnValueOnce({ instant: new Date('2026-11-13T12:00:00.000Z') });
  return new SeededOrderStore({ clock }, { seedPath });
}

describe('SeededOrderStore', () => {
  beforeAll(() => {
    temporaryRoot = mkdtempSync(join(tmpdir(), 'orders-tests-'));
  });

  afterAll(() => {
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it('Order of another customer is not found', async () => {
    const store = aStoreOf([aSeedOrder({ email: 'anna@example.com' })]);

    const { order } = await store.findForCustomer({ orderId: 'A-1002', email: 'ben@example.com' });

    expect(order).toBeNull();
  });

  it('reports an unknown order id as not found', async () => {
    const store = aStoreOf([aSeedOrder({ id: 'A-1002' })]);

    const { order } = await store.findForCustomer({ orderId: 'Z-9999', email: 'anna@example.com' });

    expect(order).toBeNull();
  });

  it('matches the order id and the email ignoring case', async () => {
    const store = aStoreOf([aSeedOrder({ id: 'A-1002', email: 'anna@example.com' })]);

    const { order } = await store.findForCustomer({ orderId: 'a-1002', email: 'Anna@Example.com' });

    expect(order?.id).toBe('A-1002');
  });

  it('turns "days ago" into dates relative to the clock', async () => {
    const store = aStoreOf([aSeedOrder({ placedDaysAgo: 12, deliveredDaysAgo: 5 })]);

    const { order } = await store.findForCustomer({ orderId: 'A-1002', email: 'anna@example.com' });

    expect(order).toEqual({
      id: 'A-1002',
      email: 'anna@example.com',
      status: 'delivered',
      items: [{ name: 'Headphones', quantity: 1, price: 89 }],
      total: 89,
      currency: 'USD',
      placedAt: '2026-11-01T12:00:00.000Z',
      deliveredAt: '2026-11-08T12:00:00.000Z',
      carrier: 'DHL',
      trackingNumber: 'JD1',
      refunded: false,
    });
  });

  it('keeps no delivery date for an order not delivered yet', async () => {
    const store = aStoreOf([aSeedOrder({ status: 'shipped', deliveredDaysAgo: null })]);

    const { order } = await store.findForCustomer({ orderId: 'A-1002', email: 'anna@example.com' });

    expect(order?.deliveredAt).toBeNull();
  });
});
