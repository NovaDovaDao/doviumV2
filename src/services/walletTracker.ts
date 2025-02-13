// src/services/walletTracker.ts

import { Connection, PublicKey } from "@solana/web3.js";
import type { ParsedAccountData } from "@solana/web3.js";
import { EventEmitter } from "events";
import type {
  TokenBalance,
  WalletHoldings,
  TokenChange,
  TokenMetadata,
  HealthStatus,
  WalletStats,
} from "../types/types";
import { config, formatWalletName } from "../config/config";

export class WalletTracker extends EventEmitter {
  private readonly connection: Connection;
  private readonly holdingsCache: Map<string, WalletHoldings>;
  private readonly subscriptions: Map<string, number>;
  private readonly eventHandlers: Map<
    string,
    Set<(changes: TokenChange[]) => void>
  >;
  private readonly tokenMetadataCache: Map<string, TokenMetadata>;
  private readonly updateLatencies: number[] = [];
  private isPaused = false;
  private updateCount = 0;
  private errorCount = 0;

  constructor(rpcUrl: string) {
    super();
    this.connection = new Connection(rpcUrl, "confirmed");
    this.holdingsCache = new Map();
    this.subscriptions = new Map();
    this.eventHandlers = new Map();
    this.tokenMetadataCache = new Map();
  }

  private async getTokenAccounts(
    walletAddress: string
  ): Promise<TokenBalance[]> {
    try {
      const pubkey = new PublicKey(walletAddress);
      const accounts = await this.connection.getParsedTokenAccountsByOwner(
        pubkey,
        {
          programId: new PublicKey(
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
          ),
        }
      );

      return accounts.value.map((account) => {
        const parsedData = account.account.data.parsed as ParsedAccountData;
        const tokenData = parsedData.info;
        return {
          mint: tokenData.mint,
          amount: BigInt(tokenData.tokenAmount.amount),
          decimals: tokenData.tokenAmount.decimals,
        };
      });
    } catch (error) {
      this.emit(
        "error",
        `Error fetching token accounts for ${formatWalletName(
          walletAddress
        )}: ${error}`
      );
      return [];
    }
  }

  public async setupWebSocketSubscription(
    walletAddress: string,
    callback: (changes: TokenChange[]) => void
  ): Promise<void> {
    if (!this.validateAddress(walletAddress)) {
      throw new Error("Invalid wallet address");
    }

    if (this.subscriptions.has(walletAddress)) {
      const handlers = this.eventHandlers.get(walletAddress) ?? new Set();
      handlers.add(callback);
      this.eventHandlers.set(walletAddress, handlers);
      return;
    }

    try {
      const pubkey = new PublicKey(walletAddress);
      const handlers = new Set([callback]);
      this.eventHandlers.set(walletAddress, handlers);

      const subscriptionId = this.connection.onAccountChange(
        pubkey,
        async () => {
          try {
            const startTime = Date.now();
            const changes = await this.updateWalletHoldings(walletAddress);
            this.updateLatencies.push(Date.now() - startTime);

            if (changes.length > 0) {
              const currentHandlers = this.eventHandlers.get(walletAddress);
              currentHandlers?.forEach((handler) => handler(changes));
              this.emit("changes", walletAddress, changes);
            }

            this.updateCount++;
          } catch (error) {
            this.errorCount++;
            this.emit("error", `Error processing wallet update: ${error}`);
          }
        },
        "confirmed"
      );

      this.subscriptions.set(walletAddress, subscriptionId);
      await this.updateWalletHoldings(walletAddress);
      this.emit("subscribed", walletAddress);
    } catch (error) {
      this.emit("error", `Failed to setup subscription: ${error}`);
      throw error;
    }
  }

  public async updateWalletHoldings(
    walletAddress: string
  ): Promise<TokenChange[]> {
    const tokens = await this.getTokenAccounts(walletAddress);
    const previousHoldings = this.holdingsCache.get(walletAddress);
    const changes: TokenChange[] = [];

    const currentHoldings: WalletHoldings = {
      address: walletAddress,
      tokens,
      lastUpdated: new Date(),
    };

    if (previousHoldings) {
      this.detectChanges(previousHoldings.tokens, tokens, changes);
    } else {
      // If no previous holdings, treat all current tokens as new
      tokens.forEach((token) => {
        changes.push({
          mint: token.mint,
          oldBalance: BigInt(0),
          newBalance: token.amount,
          decimals: token.decimals,
          timestamp: new Date(),
        });
      });
    }

    this.holdingsCache.set(walletAddress, currentHoldings);
    return changes;
  }

  private detectChanges(
    previousTokens: TokenBalance[],
    currentTokens: TokenBalance[],
    changes: TokenChange[]
  ): void {
    const timestamp = new Date();

    // Check for new or updated tokens
    for (const currentToken of currentTokens) {
      const previousToken = previousTokens.find(
        (t) => t.mint === currentToken.mint
      );
      if (!previousToken || previousToken.amount !== currentToken.amount) {
        changes.push({
          mint: currentToken.mint,
          oldBalance: previousToken?.amount ?? BigInt(0),
          newBalance: currentToken.amount,
          decimals: currentToken.decimals,
          timestamp,
        });
      }
    }

    // Check for removed tokens
    for (const previousToken of previousTokens) {
      if (!currentTokens.some((t) => t.mint === previousToken.mint)) {
        changes.push({
          mint: previousToken.mint,
          oldBalance: previousToken.amount,
          newBalance: BigInt(0),
          decimals: previousToken.decimals,
          timestamp,
        });
      }
    }
  }

  public async checkHealth(): Promise<HealthStatus> {
    const errors: string[] = [];
    let lastUpdate: Date | null = null;

    try {
      await this.connection.getSlot();

      for (const holdings of this.holdingsCache.values()) {
        if (!lastUpdate || holdings.lastUpdated > lastUpdate) {
          lastUpdate = holdings.lastUpdated;
        }
      }

      if (lastUpdate && Date.now() - lastUpdate.getTime() > 5 * 60 * 1000) {
        errors.push("Some wallet data may be stale");
      }

      // Check subscription health
      const activeSubscriptions = this.subscriptions.size;
      const expectedSubscriptions = this.eventHandlers.size;
      if (activeSubscriptions !== expectedSubscriptions) {
        errors.push(
          `Subscription mismatch: ${activeSubscriptions}/${expectedSubscriptions}`
        );
      }
    } catch (error) {
      errors.push(
        `Connection error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return {
      status:
        errors.length === 0
          ? "healthy"
          : errors.length < 2
          ? "degraded"
          : "unhealthy",
      details: {
        activeSubscriptions: this.subscriptions.size,
        cachedWallets: this.holdingsCache.size,
        lastUpdate,
        errors,
      },
    };
  }

  public async removeSubscription(walletAddress: string): Promise<void> {
    const subscriptionId = this.subscriptions.get(walletAddress);
    if (!subscriptionId) return;

    try {
      await this.connection.removeAccountChangeListener(subscriptionId);
      this.subscriptions.delete(walletAddress);
      this.eventHandlers.delete(walletAddress);
      this.holdingsCache.delete(walletAddress);
      this.emit("unsubscribed", walletAddress);
    } catch (error) {
      this.emit("error", `Error removing subscription: ${error}`);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    try {
      await Promise.all(
        Array.from(this.subscriptions.entries()).map(([address, id]) =>
          this.connection.removeAccountChangeListener(id)
        )
      );

      this.subscriptions.clear();
      this.eventHandlers.clear();
      this.holdingsCache.clear();
      this.tokenMetadataCache.clear();
      this.updateLatencies.length = 0;
      this.emit("shutdown");
    } catch (error) {
      this.emit("error", `Error during shutdown: ${error}`);
      throw error;
    }
  }

  public async pauseTracking(): Promise<void> {
    if (this.isPaused) return;

    try {
      const subscriptions = Array.from(this.subscriptions.entries());
      for (const [address, id] of subscriptions) {
        await this.connection.removeAccountChangeListener(id);
        this.subscriptions.delete(address);
      }
      this.isPaused = true;
      this.emit("paused");
    } catch (error) {
      this.emit("error", `Error pausing tracking: ${error}`);
      throw error;
    }
  }

  public async resumeTracking(): Promise<void> {
    if (!this.isPaused) return;

    try {
      const addresses = Array.from(this.holdingsCache.keys());
      for (const address of addresses) {
        const handlers = this.eventHandlers.get(address);
        if (handlers) {
          for (const handler of handlers) {
            await this.setupWebSocketSubscription(address, handler);
          }
        }
      }
      this.isPaused = false;
      this.emit("resumed");
    } catch (error) {
      this.emit("error", `Error resuming tracking: ${error}`);
      throw error;
    }
  }

  private validateAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  public getWalletStats(address: string): WalletStats | undefined {
    const holdings = this.holdingsCache.get(address);
    if (!holdings) return undefined;

    return {
      totalTokens: holdings.tokens.length,
      uniqueMints: new Set(holdings.tokens.map((t) => t.mint)).size,
      lastUpdateAge: Date.now() - holdings.lastUpdated.getTime(),
      hasActivity: holdings.tokens.some((t) => t.amount > BigInt(0)),
    };
  }

  public async refreshAllHoldings(): Promise<void> {
    try {
      const refreshPromises = Array.from(this.holdingsCache.keys()).map(
        async (address) => {
          try {
            const changes = await this.updateWalletHoldings(address);
            if (changes.length > 0) {
              const handlers = this.eventHandlers.get(address);
              handlers?.forEach((handler) => handler(changes));
              this.emit("changes", address, changes);
            }
          } catch (error) {
            this.emit(
              "error",
              `Error refreshing holdings for ${formatWalletName(
                address
              )}: ${error}`
            );
          }
        }
      );

      await Promise.all(refreshPromises);
      this.emit("refreshed");
    } catch (error) {
      this.emit("error", `Error refreshing holdings: ${error}`);
      throw error;
    }
  }

  public getMetrics(): {
    performance: {
      updateLatency: number;
      successRate: number;
      errorCount: number;
    };
    usage: {
      totalUpdates: number;
      activeSubscriptions: number;
    };
  } {
    const avgLatency =
      this.updateLatencies.length > 0
        ? this.updateLatencies.reduce((a, b) => a + b, 0) /
          this.updateLatencies.length
        : 0;

    return {
      performance: {
        updateLatency: avgLatency,
        successRate:
          this.updateCount > 0
            ? (this.updateCount - this.errorCount) / this.updateCount
            : 1,
        errorCount: this.errorCount,
      },
      usage: {
        totalUpdates: this.updateCount,
        activeSubscriptions: this.subscriptions.size,
      },
    };
  }

  public getBalance(
    walletAddress: string,
    tokenMint: string
  ): bigint | undefined {
    const holdings = this.holdingsCache.get(walletAddress);
    if (!holdings) return undefined;

    const token = holdings.tokens.find((t) => t.mint === tokenMint);
    return token?.amount;
  }
}

export default WalletTracker;
