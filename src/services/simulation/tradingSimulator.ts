import { PublicKey } from '@solana/web3.js';
import { BondingCurveAccount } from '../pumpfun/bondingCurveAccount';
import { AMM } from '../pumpfun/amm';
import { Logger } from '../../utils/logger';

interface SimulationTrade {
  type: 'BUY' | 'SELL';
  tokenAmount: bigint;
  solAmount: bigint;
  price: number;
  timestamp: number;
}

interface SimulationPosition {
  tokenAmount: bigint;
  averageEntryPrice: number;
  totalCost: bigint;
}

export class TradingSimulator {
  private logger: Logger;
  private positions: Map<string, SimulationPosition>;
  private trades: Map<string, SimulationTrade[]>;
  private initialBalance: bigint;
  private currentBalance: bigint;
  private totalPnL: number = 0;

  constructor(initialBalanceSOL: number = 1) {
    this.logger = new Logger();
    this.positions = new Map();
    this.trades = new Map();
    this.initialBalance = BigInt(initialBalanceSOL * 1e9); // Convert SOL to lamports
    this.currentBalance = this.initialBalance;
  }

  async simulateBuy(
    mint: PublicKey,
    bondingCurve: BondingCurveAccount,
    solAmount: bigint,
    initialVirtualTokenReserves: bigint
  ): Promise<boolean> {
    const mintStr = mint.toString();
    
    try {
      // Create AMM instance for price calculation
      const amm = AMM.fromBondingCurveAccount(bondingCurve, initialVirtualTokenReserves);
      
      // Check if we have enough balance
      if (solAmount > this.currentBalance) {
        this.logger.warn(`Insufficient balance for buy. Required: ${solAmount}, Available: ${this.currentBalance}`);
        return false;
      }

      // Calculate token amount we'll receive
      const buyResult = amm.applyBuy(amm.getBuyPrice(solAmount));
      const price = Number(buyResult.sol_amount) / Number(buyResult.token_amount);

      // Record the trade
      const trade: SimulationTrade = {
        type: 'BUY',
        tokenAmount: buyResult.token_amount,
        solAmount: buyResult.sol_amount,
        price,
        timestamp: Date.now()
      };

      // Update position
      const currentPosition = this.positions.get(mintStr) || {
        tokenAmount: 0n,
        averageEntryPrice: 0,
        totalCost: 0n
      };

      const newPosition = {
        tokenAmount: currentPosition.tokenAmount + buyResult.token_amount,
        averageEntryPrice: (Number(currentPosition.totalCost + buyResult.sol_amount) / 
                           Number(currentPosition.tokenAmount + buyResult.token_amount)),
        totalCost: currentPosition.totalCost + buyResult.sol_amount
      };

      // Update balances
      this.currentBalance -= buyResult.sol_amount;
      this.positions.set(mintStr, newPosition);
      
      // Record trade
      const tokenTrades = this.trades.get(mintStr) || [];
      tokenTrades.push(trade);
      this.trades.set(mintStr, tokenTrades);

      this.logger.info(`[SIMULATION] Buy executed`, {
        mint: mintStr,
        solAmount: Number(buyResult.sol_amount) / 1e9,
        tokenAmount: Number(buyResult.token_amount) / 1e6,
        price: price,
        currentBalance: Number(this.currentBalance) / 1e9
      });

      return true;

    } catch (error) {
      this.logger.error(`Simulation buy failed:`, error);
      return false;
    }
  }

  async simulateSell(
    mint: PublicKey,
    bondingCurve: BondingCurveAccount,
    tokenAmount: bigint,
    initialVirtualTokenReserves: bigint,
    feeBasisPoints: bigint
  ): Promise<boolean> {
    const mintStr = mint.toString();
    const position = this.positions.get(mintStr);

    if (!position || position.tokenAmount < tokenAmount) {
      this.logger.warn(`Insufficient token balance for sell`);
      return false;
    }

    try {
      const amm = AMM.fromBondingCurveAccount(bondingCurve, initialVirtualTokenReserves);
      const sellResult = amm.applySell(tokenAmount);
      const price = Number(sellResult.sol_amount) / Number(sellResult.token_amount);

      // Calculate PnL
      const costBasis = position.averageEntryPrice * Number(tokenAmount);
      const saleProceeds = Number(sellResult.sol_amount) / 1e9;
      const tradePnL = saleProceeds - costBasis;
      this.totalPnL += tradePnL;

      // Record trade
      const trade: SimulationTrade = {
        type: 'SELL',
        tokenAmount: sellResult.token_amount,
        solAmount: sellResult.sol_amount,
        price,
        timestamp: Date.now()
      };

      // Update position
      const remainingTokens = position.tokenAmount - tokenAmount;
      if (remainingTokens > 0n) {
        this.positions.set(mintStr, {
          tokenAmount: remainingTokens,
          averageEntryPrice: position.averageEntryPrice,
          totalCost: position.totalCost * BigInt(Number(remainingTokens) / Number(position.tokenAmount))
        });
      } else {
        this.positions.delete(mintStr);
      }

      // Update balance
      this.currentBalance += sellResult.sol_amount;

      // Record trade
      const tokenTrades = this.trades.get(mintStr) || [];
      tokenTrades.push(trade);
      this.trades.set(mintStr, tokenTrades);

      this.logger.info(`[SIMULATION] Sell executed`, {
        mint: mintStr,
        solAmount: Number(sellResult.sol_amount) / 1e9,
        tokenAmount: Number(sellResult.token_amount) / 1e6,
        price: price,
        tradePnL: tradePnL.toFixed(4),
        totalPnL: this.totalPnL.toFixed(4),
        currentBalance: Number(this.currentBalance) / 1e9
      });

      return true;

    } catch (error) {
      this.logger.error(`Simulation sell failed:`, error);
      return false;
    }
  }

  getSimulationStats() {
    return {
      initialBalance: Number(this.initialBalance) / 1e9,
      currentBalance: Number(this.currentBalance) / 1e9,
      totalPnL: this.totalPnL,
      pnlPercentage: (this.totalPnL / (Number(this.initialBalance) / 1e9)) * 100,
      openPositions: Array.from(this.positions.entries()).map(([mint, position]) => ({
        mint,
        tokenAmount: Number(position.tokenAmount) / 1e6,
        averageEntryPrice: position.averageEntryPrice,
        totalCost: Number(position.totalCost) / 1e9
      })),
      totalTrades: Array.from(this.trades.values()).reduce((acc, trades) => acc + trades.length, 0)
    };
  }
}
