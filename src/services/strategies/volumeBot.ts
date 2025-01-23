// src/services/strategies/volumeBot.ts

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { SwapService } from '../trading/swapService';
import { TokenService } from '../token/tokenService';
import { toBN, fromBN } from '../../utils/bignumber';
import BigNumber from 'bignumber.js';

export interface VolumeStrategyConfig {
  minSolAmount: number;  // in SOL
  maxSolAmount: number;  // in SOL
  minInterval: number;   // in milliseconds
  maxInterval: number;   // in milliseconds
  targetDailyVolume: number;
  stopLoss: number;      // percentage
  tokenMint: PublicKey;  // token to trade against SOL
}

export interface VolumeStrategyCallbacks {
  onTrade?: (txid: string, isBuy: boolean, amount: bigint) => Promise<void>;
  onError?: (error: Error) => void;
}

export class VolumeBot {
  private connection: Connection;
  private swapService: SwapService;
  private tokenService: TokenService;
  private isRunning: boolean = false;
  private wallet: Keypair;
  private config: VolumeStrategyConfig;
  private callbacks?: VolumeStrategyCallbacks;
  private totalVolume: number = 0;
  private lastTradeTime: number = 0;

  constructor(
    connection: Connection,
    wallet: Keypair,
    config: VolumeStrategyConfig,
    callbacks?: VolumeStrategyCallbacks
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.config = config;
    this.callbacks = callbacks;
    this.swapService = new SwapService(connection);
    this.tokenService = new TokenService(connection);
  }

  private getRandomSolAmount(): bigint {
    const amount = this.config.minSolAmount + 
      (Math.random() * (this.config.maxSolAmount - this.config.minSolAmount));
    return BigInt(Math.floor(amount * 1e9)); // Convert to lamports
  }

  private getRandomInterval(): number {
    return this.config.minInterval + 
      Math.random() * (this.config.maxInterval - this.config.minInterval);
  }

  private async executeTrade(isBuy: boolean): Promise<void> {
    try {
      const amount = this.getRandomSolAmount();
      const solMint = new PublicKey("So11111111111111111111111111111111111111112");
      
      const [inputMint, outputMint] = isBuy 
        ? [this.config.tokenMint, solMint]
        : [solMint, this.config.tokenMint];

      console.log(`Executing ${isBuy ? 'BUY' : 'SELL'} for ${Number(amount) / 1e9} SOL`);

      const quote = await this.swapService.getQuote(
        inputMint,
        outputMint,
        Number(amount) / 1e9, // Convert lamports to SOL
        100 // 1% slippage
      );

      const txid = await this.swapService.executeSwap(quote, this.wallet);
      this.totalVolume += Number(amount) / 1e9;
      this.lastTradeTime = Date.now();
      
      await this.callbacks?.onTrade?.(txid, isBuy, amount);
      console.log(`Trade executed: ${txid}`);
    } catch (error) {
      console.error('Trade execution failed:', error);
      this.callbacks?.onError?.(error as Error);
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Volume bot already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting volume bot...');

    while (this.isRunning) {
      const isBuy = Math.random() > 0.5;
      await this.executeTrade(isBuy);

      if (this.totalVolume >= this.config.targetDailyVolume) {
        console.log('Daily volume target reached');
        this.stop();
        break;
      }

      const interval = this.getRandomInterval();
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  public stop(): void {
    this.isRunning = false;
    console.log('Stopping volume bot...');
    console.log(`Final total volume: ${this.totalVolume.toFixed(4)} SOL`);
  }

  public getStatus(): {
    isRunning: boolean;
    totalVolume: number;
    lastTradeTime: number;
  } {
    return {
      isRunning: this.isRunning,
      totalVolume: this.totalVolume,
      lastTradeTime: this.lastTradeTime,
    };
  }
}