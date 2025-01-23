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
    const minLamports = BigInt(Math.floor(this.config.minSolAmount * 1e9));
    const maxLamports = BigInt(Math.floor(this.config.maxSolAmount * 1e9));
    const range = Number(maxLamports - minLamports);
    const randomAmount = minLamports + BigInt(Math.floor(Math.random() * range));
    return randomAmount;
  }

  private getRandomInterval(): number {
    return this.config.minInterval + 
      Math.random() * (this.config.maxInterval - this.config.minInterval);
  }

  private async executeTrade(isBuy: boolean): Promise<void> {
    try {
      const solAmount = this.getRandomSolAmount();
      const solMint = new PublicKey("So11111111111111111111111111111111111111112");
    
      // Get decimals for both tokens
      const solDecimals = await this.tokenService.getTokenDecimals(solMint);
      const tokenDecimals = await this.tokenService.getTokenDecimals(this.config.tokenMint);
      
      console.log(`Executing ${isBuy ? 'BUY' : 'SELL'} for ${Number(solAmount) / Math.pow(10, solDecimals)} SOL equivalent`);

      // After a BUY, wait for token balance to be updated
      if (!isBuy) {
        let attempts = 0;
        const maxAttempts = 5;
        let tokenBalance;
        
        while (attempts < maxAttempts) {
          tokenBalance = await this.tokenService.getTokenBalance(
            this.config.tokenMint,
            this.wallet.publicKey
          );
          
          if (tokenBalance && tokenBalance.amount > BigInt(0)) {
            // Format token balance using correct decimals
            const formattedBalance = Number(tokenBalance.amount) / Math.pow(10, tokenDecimals);
            console.log(`Current token balance: ${formattedBalance} (${tokenBalance.amount.toString()} raw)`);
            break;
          }
          
          console.log('Waiting for token balance to update...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
        }
        
        if (!tokenBalance || tokenBalance.amount === BigInt(0)) {
          throw new Error('No token balance available for sell');
        }
      }

      // For both buy and sell, first get the token amount equivalent to solAmount
      const quoteForAmount = await this.swapService.getQuote(
        solMint,
        this.config.tokenMint,
        Number(solAmount) / 1e9,
        100
      );

      let amount: bigint;
      let inputMint: PublicKey;
      let outputMint: PublicKey;

      if (isBuy) {
        amount = solAmount;
        inputMint = solMint;
        outputMint = this.config.tokenMint;
      } else {
        // For sells, first get token decimals
        const tokenDecimals = await this.tokenService.getTokenDecimals(this.config.tokenMint);
        const solDecimals = await this.tokenService.getTokenDecimals(solMint);
        
        // Check current token balance
        const tokenBalance = await this.tokenService.getTokenBalance(
          this.config.tokenMint,
          this.wallet.publicKey
        );
        
        if (!tokenBalance || tokenBalance.amount === BigInt(0)) {
          console.log('No token balance available for sell');
          return;
        }
        
        // Log detailed balance information
        console.log(`Current token balance: ${Number(tokenBalance.amount) / Math.pow(10, tokenDecimals)} (${tokenBalance.amount.toString()} raw)`);
        console.log(`Attempting to sell SOL equivalent: ${Number(solAmount) / 1e9} SOL (${solAmount.toString()} lamports)`);
        
        // For selling, we need to calculate how many tokens we need to sell to get the desired SOL amount
        // First get a quote for SOL -> Token to determine the token amount
        const quoteResponse = await this.swapService.getQuote(
          solMint,
          this.config.tokenMint,
          Number(solAmount) / Math.pow(10, solDecimals),
          100
        );
        
        // Use the outAmount from the first quote to determine how many tokens to sell
        const tokenAmount = quoteResponse.expectedOutputAmount; // Already in raw units
        
        // Now get the actual sell quote using the token amount
        const sellQuote = await this.swapService.getQuote(
          this.config.tokenMint,
          solMint,
          tokenAmount, // Pass the raw amount directly as bigint
          100
        );
        
        amount = sellQuote.amount;
        inputMint = this.config.tokenMint;
        outputMint = solMint;
        
        // Verify we have enough tokens
        if (tokenBalance.amount < amount) {
          console.log(`Insufficient token balance for sell. Have: ${Number(tokenBalance.amount) / Math.pow(10, tokenDecimals)} (${tokenBalance.amount.toString()} raw), Need: ${Number(amount) / Math.pow(10, tokenDecimals)} (${amount.toString()} raw)`);
          return;
        }
        
        console.log(`Selling token amount: ${Number(amount) / Math.pow(10, tokenDecimals)} tokens (${amount.toString()} raw)`);
      }

      // Add balance checks with buffer for fees
      if (isBuy) {
        const solBalance = await this.connection.getBalance(this.wallet.publicKey);
        const requiredBalance = Number(amount) + 10000000; // Add 0.01 SOL buffer for fees
        if (solBalance < requiredBalance) {
          throw new Error(`Insufficient SOL balance. Required: ${requiredBalance/1e9} SOL, Available: ${solBalance/1e9} SOL`);
        }
      }

      // Get quote for the actual swap
      const quote = await this.swapService.getQuote(
        inputMint,
        outputMint,
        amount, // Pass the raw amount directly
        100
      );

      // Add price impact check
      if (quote.priceImpact > 5) {
        throw new Error(`Price impact too high: ${quote.priceImpact}%`);
      }

      // Add retry loop for transaction execution
      let retries = 0;
      const maxRetries = 3;
      while (retries < maxRetries) {
        try {
          const txid = await this.swapService.executeSwap(quote, this.wallet);
          
          // Update volume tracking with SOL equivalent
          this.totalVolume += Number(solAmount) / 1e9;
          this.lastTradeTime = Date.now();
          
          await this.callbacks?.onTrade?.(txid, isBuy, solAmount);
          console.log(`Trade executed successfully: ${txid}`);
          return;
        } catch (error) {
          retries++;
          if (retries === maxRetries) throw error;
          
          // Add exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
          console.log(`Retrying trade (attempt ${retries + 1}/${maxRetries})...`);
        }
      }

    } catch (error) {
      console.error('Trade execution failed:', error);
      if (error instanceof Error) {
        // Handle specific error cases
        if (error.message.includes('block height exceeded')) {
          console.log('Transaction expired, retrying with higher priority...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          return this.executeTrade(isBuy);
        }
        
        if (error.message.includes('insufficient funds')) {
          console.log('Insufficient funds, waiting for balance update...');
          await new Promise(resolve => setTimeout(resolve, 5000));
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
