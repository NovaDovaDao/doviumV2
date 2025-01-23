// src/services/trading/swapService.ts

import { Connection, PublicKey, VersionedTransaction, Keypair } from '@solana/web3.js';
import { SwapQuote } from '../../types/trading';
import { JUPITER_QUOTE_API } from '../../utils/constants';
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
      const amountInLamports = Math.floor(amount * Math.pow(10, 9));
      
      const queryParams = {
        inputMint: inputMint.toString(),
        outputMint: outputMint.toString(),
        amount: amountInLamports.toString(),
        slippageBps: slippageBps.toString(),
        onlyDirectRoutes: 'true'
      };

      const quoteUrl = `${JUPITER_QUOTE_API}/quote?` + new URLSearchParams(queryParams);
      
      // Debug logging
      console.log('Quote request URL:', quoteUrl);
      console.log('Query parameters:', queryParams);

      const response = await fetch(quoteUrl);
      const responseText = await response.text();
      
      // Debug logging
      console.log('Response status:', response.status);
      console.log('Response text:', responseText);

      if (!response.ok) {
        throw new Error(`Quote request failed: ${response.status} ${responseText}`);
      }

      const quoteResponse = JSON.parse(responseText);
      
      // Debug logging
      console.log('Parsed quote response:', quoteResponse);

      // Check if required fields exist
      if (!quoteResponse.outAmount || !quoteResponse.inAmount) {
        throw new Error(`Invalid quote response: ${JSON.stringify(quoteResponse)}`);
      }

      return {
        inputMint,
        outputMint,
        amount: BigInt(amountInLamports),
        expectedOutputAmount: BigInt(quoteResponse.outAmount),
        slippage: slippageBps / 10000,
        priceImpact: Number(quoteResponse.priceImpactPct || 0)
      };
    } catch (error) {
      console.error('Full error details:', error);
      throw new Error(`Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async executeSwap(quote: SwapQuote, wallet: Keypair): Promise<string> {
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const swapRequestBody = {
          quoteResponse: {
            inputMint: quote.inputMint.toString(),
            inAmount: quote.amount.toString(),
            outputMint: quote.outputMint.toString(),
            outAmount: quote.expectedOutputAmount.toString(),
            otherAmountThreshold: quote.expectedOutputAmount.toString(),
            swapMode: "ExactIn",
            slippageBps: Math.floor(quote.slippage * 10000),
            platformFee: undefined,
            priceImpactPct: quote.priceImpact.toString(),
            routePlan: [{
              swapInfo: {
                ammKey: "3i8Wmd25PDifBiKjMkLELvENjjHiM3mFLUABcMeofWC2",
                label: "Raydium",
                inputMint: quote.inputMint.toString(),
                outputMint: quote.outputMint.toString(),
                inAmount: quote.amount.toString(),
                outAmount: quote.expectedOutputAmount.toString(),
                feeAmount: "0",
                feeMint: quote.inputMint.toString()
              },
              percent: 100
            }]
          },
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: {
              maxLamports: 50000000, // 0.05 SOL max fee
              priorityLevel: "veryHigh"
            }
          },
          dynamicComputeUnitLimit: true
        };

        const swapResponse = await fetch(`${JUPITER_QUOTE_API}/swap`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(swapRequestBody)
        });

        if (!swapResponse.ok) {
          throw new Error(`Swap request failed: ${swapResponse.status}`);
        }

        const { swapTransaction } = await swapResponse.json();

        // Get fresh blockhash immediately before sending
        const latestBlockhash = await this.connection.getLatestBlockhash('finalized');
        
        const transaction = VersionedTransaction.deserialize(
          Buffer.from(swapTransaction, 'base64')
        );

        transaction.sign([wallet]);

        // Send with higher priority
        const txid = await this.connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          maxRetries: 5,
          preflightCommitment: 'processed'
        });

        // Use shorter confirmation timeout
        const confirmation = await Promise.race([
          this.connection.confirmTransaction({
            signature: txid,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          }, 'processed'),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Confirmation timeout')), 30000)
          )
        ]);

        if (typeof confirmation === 'object' && confirmation.value.err) {
          if (attempt < MAX_RETRIES - 1) {
            console.log(`Transaction failed on attempt ${attempt + 1}, retrying...`);
            attempt++;
            // Shorter backoff for block height exceeded errors
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }

        return txid;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Handle specific error cases
        if (errorMessage.includes('block height exceeded') || 
            errorMessage.includes('Confirmation timeout')) {
          if (attempt < MAX_RETRIES - 1) {
            console.log(`Transaction expired on attempt ${attempt + 1}, retrying immediately...`);
            attempt++;
            continue; // Retry immediately for expired transactions
          }
        }

        if (attempt < MAX_RETRIES - 1) {
          console.log(`Error on attempt ${attempt + 1}, retrying...`, error);
          attempt++;
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
        throw new Error(`Swap execution failed: ${errorMessage}`);
      }
    }
    throw new Error('Max retries exceeded');
  }
}
