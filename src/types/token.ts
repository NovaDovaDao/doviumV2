import { PublicKey } from '@solana/web3.js';

export interface TokenMetadata {
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  decimals: number;
}

export interface TokenBalance {
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
  decimals: number;
}

export interface TokenInfo {
  address: PublicKey;
  metadata: TokenMetadata;
  supply: bigint;
  price?: number;
  marketCap?: number;
}
