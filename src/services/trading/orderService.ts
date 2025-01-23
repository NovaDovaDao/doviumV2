import { PublicKey } from '@solana/web3.js';
import { Order } from '../../types/trading';
import { v4 as uuidv4 } from 'uuid';

export class OrderService {
  private orders: Map<string, Order>;

  constructor() {
    this.orders = new Map();
  }

  createOrder(
    owner: PublicKey,
    inputToken: PublicKey,
    outputToken: PublicKey,
    inputAmount: bigint,
    outputAmount: bigint,
    type: 'limit' | 'market'
  ): Order {
    const order: Order = {
      id: uuidv4(),
      owner,
      inputToken,
      outputToken,
      inputAmount,
      outputAmount,
      type,
      status: 'open',
      timestamp: Date.now()
    };

    this.orders.set(order.id, order);
    return order;
  }

  getOrder(id: string): Order | undefined {
    return this.orders.get(id);
  }

  getOrdersByOwner(owner: PublicKey): Order[] {
    return Array.from(this.orders.values())
      .filter(order => order.owner.equals(owner));
  }

  cancelOrder(id: string): boolean {
    const order = this.orders.get(id);
    if (order && order.status === 'open') {
      order.status = 'cancelled';
      this.orders.set(id, order);
      return true;
    }
    return false;
  }
}
