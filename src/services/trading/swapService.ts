// src/services/trading/swapService.ts

import { Connection, PublicKey, VersionedTransaction, Keypair } from '@solana/web3.js';
import { SwapQuote } from '../../types/trading';
import { JUPITER_QUOTE_API } from '../../utils/constants';
import BigNumber from 'bignumber.js';
import { TokenService } from '../token/tokenService';

export class SwapService {
  private connection: Connection;
  private tokenService: TokenService;

  constructor(connection: Connection) {
    this.connection = connection;
    this.tokenService = new TokenService(connection);
  }

  async getQuote(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number,
    slippageBps: number = 100
  ): Promise<SwapQuote> {
    try {
      const tokenInfo = await this.tokenService.getTokenInfo(inputMint);
      if (!tokenInfo) throw new Error('Could not get input token info');

      const decimals = tokenInfo.metadata.decimals;
      const amountBN = new BigNumber(amount)
        .times(new BigNumber(10).pow(decimals))
        .integerValue(BigNumber.ROUND_DOWN);

      const params = new URLSearchParams({
        inputMint: inputMint.toString(),
        outputMint: outputMint.toString(),
        amount: amountBN.toString(),
        slippageBps: slippageBps.toString()
      });

      const url = `${JUPITER_QUOTE_API}/quote?${params}`;
      console.log('Quote URL:', url);

      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Quote request failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('Quote response:', JSON.stringify(data, null, 2));

      return {
        inputMint,
        outputMint,
        amount: BigInt(amountBN.toString()),
        expectedOutputAmount: BigInt(data.outAmount),
        slippage: slippageBps / 10000,
        priceImpact: data.priceImpact
      };
    } catch (error) {
      throw new Error(`Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async executeSwap(quote: SwapQuote, wallet: Keypair): Promise<string> {
    try {
      const swapRequestBody = {
        quoteResponse: {
          ...quote,
          amount: quote.amount.toString(),
          expectedOutputAmount: quote.expectedOutputAmount.toString()
        },
        userPublicKey: wallet.publicKey.toString(),
        wrapAndUnwrapSol: true
      };

      const response = await fetch(`${JUPITER_QUOTE_API}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swapRequestBody)
      });

      if (!response.ok) {
        throw new Error(`Swap request failed: ${response.statusText}`);
      }

      const { swapTransaction } = await response.json();

      if (!swapTransaction) {
        throw new Error('No swap transaction returned');
      }

      const transaction = VersionedTransaction.deserialize(
        Buffer.from(swapTransaction, 'base64')
      );

      transaction.sign([wallet]);

      const txid = await this.connection.sendTransaction(transaction, {
        skipPreflight: true,
        maxRetries: 3
      });

      return txid;
    } catch (error) {
      throw new Error(`Swap execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}