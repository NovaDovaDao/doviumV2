import { Connection, PublicKey } from '@solana/web3.js';
import { TokenBalance } from '../../types/token';
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export class TokenBalanceService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async getPortfolioValue(owner: PublicKey): Promise<{
    totalValueUSD: number;
    balances: TokenBalance[];
  }> {
    try {
      const accounts = await this.connection.getParsedTokenAccountsByOwner(
        owner,
        { programId: TOKEN_PROGRAM_ID }
      );

      const balances: TokenBalance[] = [];
      let totalValueUSD = 0;

      for (const account of accounts.value) {
        const parsedInfo = account.account.data.parsed.info;
        const balance: TokenBalance = {
          mint: new PublicKey(parsedInfo.mint),
          owner,
          amount: BigInt(parsedInfo.tokenAmount.amount),
          decimals: parsedInfo.tokenAmount.decimals
        };
        balances.push(balance);
      }

      return {
        totalValueUSD,
        balances
      };
    } catch (error) {
      console.error('Error getting portfolio value:', error);
      return {
        totalValueUSD: 0,
        balances: []
      };
    }
  }
}
