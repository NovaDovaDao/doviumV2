import { PublicKey } from '@solana/web3.js';

export interface SwapQuote {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: bigint;
  expectedOutputAmount: bigint;
  slippage: number;
  priceImpact: number;
}

export interface Order {
  id: string;
  owner: PublicKey;
  inputToken: PublicKey;
  outputToken: PublicKey;
  inputAmount: bigint;
  outputAmount: bigint;
  type: 'limit' | 'market';
  status: 'open' | 'filled' | 'cancelled';
  timestamp: number;
}

export interface TrustScore {
  tokenAddress: PublicKey;
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  lastUpdated: number;
  factors: {
    liquidityScore: number;
    holdersScore: number;
    volatilityScore: number;
    socialScore: number;
  };
}
