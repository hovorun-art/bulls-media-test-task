import type { Order } from '../orders/order-store';

export interface CheckRefundPolicyRequest {
  order: Order;
}

export interface CheckRefundPolicyResponse {
  eligible: boolean;
  /** Why, in words a support agent reads, e.g. "not delivered". */
  reason: string;
  /** Eligible, but the amount is above the configured limit: a human must decide. */
  overLimit: boolean;
  /** The configured limit for automatic refund proposals, in the order's currency. */
  maxAutoAmount: number;
  amount: number;
  currency: string;
  daysSinceDelivery: number | null;
}

/** Fixed refund rules; the model never decides eligibility. */
export interface RefundPolicy {
  check(req: CheckRefundPolicyRequest): CheckRefundPolicyResponse;
}

export const REFUND_POLICY = Symbol('RefundPolicy');
