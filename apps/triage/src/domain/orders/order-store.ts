export type OrderStatus = 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  email: string;
  status: OrderStatus;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  currency: string;
  placedAt: string;
  deliveredAt: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  refunded: boolean;
}

export interface FindForCustomerOrderStoreRequest {
  orderId: string;
  email: string;
}

export interface FindForCustomerOrderStoreResponse {
  /** null when the order does not exist or belongs to another email: the two cases look the same. */
  order: Order | null;
}

export interface OrderStore {
  findForCustomer(req: FindForCustomerOrderStoreRequest): Promise<FindForCustomerOrderStoreResponse>;
}

export const ORDER_STORE = Symbol('OrderStore');
