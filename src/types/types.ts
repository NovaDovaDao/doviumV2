// src/types/types.ts
export interface TokenBalance {
  mint: string;
  amount: bigint;
  decimals: number;
}

export interface WalletHoldings {
  address: string;
  tokens: TokenBalance[];
  lastUpdated: Date;
}

export interface TokenChange {
  mint: string;
  oldBalance: bigint;
  newBalance: bigint;
  timestamp: Date;
  decimals: number; // Added decimals to TokenChange interface
}

export interface TokenMetadata {
  mint: string;
  decimals: number;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  details: {
    activeSubscriptions: number;
    cachedWallets: number;
    lastUpdate: Date | null;
    errors: string[];
  };
}

export interface WalletStats {
  totalTokens: number;
  uniqueMints: number;
  lastUpdateAge: number;
  hasActivity: boolean;
}
