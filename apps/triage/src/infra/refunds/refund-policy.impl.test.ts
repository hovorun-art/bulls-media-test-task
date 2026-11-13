import type { Clock } from '@triage/kernel';
import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { Order } from '../../domain/orders/order-store';
import { RefundPolicyImpl } from './refund-policy.impl';

/** Window 30 days, limit 500, clock at 2026-11-13 12:00 UTC. */
function aPolicy() {
  const clock = mockDeep<Clock>();
  clock.now.mockReturnValueOnce({ instant: new Date('2026-11-13T12:00:00.000Z') });
  return new RefundPolicyImpl({ clock }, { windowDays: 30, maxAutoAmount: 500 });
}

const anOrder = (overrides: Partial<Order> = {}): Order => ({
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
  ...overrides,
});

describe('RefundPolicyImpl', () => {
  it('Refund of an undelivered order is not eligible', () => {
    const result = aPolicy().check({ order: anOrder({ status: 'shipped', deliveredAt: null, total: 900 }) });

    expect(result).toEqual({
      eligible: false,
      reason: 'not delivered',
      overLimit: false,
      amount: 900,
      currency: 'USD',
      daysSinceDelivery: null,
    });
  });

  it.each([
    ['delivered without a delivery date', { status: 'delivered', deliveredAt: null }],
    ['cancelled with a delivery date', { status: 'cancelled' }],
  ] as const)('treats an order %s as not delivered', (_case, overrides) => {
    expect(aPolicy().check({ order: anOrder(overrides) }).reason).toBe('not delivered');
  });

  it('accepts a delivered order inside the window and under the limit', () => {
    const result = aPolicy().check({ order: anOrder() });

    expect(result).toEqual({
      eligible: true,
      reason: 'delivered 5 days ago, inside the 30-day window',
      overLimit: false,
      amount: 89,
      currency: 'USD',
      daysSinceDelivery: 5,
    });
  });

  it('counts whole days: 30 days and 23 hours is still inside the window', () => {
    const result = aPolicy().check({ order: anOrder({ deliveredAt: '2026-10-13T13:00:00.000Z' }) });

    expect(result).toMatchObject({ eligible: true, daysSinceDelivery: 30 });
  });

  it('rejects an order delivered 31 days ago', () => {
    const result = aPolicy().check({ order: anOrder({ deliveredAt: '2026-10-13T12:00:00.000Z' }) });

    expect(result).toMatchObject({ eligible: false, reason: 'delivered 31 days ago, outside the 30-day window' });
  });

  it('rejects an order that was already refunded, before looking at the window', () => {
    const result = aPolicy().check({ order: anOrder({ refunded: true, deliveredAt: '2026-01-01T12:00:00.000Z' }) });

    expect(result).toMatchObject({ eligible: false, reason: 'already refunded' });
  });

  it('marks an eligible amount above the limit for a human', () => {
    const result = aPolicy().check({ order: anOrder({ total: 1299 }) });

    expect(result).toMatchObject({ eligible: true, overLimit: true });
  });

  it('keeps an amount exactly at the limit under it', () => {
    expect(aPolicy().check({ order: anOrder({ total: 500 }) }).overLimit).toBe(false);
  });

  it('does not mark an ineligible order as over the limit', () => {
    const result = aPolicy().check({ order: anOrder({ total: 1299, deliveredAt: '2026-01-01T12:00:00.000Z' }) });

    expect(result).toMatchObject({ eligible: false, overLimit: false });
  });
});
