// src/services/types/events.ts
export interface TradeEvents {
  'trade': (info: TradeInfo) => void;
  'error': (error: Error) => void;
  'status': (status: string) => void;
  'warning': (message: string) => void;
  'skip': (reason: string) => void;
}

export interface TradeInfo {
  type: 'buy' | 'sell';
  mint: string;
  price: number;
  amount: number;
  txId?: string;
  profit?: number;
}