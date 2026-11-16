import { readFileSync } from 'node:fs';
import type { Clock } from '@triage/kernel';
import type {
  FindForCustomerOrderStoreRequest,
  FindForCustomerOrderStoreResponse,
  Order,
  OrderStore,
} from '../../domain/orders/order-store';

/** A seed order keeps its dates as "days ago", so the demo data never ages. */
interface SeedOrder extends Omit<Order, 'placedAt' | 'deliveredAt'> {
  placedDaysAgo: number;
  deliveredDaysAgo: number | null;
}

export interface SeededOrderStoreDeps {
  clock: Clock;
}

export interface SeededOrderStoreParams {
  seedPath: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mock of the shop's order system, read from a JSON seed. */
export class SeededOrderStore implements OrderStore {
  private readonly seed: SeedOrder[];

  constructor(
    private readonly d: SeededOrderStoreDeps,
    p: SeededOrderStoreParams,
  ) {
    this.seed = JSON.parse(readFileSync(p.seedPath, 'utf8')) as SeedOrder[];
  }

  async findForCustomer(req: FindForCustomerOrderStoreRequest): Promise<FindForCustomerOrderStoreResponse> {
    const found = this.seed.find(
      (order) =>
        order.id.toLowerCase() === req.orderId.toLowerCase() && order.email.toLowerCase() === req.email.toLowerCase(),
    );
    return { order: found ? this.withDates(found) : null };
  }

  private withDates(seed: SeedOrder): Order {
    const now = this.d.clock.now().instant.getTime();
    const { placedDaysAgo, deliveredDaysAgo, ...order } = seed;
    return {
      ...order,
      placedAt: new Date(now - placedDaysAgo * DAY_MS).toISOString(),
      deliveredAt: deliveredDaysAgo === null ? null : new Date(now - deliveredDaysAgo * DAY_MS).toISOString(),
    };
  }
}
