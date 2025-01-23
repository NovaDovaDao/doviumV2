// src/services/token/tokenService.ts

import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getMint,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAccount
} from '@solana/spl-token';
import { TokenMetadata, TokenInfo, TokenBalance } from '../../types/token';
import BigNumber from 'bignumber.js';

export class TokenService {
  private connection: Connection;
  private decimalsCache: Map<string, number> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async getTokenDecimals(mint: PublicKey): Promise<number> {
    const mintKey = mint.toString();
    
    // Check cache first
    if (this.decimalsCache.has(mintKey)) {
      return this.decimalsCache.get(mintKey)!;
    }

    // Special case for SOL
    if (mintKey === "So11111111111111111111111111111111111111112") {
      this.decimalsCache.set(mintKey, 9);
      return 9;
    }

    try {
      const mintInfo = await getMint(this.connection, mint);
      const decimals = mintInfo.decimals;
      this.decimalsCache.set(mintKey, decimals);
      return decimals;
    } catch (error) {
      console.error(`Failed to get decimals for mint ${mintKey}:`, error);
      throw error;
    }
  }

  async getTokenBalance(
    mint: PublicKey,
    owner: PublicKey
  ): Promise<TokenBalance | null> {
    try {
      const associatedAddress = await getAssociatedTokenAddress(
        mint,
        owner,
        true,
        TOKEN_PROGRAM_ID
      );

      const account = await this.connection.getAccountInfo(associatedAddress);
      const decimals = await this.getTokenDecimals(mint);
      
      if (!account) {
        return {
          mint,
          owner,
          amount: BigInt(0),
          decimals
        };
      }

      const tokenAccount = await getAccount(this.connection, associatedAddress);

      return {
        mint,
        owner,
        amount: BigInt(tokenAccount.amount.toString()),
        decimals
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('could not find account')) {
        const decimals = await this.getTokenDecimals(mint);
        return {
          mint,
          owner,
          amount: BigInt(0),
          decimals
        };
      }
      throw new Error(`Failed to get token balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createAssociatedTokenAccount(
    mint: PublicKey,
    owner: PublicKey,
    payer: Keypair
  ): Promise<PublicKey> {
    try {
      const associatedAddress = await getAssociatedTokenAddress(
        mint,
        owner,
        true,
        TOKEN_PROGRAM_ID
      );

      const account = await this.connection.getAccountInfo(associatedAddress);
      
      if (!account) {
        const transaction = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            payer.publicKey,
            associatedAddress,
            owner,
            mint,
            TOKEN_PROGRAM_ID
          )
        );

        await this.connection.sendTransaction(transaction, [payer]);
      }

      return associatedAddress;
    } catch (error) {
      throw new Error(`Failed to create associated token account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getTokenInfo(mint: PublicKey): Promise<TokenInfo | null> {
    try {
      const mintInfo = await getMint(this.connection, mint);
      const metadata: TokenMetadata = {
        name: 'Unknown',
        symbol: 'UNKNOWN',
        decimals: mintInfo.decimals
      };

      return {
        address: mint,
        metadata,
        supply: mintInfo.supply
      };
    } catch (error) {
      throw new Error(`Failed to get token info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
