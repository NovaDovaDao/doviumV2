// scripts/run-bot.ts

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { VolumeBot, VolumeStrategyConfig } from '../src/services/strategies/volumeBot';
import bs58 from 'bs58';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const connection = new Connection(process.env.SOLANA_RPC_URL!);
  const wallet = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY!));

  const config: VolumeStrategyConfig = {
    minSolAmount: 0.001,
    maxSolAmount: 0.01,
    minInterval: 1000,
    maxInterval: 5000,
    targetDailyVolume: 1000,
    stopLoss: 10,
    tokenMint: new PublicKey(process.env.TOKEN_MINT!)
  };

  console.log(chalk.green('Starting Volume Bot with configuration:'));
  console.log(chalk.cyan(JSON.stringify(config, null, 2)));

  const bot = new VolumeBot(connection, wallet, config, {
    onTrade: async (txid: string, isBuy: boolean, amount: bigint) => {
      console.log(chalk.green(`\n${isBuy ? 'BUY' : 'SELL'} Transaction Executed`));
      console.log(chalk.blue(`Amount: ${Number(amount) / 1e9} SOL`));
      console.log(chalk.magenta(`TX: https://solscan.io/tx/${txid}`));
    },
    onError: (error: Error) => {
      console.log(chalk.red('Error occurred:'), error.message);
    },
  });

  process.on('SIGINT', () => {
    console.log(chalk.yellow('\nGracefully shutting down...'));
    bot.stop();
    process.exit();
  });

  await bot.start();
}

main().catch(console.error);