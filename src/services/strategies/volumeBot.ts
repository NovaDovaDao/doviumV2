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
        ? [solMint, this.config.tokenMint]
        : [this.config.tokenMint, solMint];

      console.log(`Executing ${isBuy ? 'BUY' : 'SELL'} for ${Number(amount) / 1e9} SOL`);

      // Add balance check before trade
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      if (balance < Number(amount)) {
        throw new Error('Insufficient balance for trade');
      }

      const quote = await this.swapService.getQuote(
        inputMint,
        outputMint,
        Number(amount) / 1e9,
        100 // 1% slippage
      );

      // Add price impact check
      if (quote.priceImpact > 5) { // 5% max price impact
        throw new Error(`Price impact too high: ${quote.priceImpact}%`);
      }

      const txid = await this.swapService.executeSwap(quote, this.wallet);
      
      // Wait for confirmation
      const latestBlockhash = await this.connection.getLatestBlockhash();
      await this.connection.confirmTransaction({
        signature: txid,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      });

      this.totalVolume += Number(amount) / 1e9;
      this.lastTradeTime = Date.now();
      
      await this.callbacks?.onTrade?.(txid, isBuy, amount);
      console.log(`Trade executed successfully: ${txid}`);

    } catch (error) {
      console.error('Trade execution failed:', error);
      // Handle specific Jupiter API errors
      if (error instanceof Error) {
        if (error.message.includes('Unprocessable Entity') || 
            error.message.includes('Route not found') ||
            error.message.includes('insufficient funds')) {
          console.log('Retrying trade with different parameters...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          return this.executeTrade(isBuy);
        }
        
        if (error.message.includes('Transaction failed')) {
          console.log('Transaction failed, checking confirmation...');
          // Add longer delay for transaction failures
          await new Promise(resolve => setTimeout(resolve, 5000));
          return this.executeTrade(isBuy);
        }

        if (error.message.includes('Too many requests')) {
          console.log('Rate limit hit, waiting longer...');
          await new Promise(resolve => setTimeout(resolve, 10000));
          return this.executeTrade(isBuy);
        }
      }
      
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
