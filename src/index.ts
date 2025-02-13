// src/index.ts

import { WalletTracker } from "./services/walletTracker";
import { config, formatWalletName } from "./config/config";
import type { TokenChange } from "./types/types";

class WalletTrackingApp {
  private readonly walletTracker: WalletTracker;
  private isInitialized = false;
  private shutdownRequested = false;
  private healthCheckInterval?: NodeJS.Timer & {
    [Symbol.dispose]?: () => void;
  };
  private cleanupInterval?: NodeJS.Timer & { [Symbol.dispose]?: () => void };

  constructor(rpcUrl: string) {
    this.walletTracker = new WalletTracker(rpcUrl);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.walletTracker
      .on("changes", this.handleTokenChanges.bind(this))
      .on("error", (error) => console.error("❌ Error:", error))
      .on("subscribed", (address) =>
        console.log(`✅ Subscribed to ${formatWalletName(address)}`)
      )
      .on("unsubscribed", (address) =>
        console.log(`🔌 Unsubscribed from ${formatWalletName(address)}`)
      )
      .on("paused", () => console.log("⏸️ Tracking paused"))
      .on("resumed", () => console.log("▶️ Tracking resumed"))
      .on("shutdown", () => console.log("🛑 Tracker shut down"))
      .on("refreshed", () => console.log("🔄 All holdings refreshed"));
  }

  private handleTokenChanges(
    walletAddress: string,
    changes: TokenChange[]
  ): void {
    const wallet = config.wallets.find((w) => w.address === walletAddress);
    const walletIdentifier = wallet
      ? `${wallet.emoji} ${wallet.name}`
      : `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

    console.log(`\n🔄 Changes detected for ${walletIdentifier}:`);

    changes.forEach((change) => {
      const changeAmount = change.newBalance - change.oldBalance;
      const action = changeAmount > BigInt(0) ? "📥 received" : "📤 sent";
      const absChange = changeAmount > BigInt(0) ? changeAmount : -changeAmount;

      // Format amounts considering decimals
      const formatAmount = (amount: bigint, decimals: number): string => {
        const amountStr = amount.toString().padStart(decimals + 1, "0");
        const decimalPoint = amountStr.length - decimals;
        const beforeDecimal = amountStr.slice(0, decimalPoint) || "0";
        const afterDecimal = amountStr.slice(decimalPoint);
        return `${beforeDecimal}.${afterDecimal}`;
      };

      console.log(`${wallet?.emoji || "👤"} Token ${change.mint}:`);
      console.log(
        `  ${action} ${formatAmount(absChange, change.decimals)} tokens`
      );
      console.log(
        `  New balance: ${formatAmount(change.newBalance, change.decimals)}`
      );
      console.log(`  Time: ${change.timestamp.toISOString()}`);
      console.log(
        `  ${config.settings.inspect_name}: ${config.settings.inspect_url}${change.mint}`
      );
    });
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log("Application is already initialized");
      return;
    }

    try {
      console.log("🚀 Initializing wallet tracking application...");

      // Validate wallets configuration
      const uniqueAddresses = new Set(config.wallets.map((w) => w.address));
      if (uniqueAddresses.size !== config.wallets.length) {
        console.warn(
          "⚠️ Warning: Duplicate wallet addresses found in configuration"
        );
      }

      // Subscribe to all configured wallets
      await Promise.all(
        Array.from(uniqueAddresses).map((address) =>
          this.walletTracker.setupWebSocketSubscription(address, (changes) =>
            this.handleTokenChanges(address, changes)
          )
        )
      );

      // Set up health check interval
      this.setupHealthCheck();

      // Set up cleanup interval
      this.setupCleanupInterval();

      this.isInitialized = true;
      console.log("✨ Wallet tracking application initialized successfully");
      this.printStatus();
    } catch (error) {
      console.error("❌ Failed to initialize wallet tracking:", error);
      throw error;
    }
  }

  private setupHealthCheck(): void {
    const interval = setInterval(async () => {
      if (this.shutdownRequested) return;

      try {
        const health = await this.walletTracker.checkHealth();
        if (health.status !== "healthy") {
          console.warn("⚠️ Health check warning:", health.details);

          if (health.status === "unhealthy") {
            await this.handleUnhealthyState();
          }
        }
      } catch (error) {
        console.error("❌ Health check failed:", error);
      }
    }, 60000); // Check every minute

    // Add Symbol.dispose
    interval[Symbol.dispose] = () => clearInterval(interval);
    this.healthCheckInterval = interval;
  }

  private async handleUnhealthyState(): Promise<void> {
    try {
      console.log("🔄 Attempting to recover from unhealthy state...");

      // Pause tracking
      await this.walletTracker.pauseTracking();

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Resume tracking
      await this.walletTracker.resumeTracking();

      // Refresh all holdings
      await this.walletTracker.refreshAllHoldings();

      console.log("✅ Recovery attempt completed");
    } catch (error) {
      console.error("❌ Recovery attempt failed:", error);
    }
  }

  private setupCleanupInterval(): void {
    const interval = setInterval(async () => {
      if (this.shutdownRequested) return;

      try {
        const metrics = this.walletTracker.getMetrics();
        console.log("\n🧹 Performing daily cleanup...");
        console.log(
          `Active subscriptions: ${metrics.usage.activeSubscriptions}`
        );
        console.log(
          `Success rate: ${(metrics.performance.successRate * 100).toFixed(2)}%`
        );
        console.log(`Error count: ${metrics.performance.errorCount}`);
      } catch (error) {
        console.error("❌ Cleanup failed:", error);
      }
    }, 24 * 60 * 60 * 1000); // Run every 24 hours

    // Add Symbol.dispose
    interval[Symbol.dispose] = () => clearInterval(interval);
    this.cleanupInterval = interval;
  }

  public printStatus(): void {
    const metrics = this.walletTracker.getMetrics();

    console.log("\n📊 Current Status:");
    console.log(`Active Subscriptions: ${metrics.usage.activeSubscriptions}`);
    console.log(`Total Updates: ${metrics.usage.totalUpdates}`);
    console.log(
      `Average Latency: ${metrics.performance.updateLatency.toFixed(2)}ms`
    );
    console.log(
      `Success Rate: ${(metrics.performance.successRate * 100).toFixed(2)}%`
    );
    console.log(`Error Count: ${metrics.performance.errorCount}`);
  }

  public async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    console.log("\n🛑 Shutting down wallet tracking application...");
    this.shutdownRequested = true;

    try {
      // Clear intervals using Symbol.dispose
      this.healthCheckInterval?.[Symbol.dispose]?.();
      this.cleanupInterval?.[Symbol.dispose]?.();

      // Shutdown tracker
      await this.walletTracker.shutdown();

      this.isInitialized = false;
      console.log("👋 Application shut down successfully");
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
      throw error;
    }
  }
}

// Helper function to handle process shutdown
function handleProcessShutdown(
  app: WalletTrackingApp
): (signal: string) => Promise<void> {
  return async (signal: string) => {
    console.log(`\n\nReceived ${signal}. Starting graceful shutdown...`);
    try {
      await app.shutdown();
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  };
}

// Main entry point
async function main() {
  const rpcUrl = process.env.HELIUS_RPC_URL;
  if (!rpcUrl) {
    throw new Error("HELIUS_RPC_URL environment variable is required");
  }

  const app = new WalletTrackingApp(rpcUrl);

  // Handle shutdown signals
  const shutdownHandler = handleProcessShutdown(app);
  process.on("SIGINT", () => shutdownHandler("SIGINT"));
  process.on("SIGTERM", () => shutdownHandler("SIGTERM"));

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    shutdownHandler("uncaughtException");
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    shutdownHandler("unhandledRejection");
  });

  // Set up command line interface
  if (process.stdin.isTTY) {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", async (data) => {
      const command = data.trim().toLowerCase();

      try {
        switch (command) {
          case "status":
            app.printStatus();
            break;
          case "help":
            console.log("\n📚 Available commands:");
            console.log("  status  - Show current tracking status");
            console.log("  help    - Show this help message");
            console.log("  exit    - Shutdown application\n");
            break;
          case "exit":
            await app.shutdown();
            process.exit(0);
            break;
          default:
            if (command) {
              console.log(
                'Unknown command. Type "help" for available commands.'
              );
            }
        }
      } catch (error) {
        console.error("Error executing command:", error);
      }
    });

    console.log(
      '\n🎮 Interactive mode enabled. Type "help" for available commands.\n'
    );
  }

  // Initialize the application
  try {
    await app.initialize();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Start the application if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export default WalletTrackingApp;
