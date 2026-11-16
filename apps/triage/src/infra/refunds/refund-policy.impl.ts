import type { Clock } from '@triage/kernel';
import type {
  CheckRefundPolicyRequest,
  CheckRefundPolicyResponse,
  RefundPolicy,
} from '../../domain/refunds/refund-policy';

export interface RefundPolicyImplDeps {
  clock: Clock;
}

export interface RefundPolicyImplParams {
  /** Days after delivery during which a refund can be asked for. */
  windowDays: number;
  /** Eligible amounts above this go to a human instead of being proposed. */
  maxAutoAmount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class RefundPolicyImpl implements RefundPolicy {
  constructor(
    private readonly d: RefundPolicyImplDeps,
    private readonly p: RefundPolicyImplParams,
  ) {}

  check(req: CheckRefundPolicyRequest): CheckRefundPolicyResponse {
    const { order } = req;
    const base = { overLimit: false, maxAutoAmount: this.p.maxAutoAmount, amount: order.total, currency: order.currency };
    if (order.status !== 'delivered' || order.deliveredAt === null) {
      return { ...base, eligible: false, reason: 'not delivered', daysSinceDelivery: null };
    }
    const daysSinceDelivery = Math.floor(
      (this.d.clock.now().instant.getTime() - new Date(order.deliveredAt).getTime()) / DAY_MS,
    );
    if (order.refunded) {
      return { ...base, eligible: false, reason: 'already refunded', daysSinceDelivery };
    }
    if (daysSinceDelivery > this.p.windowDays) {
      return {
        ...base,
        eligible: false,
        reason: `delivered ${daysSinceDelivery} days ago, outside the ${this.p.windowDays}-day window`,
        daysSinceDelivery,
      };
    }
    return {
      ...base,
      eligible: true,
      overLimit: order.total > this.p.maxAutoAmount,
      reason: `delivered ${daysSinceDelivery} days ago, inside the ${this.p.windowDays}-day window`,
      daysSinceDelivery,
    };
  }
}
