// src/types/trading.ts

import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export type TradeMode = 'yolo' | 'marry' | 'normal' | 'simulation';

export interface TradeConfig {
  mode: TradeMode;
  slippageTolerance: number;
  retryAttempts: number;
  retryDelay: number;
  minLiquidity: number;
  gasBuffer: number;
  waitTimeBeforeBuy: number;
  waitTimeBeforeSell: number;
  takeProfit: number;
  stopLoss: number;
}

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  bondingCurve: string;
  associatedTokenAccount?: string;
}

export interface TradePosition {
  token: TokenMetadata;
  entryPrice: number;
  amount: number;
  timestamp: number;
  slippage: number;
  status: TradeStatus;
}

export interface BondingCurveState {
  virtualTokenReserves: BN;
  virtualSolReserves: BN;
  realTokenReserves: BN;
  realSolReserves: BN;
  tokenTotalSupply: BN;
  complete: boolean;
}

export interface TradeResult {
  success: boolean;
  txId?: string;
  error?: string;
  price?: number;
  amount?: number;
}

export interface TokenEvent {
  type: 'create' | 'transfer' | 'burn';
  mint: string;
  timestamp: number;
  data: any;
}

export type TradeStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface TradingError {
  code: string;
  message: string;
  details?: any;
}

export interface TradeMetrics {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  profitLoss: number;
  averageReturnPercentage: number;
  winRate: number;
}

export interface PriceData {
  price: number;
  timestamp: number;
  liquidity: number;
  virtualReserves: {
    token: BN;
    sol: BN;
  };
}

export interface totalPnLStats {
  profitLoss: {
    total: number;
    realized: number;
    unrealized: number;
  };
  trades: {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  performance: {
    bestTrade: number;
    worstTrade: number;
    averageReturn: number;
  };
}